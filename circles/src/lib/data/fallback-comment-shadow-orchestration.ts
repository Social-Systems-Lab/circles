import { ObjectId } from "mongodb";
import type { Circle, Feature, Feed, Goal, Issue, Member, Post, Proposal, Task } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { canReadCircle } from "./circle-visibility-policy";
import { features } from "./constants";

export type FallbackCommentShadowType = "task" | "goal" | "issue" | "proposal";
type FallbackSource = Task | Goal | Issue | Proposal;
type ShadowInput = Omit<Post, "_id">;

const policies: Record<
    FallbackCommentShadowType,
    {
        feature: Feature;
        viewFeature: Feature;
        module: string;
        label: (source: FallbackSource) => string;
        usesUserGroups: boolean;
    }
> = {
    task: {
        feature: features.tasks.comment,
        viewFeature: features.tasks.view,
        module: "tasks",
        label: (source) => (source as Task).title,
        usesUserGroups: true,
    },
    goal: {
        feature: features.goals.comment,
        viewFeature: features.goals.view,
        module: "goals",
        label: (source) => (source as Goal).title,
        usesUserGroups: false,
    },
    issue: {
        feature: features.issues.comment,
        viewFeature: features.issues.view,
        module: "issues",
        label: (source) => (source as Issue).title,
        usesUserGroups: false,
    },
    // Proposal detail comments intentionally retain the repository's feed.comment fallback.
    proposal: {
        feature: features.feed.comment,
        viewFeature: features.proposals.view,
        module: "proposals",
        label: (source) => (source as Proposal).name,
        usesUserGroups: true,
    },
};

export type FallbackCommentShadowDependencies = {
    loadSource: (type: FallbackCommentShadowType, id: ObjectId) => Promise<FallbackSource | null>;
    loadCircle: (id: ObjectId) => Promise<Circle | null>;
    canReadCircle: (actorDid: string, circle: Circle) => Promise<boolean>;
    isAuthorized: (actorDid: string, circleId: string, feature: Feature) => Promise<boolean>;
    loadMembership: (actorDid: string, circleId: string) => Promise<Member | null>;
    findCanonicalFeed: (circleId: string) => Promise<Feed | null>;
    loadPost: (id: ObjectId) => Promise<Post | null>;
    loadFeed: (id: ObjectId) => Promise<Feed | null>;
    createShadow: (input: ShadowInput) => Promise<Post>;
    linkIfMissing: (type: FallbackCommentShadowType, sourceId: ObjectId, postId: string) => Promise<boolean>;
    reloadSource: (type: FallbackCommentShadowType, sourceId: ObjectId) => Promise<FallbackSource | null>;
    isCandidateReferenced: (postId: string) => Promise<boolean>;
    deleteCreatedShadow: (postId: string) => Promise<void>;
    reportCleanupFailure: (postId: string, error: unknown) => void;
};

const collectionFor = async (type: FallbackCommentShadowType) => {
    const { Tasks, Goals, Issues, Proposals } = await import("./db");
    return { task: Tasks, goal: Goals, issue: Issues, proposal: Proposals }[type];
};

const defaultDependencies: FallbackCommentShadowDependencies = {
    loadSource: async (type, id) => (await collectionFor(type)).findOne({ _id: id }) as Promise<FallbackSource | null>,
    reloadSource: async (type, id) =>
        (await collectionFor(type)).findOne({ _id: id }) as Promise<FallbackSource | null>,
    loadCircle: async (id) => {
        const { Circles } = await import("./db");
        return Circles.findOne({ _id: id });
    },
    canReadCircle,
    isAuthorized: async (actorDid, circleId, feature) => {
        const { isAuthorized } = await import("@/lib/auth/auth");
        return isAuthorized(actorDid, circleId, feature);
    },
    loadMembership: async (actorDid, circleId) => {
        const { getMember } = await import("./member");
        return getMember(actorDid, circleId);
    },
    findCanonicalFeed: async (circleId) => {
        const { Feeds } = await import("./db");
        return Feeds.findOne({ circleId, handle: "default" });
    },
    loadPost: async (id) => {
        const { Posts } = await import("./db");
        return Posts.findOne({ _id: id });
    },
    loadFeed: async (id) => {
        const { Feeds } = await import("./db");
        return Feeds.findOne({ _id: id });
    },
    createShadow: async (input) => {
        const { createPost } = await import("./feed");
        return createPost(input);
    },
    linkIfMissing: async (type, sourceId, postId) => {
        const collection = await collectionFor(type);
        const result = await collection.updateOne(
            { _id: sourceId, $or: [{ commentPostId: { $exists: false } }, { commentPostId: null }] } as never,
            { $set: { commentPostId: postId } },
        );
        return result.modifiedCount === 1;
    },
    isCandidateReferenced: async (postId) => {
        const { Tasks, Goals, Issues, Proposals } = await import("./db");
        const collections = [Tasks, Goals, Issues, Proposals];
        for (const collection of collections) {
            if (await collection.findOne({ commentPostId: postId } as never, { projection: { _id: 1 } })) return true;
        }
        return false;
    },
    deleteCreatedShadow: async (postId) => {
        const { deletePost } = await import("./feed");
        await deletePost(postId);
    },
    reportCleanupFailure: (postId, error) => console.error(`Failed to clean fallback Comment shadow ${postId}`, error),
};

const normalizeId = (value: unknown): string | null => {
    if (!(typeof value === "string" || value instanceof ObjectId) || !ObjectId.isValid(String(value))) return null;
    return new ObjectId(String(value)).toHexString();
};

