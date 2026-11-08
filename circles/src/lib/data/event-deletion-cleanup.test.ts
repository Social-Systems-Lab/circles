import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Event, Feed, Post } from "@/models/models";
import {
    executePreparedEventDeletionCleanup,
    prepareEventDeletionCleanup,
    type EventDeletionCleanupDependencies,
} from "./event-deletion-cleanup";

const eventId = new ObjectId();
const circleId = new ObjectId();
const feedId = new ObjectId();
const shadowId = new ObjectId();
const orphanShadowId = new ObjectId();
const foreignPostId = new ObjectId();

const event = {
    _id: eventId,
    circleId: circleId.toHexString(),
    commentPostId: shadowId.toHexString(),
    images: [
        {
            name: "cover",
            type: "image/png",
            fileInfo: { url: `/storage/${circleId.toHexString()}/cover.png` },
        },
    ],
} as Event;

const feed = {
    _id: feedId,
    circleId: circleId.toHexString(),
    handle: "default",
} as Feed;

const shadowPost = (id: ObjectId, overrides: Partial<Post> = {}): Post =>
    ({
        _id: id,
        feedId: feedId.toHexString(),
        createdBy: "did:example:creator",
        createdAt: new Date(),
        content: "Event: Example",
        postType: "event",
        parentItemType: "event",
        parentItemId: eventId.toHexString(),
        reactions: {},
        comments: 0,
        userGroups: [],
        ...overrides,
    }) as Post;

const dependencies = (overrides: Partial<EventDeletionCleanupDependencies> = {}): EventDeletionCleanupDependencies => ({
    findPostById: async (id) => (id === shadowId.toHexString() ? shadowPost(shadowId) : null),
    findShadowCandidates: async () => [shadowPost(shadowId), shadowPost(orphanShadowId)],
    findFeedById: async () => feed,
    isPostReferencedElsewhere: async () => false,
    findPrivateMediaRecord: async () => null,
    hasMediaReferenceOutsideEvent: async () => false,
    deletePost: async () => undefined,
    deleteMedia: async () => undefined,
    ...overrides,
});

