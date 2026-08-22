import { ObjectId } from "mongodb";
import type { Circle, CommentDisplay, Feature, Feed, Member, Post } from "@/models/models";
import { canReadCircle } from "./circle-visibility-policy";
import { getPostViewFeature } from "./constants";
import { canReadPostSource } from "./post-source-access-policy";

export type ReadablePostContext = { post: Post; feed: Feed; circle: Circle };
export const POST_UNAVAILABLE_MESSAGE = "Post unavailable";

type PostAccessDependencies = {
    findPost: (postId: ObjectId) => Promise<Post | null>;
    findFeed: (feedId: ObjectId) => Promise<Feed | null>;
    findCircle: (circleId: ObjectId) => Promise<Circle | null>;
    findMember: (viewerDid: string, circleId: string) => Promise<Member | null>;
    findAuthor: (createdBy: string) => Promise<Circle | null>;
    authorizeFeature: (viewerDid: string | undefined, circleId: string, post: Post) => Promise<boolean>;
    canReadSource?: (post: Post, viewerDid?: string) => Promise<boolean>;
};

const defaultPostAccessDependencies: PostAccessDependencies = {
    findPost: async (postId) => {
        const { Posts } = await import("./db");
        return (await Posts.findOne({ _id: postId })) as Post | null;
    },
    findFeed: async (feedId) => {
        const { Feeds } = await import("./db");
        return (await Feeds.findOne({ _id: feedId })) as Feed | null;
    },
    findCircle: async (circleId) => {
        const { Circles } = await import("./db");
        return (await Circles.findOne({ _id: circleId })) as Circle | null;
    },
    findMember: async (viewerDid, circleId) => {
        const { Members } = await import("./db");
        return (await Members.findOne({ userDid: viewerDid, circleId })) as Member | null;
    },
    findAuthor: async (createdBy) => {
        const { Circles } = await import("./db");
        return (await Circles.findOne({ did: createdBy })) as Circle | null;
    },
    authorizeFeature: async (viewerDid, circleId, post) => {
        const feature = getPostViewFeature(post.postType);
        if (!feature) return false;
        const { isAuthorized } = await import("@/lib/auth/auth");
        return isAuthorized(viewerDid, circleId, feature);
    },
    canReadSource: canReadPostSource,
};

const normalizeObjectId = (value: unknown): ObjectId | null => {
    if (typeof value !== "string" || !ObjectId.isValid(value)) return null;
    return new ObjectId(value);
};

export async function resolveReadablePostContext(
    postId: string,
    viewerDid?: string,
    dependencies: PostAccessDependencies = defaultPostAccessDependencies,
): Promise<ReadablePostContext | null> {
    const postObjectId = normalizeObjectId(postId);
    if (!postObjectId) return null;
    const post = await dependencies.findPost(postObjectId);
    if (!post) return null;

    const feedObjectId = normalizeObjectId(post.feedId);
    if (!feedObjectId) return null;
    const feed = await dependencies.findFeed(feedObjectId);
    if (!feed) return null;

    const circleObjectId = normalizeObjectId(feed.circleId);
    if (!circleObjectId) return null;
    const circle = await dependencies.findCircle(circleObjectId);
    if (!circle || circle._id?.toString() !== circleObjectId.toHexString()) return null;

    const readable = await canReadCircle(viewerDid, circle, {
        getMember: async (did, circleId) => dependencies.findMember(did, circleId),
    });
    if (!readable) return null;

    if (post.postType === "community" && !circle.enabledModules?.includes("community")) return null;
    if (post.postType === "discussion" && !circle.enabledModules?.includes("discussions")) return null;
    if (!(await dependencies.authorizeFeature(viewerDid, circleObjectId.toHexString(), post))) return null;

    const author = await dependencies.findAuthor(post.createdBy);
    if (!author || (!author.isVerified && !author.isMember && post.createdBy !== viewerDid)) return null;

    if (post.userGroups?.length && !post.userGroups.includes("everyone")) {
        if (!viewerDid) return null;
        const membership = await dependencies.findMember(viewerDid, circleObjectId.toHexString());
        const groups = membership?.userGroups ?? [];
        if (!post.userGroups.some((group) => groups.includes(group))) return null;
    }

    if (!(await (dependencies.canReadSource ?? canReadPostSource)(post, viewerDid))) return null;

    return {
        post: { ...post, _id: post._id?.toString() },
        feed: { ...feed, _id: feed._id?.toString() },
        circle: { ...circle, _id: circle._id?.toString() },
    };
}

export const buildAuthorizedPostHydrationMatch = (postId: string, feedId: string, postType?: Post["postType"]) => {
    const postObjectId = normalizeObjectId(postId);
    const feedObjectId = normalizeObjectId(feedId);
    if (!postObjectId || !feedObjectId) return null;
    return {
        _id: postObjectId,
        feedId: feedObjectId.toHexString(),
        ...(postType ? { postType } : {}),
    };
};

