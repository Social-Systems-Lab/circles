import { ObjectId } from "mongodb";
import type { Event, Feed, Post } from "@/models/models";
import { isEventShadowBound } from "./event-alternate-comment-policy";
import { resolveWritableEventHosts } from "./event-host-write-policy";
import { resolveReadablePostContext, type ReadablePostContext } from "./post-access-policy";

type ShadowPostInput = Omit<Post, "_id">;

export type EventShadowOrchestrationDependencies = {
    loadEvent: (eventId: ObjectId) => Promise<Event | null>;
    resolveHosts: typeof resolveWritableEventHosts;
    canManage: (actorDid: string, event: Event) => Promise<boolean>;
    resolveShadow: (postId: string, actorDid: string) => Promise<ReadablePostContext | null>;
    findPrimaryFeed: (circleId: string) => Promise<Feed | null>;
    createShadow: (data: ShadowPostInput) => Promise<Post>;
    linkCommentPostIdIfMissing: (eventId: ObjectId, commentPostId: string) => Promise<boolean>;
    isCandidateReferenced: (commentPostId: string) => Promise<boolean>;
    deleteCreatedShadow: (commentPostId: string) => Promise<void>;
    reportCleanupFailure: (commentPostId: string, error: unknown) => void;
};

const defaultDependencies: EventShadowOrchestrationDependencies = {
    loadEvent: async (eventId) => {
        const { Events } = await import("./db");
        return Events.findOne({ _id: eventId });
    },
    resolveHosts: resolveWritableEventHosts,
    canManage: async (actorDid, event) => {
        const { canManageEvent } = await import("./event");
        return canManageEvent(actorDid, event);
    },
    resolveShadow: resolveReadablePostContext,
    findPrimaryFeed: async (circleId) => {
        const { Feeds } = await import("./db");
        return Feeds.findOne({ circleId, handle: "default" });
    },
    createShadow: async (data) => {
        const { createPost } = await import("./feed");
        return createPost(data);
    },
    linkCommentPostIdIfMissing: async (eventId, commentPostId) => {
        const { Events } = await import("./db");
        const result = await Events.updateOne(
            { _id: eventId, $or: [{ commentPostId: { $exists: false } }, { commentPostId: null }] } as never,
            { $set: { commentPostId } },
        );
        return result.modifiedCount === 1;
    },
    isCandidateReferenced: async (commentPostId) => {
        const { Events, Tasks, Goals, Issues, Proposals } = await import("./db");
        for (const collection of [Events, Tasks, Goals, Issues, Proposals]) {
            if (await collection.findOne({ commentPostId } as never, { projection: { _id: 1 } })) return true;
        }
        return false;
    },
    deleteCreatedShadow: async (commentPostId) => {
        const { deletePost } = await import("./feed");
        await deletePost(commentPostId);
    },
    reportCleanupFailure: (commentPostId, error) =>
        console.error(`Failed to clean Event fallback Comment shadow ${commentPostId}`, error),
};

const normalizeId = (value: unknown): string | null => {
    if (!(typeof value === "string" || value instanceof ObjectId) || !ObjectId.isValid(String(value))) return null;
    return new ObjectId(String(value)).toHexString();
};

const cleanupCreatedCandidate = async (
    createdId: string,
    currentCommentPostId: unknown,
    dependencies: EventShadowOrchestrationDependencies,
): Promise<void> => {
    if (normalizeId(currentCommentPostId) === createdId) return;
    try {
        if (await dependencies.isCandidateReferenced(createdId)) return;
        await dependencies.deleteCreatedShadow(createdId);
    } catch (error) {
        dependencies.reportCleanupFailure(createdId, error);
    }
};

const resolveStrictWinner = async (
    event: Event | null,
    canonicalEventId: string,
    actorDid: string,
    dependencies: EventShadowOrchestrationDependencies,
): Promise<string | null> => {
    if (!event || normalizeId(event._id) !== canonicalEventId) return null;
    const winnerId = normalizeId(event.commentPostId);
    if (!winnerId) return null;
    const context = await dependencies.resolveShadow(winnerId, actorDid);
    return context && isEventShadowBound(event, context) ? winnerId : null;
};

const reloadStrictWinner = async (
    canonicalEventId: ObjectId,
    actorDid: string,
    dependencies: EventShadowOrchestrationDependencies,
): Promise<{ event: Event | null; winnerId: string | null }> => {
    let event: Event | null = null;
    try {
        event = await dependencies.loadEvent(canonicalEventId);
        const winnerId = await resolveStrictWinner(event, canonicalEventId.toHexString(), actorDid, dependencies);
        return { event, winnerId };
    } catch (error) {
        console.error(`Failed to reload Event fallback Comment-shadow winner ${canonicalEventId}`, error);
        return { event, winnerId: null };
    }
};

/** Production fallback orchestration. The primary shadow owner is derived only from the canonical Event. */
export async function ensureCanonicalEventShadow(
    eventId: string,
    actorDid: string,
    dependencies: EventShadowOrchestrationDependencies = defaultDependencies,
): Promise<string | null> {
    if (!ObjectId.isValid(eventId)) return null;
    const canonicalEventId = new ObjectId(eventId);
    const event = await dependencies.loadEvent(canonicalEventId);
    if (!event) return null;

    let resolvedHosts;
    try {
        resolvedHosts = await dependencies.resolveHosts(event, actorDid);
    } catch {
        return null;
    }
    if (!(await dependencies.canManage(actorDid, event))) return null;

    const primaryCircleId = String(event.circleId);
    if (resolvedHosts.hostCircleIds[0] !== primaryCircleId) return null;

    if (event.commentPostId) {
        const context = await dependencies.resolveShadow(event.commentPostId, actorDid);
        return context && isEventShadowBound(event, context) ? event.commentPostId : null;
    }

    const feed = await dependencies.findPrimaryFeed(primaryCircleId);
    const feedId = normalizeId(feed?._id);
    if (!feed || !feedId || feed.handle !== "default" || normalizeId(feed.circleId) !== primaryCircleId) return null;
    const shadowPost = await dependencies.createShadow({
        feedId,
        createdBy: event.createdBy,
        createdAt: new Date(),
        content: `Event: ${event.title}`,
        postType: "event",
        parentItemId: String(event._id),
        parentItemType: "event",
        userGroups: event.userGroups || [],
        comments: 0,
        reactions: {},
    });
    const commentPostId = normalizeId(shadowPost?._id);
    if (!commentPostId) return null;

    try {
        if (await dependencies.linkCommentPostIdIfMissing(canonicalEventId, commentPostId)) return commentPostId;
    } catch (error) {
        console.error(`Failed to conditionally link Event fallback Comment shadow ${commentPostId}`, error);
        const { event: freshEvent, winnerId } = await reloadStrictWinner(canonicalEventId, actorDid, dependencies);
        if (winnerId === commentPostId) return commentPostId;
        await cleanupCreatedCandidate(commentPostId, freshEvent?.commentPostId, dependencies);
        return winnerId;
    }

    const { event: freshEvent, winnerId } = await reloadStrictWinner(canonicalEventId, actorDid, dependencies);
    await cleanupCreatedCandidate(commentPostId, freshEvent?.commentPostId, dependencies);
    return winnerId;
}
