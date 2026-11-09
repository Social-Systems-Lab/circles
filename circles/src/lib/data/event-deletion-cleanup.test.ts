import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Event, Feed, Post } from "@/models/models";
import {
    executePreparedEventDeletionCleanup,
    prepareEventDeletionCleanup,
    type EventDeletionCleanupDependencies,
} from "./event-deletion-cleanup";
import { orchestrateEventDestructiveLifecycle } from "./event-destructive-lifecycle-orchestration";

const eventId = new ObjectId();
const circleId = new ObjectId();
const feedId = new ObjectId();
const postId = new ObjectId();

const event = {
    _id: eventId,
    circleId: circleId.toHexString(),
    commentPostId: postId.toHexString(),
    images: [{ fileInfo: { url: "https://kamooni.org/storage/example/image.jpg" } }],
} as Event;

const post = {
    _id: postId,
    feedId: feedId.toHexString(),
    parentItemType: "event",
    parentItemId: eventId.toHexString(),
    postType: "event",
} as Post;

const feed = { _id: feedId, circleId: circleId.toHexString(), handle: "default" } as Feed;

const dependencies = (overrides: Partial<EventDeletionCleanupDependencies> = {}): EventDeletionCleanupDependencies => ({
    findPostById: async () => post,
    findShadowCandidates: async () => [],
    findFeedById: async () => feed,
    isPostReferencedElsewhere: async () => false,
    deletePost: async () => undefined,
    ...overrides,
});

async function main() {
    const prepared = await prepareEventDeletionCleanup(event, dependencies());
    assert.deepEqual(prepared, {
        eventId: eventId.toHexString(),
        shadowPostIds: [postId.toHexString()],
    });
    assert.equal("mediaUrls" in prepared, false, "Event deletion does not prepare MinIO media deletion");

    await assert.rejects(
        prepareEventDeletionCleanup(event, dependencies({ isPostReferencedElsewhere: async () => true })),
        /referenced by another resource/,
    );
    await assert.rejects(
        prepareEventDeletionCleanup(
            event,
            dependencies({
                findPostById: async () => ({ ...post, parentItemId: new ObjectId().toHexString() }) as Post,
            }),
        ),
        /ownership could not be verified/,
    );
    await assert.rejects(
        prepareEventDeletionCleanup(
            event,
            dependencies({ findFeedById: async () => ({ ...feed, circleId: new ObjectId().toHexString() }) as Feed }),
        ),
        /ownership could not be verified/,
    );

    let deleted = 0;
    await executePreparedEventDeletionCleanup(
        prepared,
        dependencies({
            deletePost: async (id) => {
                assert.equal(id, postId.toHexString());
                deleted++;
            },
        }),
    );
    assert.equal(deleted, 1);

    await assert.rejects(
        executePreparedEventDeletionCleanup(prepared, dependencies({ isPostReferencedElsewhere: async () => true })),
        /became cross-linked/,
    );

    let sourceDeleted = false;
    let postCleanupRan = false;
    const partial = await orchestrateEventDestructiveLifecycle({
        cleanupNoticeboards: async () => ({
            status: "success",
            attemptedTargetCount: 0,
            deletedCount: 0,
            deletedHostCircleIds: [],
            deletedPostIds: [],
            uncertainHostCircleId: null,
            uncertainPostId: null,
            remainingEntriesByCircleId: {},
            destructiveEffectsPossible: false,
            context: {
                eventId: eventId.toHexString(),
                entriesByCircleId: {},
                requestedHostCircleIds: [circleId.toHexString()],
            } as never,
        }),
        mutateSource: async () => {
            sourceDeleted = true;
            return true;
        },
        afterSourceMutation: async () => {
            postCleanupRan = true;
            throw new Error("post cleanup failed");
        },
        revalidate: () => undefined,
    });
    assert.equal(sourceDeleted, true);
    assert.equal(postCleanupRan, true);
    assert.equal(partial.status, "partial-success");
    if (partial.status === "partial-success") assert.equal(partial.sourceMutationCompleted, true);

    console.log("event deletion cleanup tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