async function main() {
    let prepared = await prepareEventDeletionCleanup(event, dependencies());
    assert.deepEqual(prepared.shadowPostIds.sort(), [shadowId.toHexString(), orphanShadowId.toHexString()].sort());
    assert.deepEqual(prepared.mediaUrls, [], "public event media is always retained");

    const deletedPosts: string[] = [];
    const deletedMedia: Array<{ url: string; circleId: string }> = [];
    const privateMediaId = new ObjectId();
    prepared = await prepareEventDeletionCleanup(
        {
            ...event,
            images: [
                {
                    name: "private",
                    type: "image/png",
                    fileInfo: { url: `/private-media/${privateMediaId.toHexString()}` },
                },
            ],
        },
        dependencies({
            findPrivateMediaRecord: async () =>
                ({
                    _id: privateMediaId,
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: `circle/${circleId.toHexString()}/private.png`,
                    ownerType: "circle",
                    circleId: circleId.toHexString(),
                    resourceType: "event",
                    resourceId: eventId.toHexString(),
                }) as never,
        }),
    );
    await executePreparedEventDeletionCleanup(
        prepared,
        dependencies({
            deletePost: async (id) => {
                deletedPosts.push(id);
            },
            deleteMedia: async (url, expectedCircleId) => {
                deletedMedia.push({ url, circleId: expectedCircleId });
            },
        }),
    );
    assert.deepEqual(deletedPosts.sort(), prepared.shadowPostIds.sort(), "all validated shadow posts are deleted");
    assert.deepEqual(
        deletedMedia,
        [{ url: `/private-media/${privateMediaId.toHexString()}`, circleId: circleId.toHexString() }],
        "event-owned, unreferenced private media is deleted through the owning circle",
    );

    await assert.rejects(
        prepareEventDeletionCleanup(
            { ...event, commentPostId: foreignPostId.toHexString() },
            dependencies({
                findPostById: async () => shadowPost(foreignPostId, { parentItemId: new ObjectId().toHexString() }),
            }),
        ),
        /ownership could not be verified/,
        "a malformed comment-shadow reference fails closed",
    );
    await assert.rejects(
        prepareEventDeletionCleanup({ ...event, commentPostId: "not-an-object-id" }, dependencies()),
        /Invalid Event comment shadow reference/,
        "an invalid comment-shadow identity fails closed",
    );

    await assert.rejects(
        prepareEventDeletionCleanup(event, dependencies({ isPostReferencedElsewhere: async () => true })),
        /referenced by another resource/,
        "a cross-linked comment shadow fails closed",
    );

    const sharedPrivatePrepared = await prepareEventDeletionCleanup(
        {
            ...event,
            images: [
                {
                    name: "shared-private",
                    type: "image/png",
                    fileInfo: { url: `/private-media/${privateMediaId.toHexString()}` },
                },
            ],
        },
        dependencies({
            findPrivateMediaRecord: async () =>
                ({
                    _id: privateMediaId,
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: `circle/${circleId.toHexString()}/private.png`,
                    ownerType: "circle",
                    circleId: circleId.toHexString(),
                    resourceType: "event",
                    resourceId: eventId.toHexString(),
                }) as never,
            hasMediaReferenceOutsideEvent: async () => true,
        }),
    );
    assert.deepEqual(sharedPrivatePrepared.mediaUrls, [], "shared private media is never scheduled for deletion");

    prepared = await prepareEventDeletionCleanup(
        {
            ...event,
            images: [
                {
                    name: "private",
                    type: "image/png",
                    fileInfo: { url: `/private-media/${privateMediaId.toHexString()}` },
                },
            ],
        },
        dependencies({
            findPrivateMediaRecord: async () =>
                ({
                    _id: privateMediaId,
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: `circle/${circleId.toHexString()}/private.png`,
                    ownerType: "circle",
                    circleId: circleId.toHexString(),
                    resourceType: "event",
                    resourceId: eventId.toHexString(),
                }) as never,
        }),
    );
    assert.deepEqual(
        prepared.mediaUrls,
        [`/private-media/${privateMediaId.toHexString()}`],
        "private media owned by this event is scheduled",
    );

    prepared = await prepareEventDeletionCleanup(
        {
            ...event,
            images: [
                {
                    name: "foreign-private",
                    type: "image/png",
                    fileInfo: { url: `/private-media/${privateMediaId.toHexString()}` },
                },
            ],
        },
        dependencies({
            findPrivateMediaRecord: async () =>
                ({
                    _id: privateMediaId,
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: `circle/${circleId.toHexString()}/foreign.png`,
                    ownerType: "circle",
                    circleId: circleId.toHexString(),
                    resourceType: "event",
                    resourceId: new ObjectId().toHexString(),
                }) as never,
        }),
    );
    assert.deepEqual(prepared.mediaUrls, [], "private media owned by another event is never scheduled");

    prepared = await prepareEventDeletionCleanup(
        {
            ...event,
            images: [
                {
                    name: "unattributed-private",
                    type: "image/png",
                    fileInfo: { url: `/private-media/${privateMediaId.toHexString()}` },
                },
            ],
        },
        dependencies({
            findPrivateMediaRecord: async () =>
                ({
                    _id: privateMediaId,
                    storageClass: "private",
                    bucket: "circles-private",
                    objectKey: `circle/${circleId.toHexString()}/private.png`,
                    ownerType: "circle",
                    circleId: circleId.toHexString(),
                    resourceType: "event",
                }) as never,
        }),
    );
    assert.deepEqual(prepared.mediaUrls, [], "private media without event-specific ownership is retained");

    const missingShadowId = new ObjectId();
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message?: unknown) => warnings.push(String(message));
    try {
        prepared = await prepareEventDeletionCleanup(
            { ...event, commentPostId: missingShadowId.toHexString() },
            dependencies({ findShadowCandidates: async () => [] }),
        );
    } finally {
        console.warn = originalWarn;
    }
    assert.deepEqual(prepared.shadowPostIds, [], "a stale missing comment-shadow target is allowed");
    assert.match(warnings[0] || "", /references missing comment shadow/, "the stale target is logged");

    console.log("event deletion cleanup tests passed");
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