type ReadableCommentsDependencies = {
    resolveContext: typeof resolveReadablePostContext;
    loadComments: (postId: string, viewerDid?: string) => Promise<CommentDisplay[]>;
};

const defaultReadableCommentsDependencies: ReadableCommentsDependencies = {
    resolveContext: resolveReadablePostContext,
    loadComments: async (postId, viewerDid) => {
        const { getAllComments } = await import("./feed");
        return (await getAllComments(postId, viewerDid)) as CommentDisplay[];
    },
};

export async function getReadablePostComments(
    postId: string,
    viewerDid?: string,
    dependencies: ReadableCommentsDependencies = defaultReadableCommentsDependencies,
): Promise<{ success: boolean; comments?: CommentDisplay[]; message?: string }> {
    const context = await dependencies.resolveContext(postId, viewerDid);
    if (!context) return { success: false, message: POST_UNAVAILABLE_MESSAGE };
    const comments = await dependencies.loadComments(postId, viewerDid);
    return { success: true, comments };
}

type PublicUserFeedDependencies = {
    findTargetUser: (targetDid: string) => Promise<Circle | null>;
    findTargetFeed: (targetDid: string) => Promise<Feed | null>;
    canReadTargetCircle: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
};

const defaultPublicUserFeedDependencies: PublicUserFeedDependencies = {
    findTargetUser: async (targetDid) => {
        const { getUserByDid } = await import("./user");
        return getUserByDid(targetDid);
    },
    findTargetFeed: async (targetDid) => {
        const { getPublicUserFeed } = await import("./feed");
        return getPublicUserFeed(targetDid);
    },
    canReadTargetCircle: canReadCircle,
};

export async function resolvePublicUserFeed(
    targetDid: unknown,
    viewerDid?: string,
    dependencies: PublicUserFeedDependencies = defaultPublicUserFeedDependencies,
): Promise<Feed | null> {
    if (typeof targetDid !== "string" || targetDid.trim().length === 0) return null;
    const target = await dependencies.findTargetUser(targetDid);
    if (!target || target.did !== targetDid || target.circleType !== "user") return null;
    if (!(await dependencies.canReadTargetCircle(viewerDid, target))) return null;
    return dependencies.findTargetFeed(targetDid);
}

type ReadableDiscussionListDependencies = {
    findCircleByHandle: (handle: string) => Promise<Circle | null>;
    canReadOwner: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
    authorizeDiscussionView: (viewerDid: string | undefined, circleId: string) => Promise<boolean>;
    findDefaultFeed: (circleId: string) => Promise<Feed | null>;
    listDiscussions: (circleId: string, feedId: string) => Promise<Post[]>;
};

const defaultReadableDiscussionListDependencies: ReadableDiscussionListDependencies = {
    findCircleByHandle: async (handle) => {
        const { getCircleByHandle } = await import("./circle");
        return getCircleByHandle(handle);
    },
    canReadOwner: canReadCircle,
    authorizeDiscussionView: async (viewerDid, circleId) => {
        const { isAuthorized } = await import("@/lib/auth/auth");
        const { features } = await import("./constants");
        return isAuthorized(viewerDid, circleId, features.discussions.view);
    },
    findDefaultFeed: async (circleId) => {
        const { getFeedByHandle } = await import("./feed");
        return getFeedByHandle(circleId, "default");
    },
    listDiscussions: async (circleId, feedId) => {
        const { listDiscussionsByCircle } = await import("./discussion");
        return listDiscussionsByCircle(circleId, feedId);
    },
};

export async function listReadableDiscussions(
    handle: string,
    viewerDid?: string,
    dependencies: ReadableDiscussionListDependencies = defaultReadableDiscussionListDependencies,
): Promise<Post[]> {
    const circle = await dependencies.findCircleByHandle(handle);
    if (!circle || !(await dependencies.canReadOwner(viewerDid, circle))) return [];
    const circleId = circle._id?.toString();
    if (!circleId || !ObjectId.isValid(circleId) || !circle.enabledModules?.includes("discussions")) return [];
    if (!(await dependencies.authorizeDiscussionView(viewerDid, circleId))) return [];
    const feed = await dependencies.findDefaultFeed(circleId);
    const feedId = feed?._id?.toString();
    if (!feedId || !ObjectId.isValid(feedId) || feed?.circleId !== circleId) return [];
    return dependencies.listDiscussions(circleId, feedId);
}

