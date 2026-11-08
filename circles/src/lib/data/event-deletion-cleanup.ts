import { ObjectId } from "mongodb";
import type { Event, Feed, Post, PrivateMedia } from "@/models/models";
import { classifyOwnedMediaUrl, deleteCircleOwnedMedia } from "./circle-media-storage";
import { parsePrivateMediaUrl } from "./private-media";

type EventCleanupSource = Pick<Event, "_id" | "circleId" | "commentPostId" | "images">;

export type PreparedEventDeletionCleanup = {
    eventId: string;
    circleId: string;
    shadowPostIds: string[];
    mediaUrls: string[];
};

export type EventDeletionCleanupDependencies = {
    findPostById: (postId: string) => Promise<Post | null>;
    findShadowCandidates: (eventId: string) => Promise<Post[]>;
    findFeedById: (feedId: string) => Promise<Feed | null>;
    isPostReferencedElsewhere: (postId: string, eventId: string) => Promise<boolean>;
    findPrivateMediaRecord: (mediaId: string) => Promise<PrivateMedia | null>;
    hasMediaReferenceOutsideEvent: (url: string, eventId: string) => Promise<boolean>;
    deletePost: (postId: string) => Promise<void>;
    deleteMedia: (url: string, expectedCircleId: string) => Promise<void>;
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
    findPrivateMediaRecord: async (mediaId) => {
        const { PrivateMediaCollection } = await import("./db");
        return PrivateMediaCollection.findOne({ _id: new ObjectId(mediaId) });
    },
    hasMediaReferenceOutsideEvent: async (url, eventId) => {
        const {
            Events,
            Posts,
            Circles,
            Tasks,
            Goals,
            Issues,
            Proposals,
            FundingAsks,
            ChatMessages,
            ChatMessageDocs,
            ChatRooms,
            ChatConversations,
            MembershipRequests,
            HumanityVerifications,
            db,
        } = await import("./db");
        const canonicalEventId = new ObjectId(eventId);
        const matches = await Promise.all([
            Events.findOne({ _id: { $ne: canonicalEventId }, "images.fileInfo.url": url } as never, {
                projection: { _id: 1 },
            }),
            Posts.findOne({ $or: [{ "media.fileInfo.url": url }, { "linkPreviewImage.url": url }] } as never, {
                projection: { _id: 1 },
            }),
            Circles.findOne(
                {
                    $or: [
                        { "picture.url": url },
                        { picture: url },
                        { "cover.url": url },
                        { cover: url },
                        { "images.fileInfo.url": url },
                    ],
                } as never,
                { projection: { _id: 1 } },
            ),
            Tasks.findOne({ "images.fileInfo.url": url } as never, { projection: { _id: 1 } }),
            Goals.findOne({ $or: [{ "images.fileInfo.url": url }, { "resultImages.fileInfo.url": url }] } as never, {
                projection: { _id: 1 },
            }),
            Issues.findOne({ "images.fileInfo.url": url } as never, { projection: { _id: 1 } }),
            Proposals.findOne({ "images.fileInfo.url": url } as never, { projection: { _id: 1 } }),
            FundingAsks.findOne({ "coverImage.url": url } as never, { projection: { _id: 1 } }),
            ChatMessages.findOne({ "attachments.url": url } as never, { projection: { _id: 1 } }),
            ChatMessageDocs.findOne({ "attachments.url": url } as never, { projection: { _id: 1 } }),
            ChatMessageDocs.findOne({ "system.senderAvatarUrl": url } as never, { projection: { _id: 1 } }),
            ChatRooms.findOne({ "picture.url": url } as never, { projection: { _id: 1 } }),
            ChatConversations.findOne(
                {
                    $or: [{ "picture.url": url }, { "metadata.senderAvatarUrl": url }],
                } as never,
                { projection: { _id: 1 } },
            ),
            MembershipRequests.findOne({ picture: url } as never, { projection: { _id: 1 } }),
            HumanityVerifications.findOne({ "messages.attachments.url": url } as never, { projection: { _id: 1 } }),
            db
                .collection("verificationMessages")
                .findOne({ "attachments.url": url } as never, { projection: { _id: 1 } }),
        ]);
        return matches.some(Boolean);
    },
    deletePost: async (postId) => {
        const { deletePost } = await import("./feed");
        await deletePost(postId);
    },
    deleteMedia: (url, expectedCircleId) => deleteCircleOwnedMedia({ url, expectedCircleId }),
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

async function mediaIsOwnedByEvent(
    eventId: string,
    circleId: string,
    url: string,
    dependencies: EventDeletionCleanupDependencies,
): Promise<boolean> {
    const classified = classifyOwnedMediaUrl(url);
    if (classified.kind === "external") return false;

    if (classified.kind === "public") return false;

    const mediaId = parsePrivateMediaUrl(url);
    if (!mediaId) return false;
    const record = await dependencies.findPrivateMediaRecord(mediaId);
    if (!record || record.ownerType !== "circle" || record.resourceType !== "event") return false;
    if (normalizeId(record.circleId) !== normalizeId(circleId)) return false;
    return Boolean(record.resourceId && normalizeId(record.resourceId) === normalizeId(eventId));
}

export async function prepareEventDeletionCleanup(
    event: EventCleanupSource,
    dependencies: EventDeletionCleanupDependencies = defaultDependencies,
): Promise<PreparedEventDeletionCleanup> {
    const eventId = normalizeId(event._id);
    const circleId = normalizeId(event.circleId);
    if (!eventId || !circleId) throw new Error("Invalid event identity.");

    const candidatesById = new Map<string, Post>();
    if (event.commentPostId) {
        if (!ObjectId.isValid(event.commentPostId)) throw new Error("Invalid Event comment shadow reference.");
        const linkedPost = await dependencies.findPostById(event.commentPostId);
        if (linkedPost) {
            candidatesById.set(new ObjectId(event.commentPostId).toHexString(), linkedPost);
        } else {
            console.warn(
                `Event ${eventId} references missing comment shadow ${event.commentPostId}; continuing deletion.`,
            );
        }
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

    const mediaUrls = Array.from(
        new Set(
            (event.images || [])
                .map((image) => image.fileInfo?.url)
                .filter((url): url is string => typeof url === "string" && url.length > 0),
        ),
    );
    const deletableMediaUrls: string[] = [];
    for (const url of mediaUrls) {
        if (!(await mediaIsOwnedByEvent(eventId, event.circleId, url, dependencies))) continue;
        if (await dependencies.hasMediaReferenceOutsideEvent(url, eventId)) continue;
        deletableMediaUrls.push(url);
    }

    return { eventId, circleId, shadowPostIds, mediaUrls: deletableMediaUrls };
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

    for (const url of prepared.mediaUrls) {
        if (await dependencies.hasMediaReferenceOutsideEvent(url, prepared.eventId)) continue;
        await dependencies.deleteMedia(url, prepared.circleId);
    }
}
