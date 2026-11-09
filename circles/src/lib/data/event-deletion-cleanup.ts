import { ObjectId } from "mongodb";
import type { Event, Feed, Post } from "@/models/models";

type EventCleanupSource = Pick<Event, "_id" | "circleId" | "commentPostId">;

export type PreparedEventDeletionCleanup = {
    eventId: string;
    shadowPostIds: string[];
};

export type EventDeletionCleanupDependencies = {
    findPostById: (postId: string) => Promise<Post | null>;
    findShadowCandidates: (eventId: string) => Promise<Post[]>;
    findFeedById: (feedId: string) => Promise<Feed | null>;
    isPostReferencedElsewhere: (postId: string, eventId: string) => Promise<boolean>;
    deletePost: (postId: string) => Promise<void>;
};

const normalizeId = (value: unknown): string | null => {
    if (!(typeof value === "string" || value instanceof ObjectId) || !ObjectId.isValid(String(value))) return null;
    return new ObjectId(String(value)).toHexString();
};

const sameId = (left: unknown, right: unknown): boolean => {
    const normalizedLeft = normalizeId(left);
    const normalizedRight = normalizeId(right);
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

const defaultDependencies: EventDeletionCleanupDependencies = {
    findPostById: async (postId) => {
        const { Posts } = await import("./db");
        return Posts.findOne({ _id: new ObjectId(postId) });
    },
    findShadowCandidates: async (eventId) => {
        const { Posts } = await import("./db");
        const canonicalEventId = new ObjectId(eventId);
        return Posts.find({
            parentItemType: "event",
            parentItemId: { $in: [canonicalEventId.toHexString(), canonicalEventId] },
            postType: { $in: ["event", "discussion"] },
        } as never).toArray();
    },
    findFeedById: async (feedId) => {
        const { Feeds } = await import("./db");
        return Feeds.findOne({ _id: new ObjectId(feedId) });
    },
    isPostReferencedElsewhere: async (postId, eventId) => {
        const { Events, Posts, Tasks, Goals, Issues, Proposals } = await import("./db");
        const sources = [Events, Tasks, Goals, Issues, Proposals];
        const matches = await Promise.all([
            ...sources.map((collection) =>
                collection.findOne(
                    collection === Events
                        ? ({ _id: { $ne: new ObjectId(eventId) }, commentPostId: postId } as never)
                        : ({ commentPostId: postId } as never),
                    { projection: { _id: 1 } },
                ),
            ),
            Posts.findOne(
                {
                    _id: { $ne: new ObjectId(postId) },
                    $or: [{ sharedPostId: postId }, { internalPreviewType: "post", internalPreviewId: postId }],
                } as never,
                { projection: { _id: 1 } },
            ),
        ]);
        return matches.some(Boolean);
    },
    deletePost: async (postId) => {
        const { deletePost } = await import("./feed");
        await deletePost(postId);
    },
};

function validateShadowPost(event: EventCleanupSource, post: Post, feed: Feed | null): string {
    const eventId = normalizeId(event._id);
    const postId = normalizeId(post._id);
    const eventCircleId = normalizeId(event.circleId);
    const postFeedId = normalizeId(post.feedId);
    const feedId = normalizeId(feed?._id);
    const feedCircleId = normalizeId(feed?.circleId);

    const valid = Boolean(
        eventId &&
            postId &&
            eventCircleId &&
            postFeedId &&
            feedId &&
            feedCircleId &&
            postFeedId === feedId &&
            feedCircleId === eventCircleId &&
            feed?.handle === "default" &&
            post.parentItemType === "event" &&
            sameId(post.parentItemId, eventId) &&
            (post.postType === "event" || post.postType === "discussion"),
    );

    if (!valid || !postId) throw new Error("Event comment shadow ownership could not be verified.");
    return postId;
}

export async function prepareEventDeletionCleanup(
    event: EventCleanupSource,
    dependencies: EventDeletionCleanupDependencies = defaultDependencies,
): Promise<PreparedEventDeletionCleanup> {
    const eventId = normalizeId(event._id);
    if (!eventId) throw new Error("Invalid event identity.");

    const candidatesById = new Map<string, Post>();
    if (event.commentPostId) {
        if (!ObjectId.isValid(event.commentPostId)) throw new Error("Invalid Event comment shadow reference.");
        const linkedPost = await dependencies.findPostById(event.commentPostId);
        if (linkedPost) candidatesById.set(new ObjectId(event.commentPostId).toHexString(), linkedPost);
    }
    for (const candidate of await dependencies.findShadowCandidates(eventId)) {
        const candidateId = normalizeId(candidate._id);
        if (!candidateId) throw new Error("Invalid Event comment shadow identity.");
        candidatesById.set(candidateId, candidate);
    }

    const shadowPostIds: string[] = [];
    for (const candidate of candidatesById.values()) {
        const feedId = normalizeId(candidate.feedId);
        if (!feedId) throw new Error("Event comment shadow feed could not be verified.");
        const postId = validateShadowPost(event, candidate, await dependencies.findFeedById(feedId));
        if (await dependencies.isPostReferencedElsewhere(postId, eventId)) {
            throw new Error("Event comment shadow is referenced by another resource.");
        }
        shadowPostIds.push(postId);
    }

    return { eventId, shadowPostIds };
}

export async function executePreparedEventDeletionCleanup(
    prepared: PreparedEventDeletionCleanup,
    dependencies: EventDeletionCleanupDependencies = defaultDependencies,
): Promise<void> {
    for (const postId of prepared.shadowPostIds) {
        if (await dependencies.isPostReferencedElsewhere(postId, prepared.eventId)) {
            throw new Error("Event comment shadow became cross-linked before cleanup.");
        }
        await dependencies.deletePost(postId);
    }
}