export const getCanonicalDiscussionOwnerCircleId = (
    discussion: Partial<Post> & { circleId?: unknown; feed?: Partial<Feed> },
): string | null => {
    const circleId = normalizeObjectId(discussion.circleId)?.toHexString();
    const feedId = normalizeObjectId(discussion.feedId)?.toHexString();
    const canonicalFeedId = discussion.feed?._id?.toString();
    if (!circleId || !feedId || !canonicalFeedId || !ObjectId.isValid(canonicalFeedId)) return null;
    if (new ObjectId(canonicalFeedId).toHexString() !== feedId || discussion.feed?.circleId !== circleId) return null;
    return circleId;
};

export async function canPerformCanonicalDiscussionAction(
    discussion: Partial<Post> & { circleId?: unknown; feed?: Partial<Feed> },
    viewerDid: string,
    feature: Feature,
    authorize: (viewerDid: string, circleId: string, feature: Feature) => Promise<boolean> = async (
        did,
        circleId,
        requestedFeature,
    ) => {
        const { isAuthorized } = await import("@/lib/auth/auth");
        return isAuthorized(did, circleId, requestedFeature);
    },
): Promise<boolean> {
    const circleId = getCanonicalDiscussionOwnerCircleId(discussion);
    return circleId ? authorize(viewerDid, circleId, feature) : false;
}

type ReadableFeedDependencies = {
    findReadableCircleIds: (viewerDid?: string) => Promise<string[]>;
    findMemberFeedExcludedCircleIds: () => Promise<string[]>;
    findFeeds: (filter: Record<string, unknown>) => Promise<Feed[]>;
    findMemberships: (viewerDid: string) => Promise<Array<Pick<Member, "circleId" | "userGroups">>>;
};

const defaultReadableFeedDependencies: ReadableFeedDependencies = {
    findReadableCircleIds: async (viewerDid) => {
        const { Circles } = await import("./db");
        const { getViewerCircleDiscoveryQuery } = await import("./circle-visibility-policy");
        const query = await getViewerCircleDiscoveryQuery(viewerDid);
        return (await Circles.find(query, { projection: { _id: 1 } }).toArray()).map((circle) => circle._id.toString());
    },
    findFeeds: async (filter) => {
        const { Feeds } = await import("./db");
        return Feeds.find(filter as never).toArray();
    },
    findMemberFeedExcludedCircleIds: async () => {
        const { Circles } = await import("./db");
        return (await Circles.find({ handle: "default" }, { projection: { _id: 1 } }).toArray()).map((circle) =>
            circle._id.toString(),
        );
    },
    findMemberships: async (viewerDid) => {
        const { Members } = await import("./db");
        return Members.find({ userDid: viewerDid }, { projection: { circleId: 1, userGroups: 1 } }).toArray();
    },
};

export async function getViewerReadableFeedIds(
    viewerDid: string | undefined,
    mode: "public" | "member",
    dependencies: ReadableFeedDependencies = defaultReadableFeedDependencies,
): Promise<string[]> {
    const readableCircleIds = new Set(await dependencies.findReadableCircleIds(viewerDid));
    if (readableCircleIds.size === 0) return [];

    if (mode === "public") {
        const feeds = await dependencies.findFeeds({
            circleId: { $in: [...readableCircleIds] },
            userGroups: "everyone",
        });
        return feeds
            .map((feed) => feed._id?.toString())
            .filter((feedId): feedId is string => Boolean(feedId && ObjectId.isValid(feedId)));
    }

    if (!viewerDid) return [];
    const excludedCircleIds = new Set(await dependencies.findMemberFeedExcludedCircleIds());
    const memberships = await dependencies.findMemberships(viewerDid);
    const groupsByCircle = new Map(
        memberships
            .filter(
                (membership) =>
                    readableCircleIds.has(membership.circleId) && !excludedCircleIds.has(membership.circleId),
            )
            .map((membership) => [membership.circleId, membership.userGroups ?? []]),
    );
    if (groupsByCircle.size === 0) return [];
    const feeds = await dependencies.findFeeds({ circleId: { $in: [...groupsByCircle.keys()] } });
    return feeds
        .filter((feed) => feed.userGroups.some((group) => groupsByCircle.get(feed.circleId)?.includes(group)))
        .map((feed) => feed._id?.toString())
        .filter((feedId): feedId is string => Boolean(feedId && ObjectId.isValid(feedId)));
}

export async function resolveFeedActionViewerDid(
    _claimedViewerDid?: string,
    authenticate: () => Promise<string | undefined> = async () => {
        const { resolveAuthenticatedViewerDid } = await import("@/lib/auth/authenticated-viewer");
        const { getAuthenticatedUserDid } = await import("@/lib/auth/auth");
        return resolveAuthenticatedViewerDid(getAuthenticatedUserDid);
    },
): Promise<string | undefined> {
    return authenticate();
}