const isStrictShadow = async (
    type: FallbackCommentShadowType,
    sourceId: string,
    canonicalCircleId: string,
    canonicalFeed: Feed,
    postId: string,
    dependencies: FallbackCommentShadowDependencies,
): Promise<boolean> => {
    if (!canonicalFeed._id) return false;
    const canonicalFeedId = normalizeId(canonicalFeed._id);
    if (!canonicalFeedId || canonicalFeed.circleId !== canonicalCircleId) return false;
    const normalizedPostId = normalizeId(postId);
    if (!normalizedPostId) return false;
    const post = await dependencies.loadPost(new ObjectId(normalizedPostId));
    if (!post || normalizeId(post._id) !== normalizedPostId || normalizeId(post.feedId) !== canonicalFeedId)
        return false;
    const feed = await dependencies.loadFeed(new ObjectId(canonicalFeedId));
    return Boolean(
        feed &&
            normalizeId(feed._id) === canonicalFeedId &&
            feed.circleId === canonicalCircleId &&
            post.postType === type &&
            post.parentItemType === type &&
            normalizeId(post.parentItemId) === sourceId &&
            post.sourceResourceType === undefined &&
            post.sourceResourceId === undefined &&
            post.internalPreviewType === undefined &&
            post.internalPreviewId === undefined,
    );
};

const canReadSource = async (
    type: FallbackCommentShadowType,
    source: FallbackSource,
    actorDid: string,
    canonicalCircleId: string,
    dependencies: FallbackCommentShadowDependencies,
): Promise<boolean> => {
    const policy = policies[type];
    if (!(await dependencies.isAuthorized(actorDid, canonicalCircleId, policy.viewFeature))) return false;
    if (!policy.usesUserGroups || !source.userGroups?.length || source.userGroups.includes("everyone")) return true;
    const membership = await dependencies.loadMembership(actorDid, canonicalCircleId);
    if (membership?.userDid !== actorDid || membership.circleId !== canonicalCircleId) return false;
    return (membership.userGroups ?? []).some((group) => source.userGroups?.includes(group));
};

const cleanupCreatedCandidate = async (
    createdId: string,
    dependencies: FallbackCommentShadowDependencies,
): Promise<void> => {
    try {
        if (await dependencies.isCandidateReferenced(createdId)) return;
        await dependencies.deleteCreatedShadow(createdId);
    } catch (error) {
        dependencies.reportCleanupFailure(createdId, error);
    }
};

/** Shared production seam for Task/Goal/Issue/Proposal fallback Comment shadows. */
export async function orchestrateFallbackCommentShadow(
    type: FallbackCommentShadowType,
    sourceIdInput: string,
    callerCircleIdInput: string,
    actorDid: string,
    dependencies: FallbackCommentShadowDependencies = defaultDependencies,
): Promise<string | null> {
    const sourceId = normalizeId(sourceIdInput);
    const callerCircleId = normalizeId(callerCircleIdInput);
    if (!actorDid || !sourceId || !callerCircleId) return null;

    const source = await dependencies.loadSource(type, new ObjectId(sourceId));
    if (!source || normalizeId(source._id) !== sourceId) return null;
    const canonicalCircleId = normalizeId(source.circleId);
    if (!canonicalCircleId || callerCircleId !== canonicalCircleId) return null;

    const circle = await dependencies.loadCircle(new ObjectId(canonicalCircleId));
    if (!circle || normalizeId(circle._id) !== canonicalCircleId) return null;
    if (!(await dependencies.canReadCircle(actorDid, circle))) return null;
    if (!(await canReadSource(type, source, actorDid, canonicalCircleId, dependencies))) return null;
    if (!canWriteCircleByLifecycle(circle)) return null;

    const policy = policies[type];
    if (!circle.enabledModules?.includes(policy.module)) return null;
    if (!(await dependencies.isAuthorized(actorDid, canonicalCircleId, policy.feature))) return null;

    const feed = await dependencies.findCanonicalFeed(canonicalCircleId);
    const canonicalFeedId = normalizeId(feed?._id);
    if (!feed || !canonicalFeedId || feed.handle !== "default" || feed.circleId !== canonicalCircleId) return null;

    if (source.commentPostId) {
        return (await isStrictShadow(type, sourceId, canonicalCircleId, feed, source.commentPostId, dependencies))
            ? normalizeId(source.commentPostId)
            : null;
    }

    const created = await dependencies.createShadow({
        feedId: canonicalFeedId,
        createdBy: source.createdBy,
        createdAt: new Date(),
        content: `${type[0].toUpperCase()}${type.slice(1)}: ${policy.label(source)}`,
        postType: type,
        parentItemId: sourceId,
        parentItemType: type,
        userGroups: source.userGroups || [],
        comments: 0,
        reactions: {},
    });
    const createdId = normalizeId(created?._id);
    if (!createdId) return null;
    try {
        if (await dependencies.linkIfMissing(type, new ObjectId(sourceId), createdId)) return createdId;
    } catch (error) {
        console.error(`Failed to link fallback Comment shadow ${createdId}`, error);
        await cleanupCreatedCandidate(createdId, dependencies);
        return null;
    }

    const winner = await dependencies.reloadSource(type, new ObjectId(sourceId));
    const winnerId = winner?.commentPostId ? normalizeId(winner.commentPostId) : null;
    const winnerIsCanonical = Boolean(
        winner &&
            normalizeId(winner._id) === sourceId &&
            winnerId &&
            (await isStrictShadow(type, sourceId, canonicalCircleId, feed, winnerId, dependencies)),
    );
    // Only this attempt's createPost result is eligible for cleanup. A fresh cross-source
    // reference guard also protects ambiguous writes and future linkage paths.
    await cleanupCreatedCandidate(createdId, dependencies);
    return winnerIsCanonical ? winnerId : null;
}
