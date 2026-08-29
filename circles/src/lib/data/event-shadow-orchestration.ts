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
    updateCommentPostId: (eventId: ObjectId, commentPostId: string) => Promise<boolean>;
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
        return Feeds.findOne({ circleId });
    },
    createShadow: async (data) => {
        const { createPost } = await import("./feed");
        return createPost(data);
    },
    updateCommentPostId: async (eventId, commentPostId) => {
        const { Events } = await import("./db");
        const result = await Events.updateOne({ _id: eventId }, { $set: { commentPostId } });
        return result.modifiedCount === 1;
    },
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
    if (!feed?._id) return null;
    const shadowPost = await dependencies.createShadow({
        feedId: String(feed._id),
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
    if (!shadowPost?._id) return null;

    const commentPostId = String(shadowPost._id);
    return (await dependencies.updateCommentPostId(canonicalEventId, commentPostId)) ? commentPostId : null;
}
