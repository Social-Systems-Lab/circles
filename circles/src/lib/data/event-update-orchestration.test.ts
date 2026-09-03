import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { deleteEventMediaWithFailurePropagation, orchestrateEventUpdate } from "./event-update-orchestration";
import {
    hasStoredEventNoticeboardReferences,
    shouldOrchestrateEventNoticeboardUpdate,
} from "./event-noticeboard-binding-orchestration";

const eventId = new ObjectId();
const circles = [new ObjectId(), new ObjectId(), new ObjectId()];
const feeds = circles.map((circleId) => ({ _id: new ObjectId(), handle: "default", circleId }));
const posts = circles.map((_, index) => ({
    _id: new ObjectId(),
    feedId: feeds[index]._id,
    title: `Public Post ${index}`,
    content: `Unrelated public content ${index}`,
    postType: "post",
    internalPreviewType: "event",
    internalPreviewId: eventId,
    parentItemType: "event",
    parentItemId: eventId,
}));
const counts = () => ({
    upload: 0,
    imageDelete: 0,
    eventUpdate: 0,
    postUpdate: 0,
    postCreate: 0,
    postDelete: 0,
    backlink: 0,
    revalidate: 0,
});
type Trace = {
    updatedPostIds: string[];
    createdHostIds: string[];
    createdPostId: string;
    backlinkMap?: Record<string, string>;
    primaryPostId?: string;
};
const trace = (): Trace => ({
    updatedPostIds: [],
    createdHostIds: [],
    createdPostId: new ObjectId().toHexString(),
});
const productionBranchDecision = ({
    publicationRequested,
    noticeboardPostId,
    noticeboardPostIdsByCircleId,
}: {
    publicationRequested: boolean;
    noticeboardPostId?: unknown;
    noticeboardPostIdsByCircleId?: unknown;
}) =>
    shouldOrchestrateEventNoticeboardUpdate({
        publicationRequested,
        hasStoredNoticeboardState: hasStoredEventNoticeboardReferences({
            noticeboardPostId,
            noticeboardPostIdsByCircleId,
        }),
    });
const run = (c: ReturnType<typeof counts>, overrides: Record<string, unknown> = {}, observed = trace()) =>
    orchestrateEventUpdate({
        eventId,
        primaryCircleId: circles[0],
        existingHostCircleIds: circles,
        requestedHostCircleIds: circles,
        noticeboardPostId: posts[0]._id,
        noticeboardPostIdsByCircleId: Object.fromEntries(
            circles.map((id, index) => [id.toHexString(), posts[index]._id.toHexString()]),
        ),
        shouldSynchronizeNoticeboard: true,
        noticeboardPublicationRequested: true,
        findPostById: async (id) => posts.find((post) => post._id.equals(id)) || null,
        findFeedById: async (id) => feeds.find((feed) => feed._id.equals(id)) || null,
        uploadMedia: async () => {
            c.upload++;
            return [];
        },
        deleteOldMedia: async () => {
            c.imageDelete++;
        },
        updateEvent: async () => {
            c.eventUpdate++;
            return true;
        },
        synchronizeHost: async (hostCircleId, binding) => {
            if (binding) {
                c.postUpdate++;
                observed.updatedPostIds.push(binding.postId);
            } else {
                c.postCreate++;
                observed.createdHostIds.push(hostCircleId);
            }
            return binding?.postId || observed.createdPostId;
        },
        deleteValidatedPost: async () => {
            c.postDelete++;
        },
        writeNoticeboardBacklinks: async (map, primaryPostId) => {
            c.backlink++;
            observed.backlinkMap = { ...map };
            observed.primaryPostId = primaryPostId;
        },
        revalidate: () => {
            c.revalidate++;
        },
        ...overrides,
    });

async function main() {
    let c = counts();
    let observed = trace();
    assert.equal((await run(c, {}, observed)).status, "success");
    assert.deepEqual(
        c,
        {
            upload: 1,
            imageDelete: 1,
            eventUpdate: 1,
            postUpdate: 3,
            postCreate: 0,
            postDelete: 0,
            backlink: 1,
            revalidate: 1,
        },
        "valid retained IDs are all reused",
    );
    assert.deepEqual(
        observed.updatedPostIds,
        posts.map((post) => post._id.toHexString()),
        "all retained updates target the exact validated Post IDs",
    );
    for (const [index, circle] of circles.entries()) {
        assert.equal(observed.backlinkMap?.[circle.toHexString()], posts[index]._id.toHexString());
    }
    assert.equal(observed.primaryPostId, observed.backlinkMap?.[circles[0].toHexString()]);
    c = counts();
    const corrupt = { ...posts[2], internalPreviewId: new ObjectId() };
    assert.equal(
        (
            await run(c, {
                findPostById: async (id: ObjectId) =>
                    id.equals(posts[2]._id) ? corrupt : posts.find((post) => post._id.equals(id)) || null,
            })
        ).status,
        "noticeboard-unavailable",
    );
    assert.deepEqual(c, counts(), "one corrupt of many has zero effects");
    c = counts();
    const corruptContentBefore = { title: posts[2].title, content: posts[2].content };
    assert.equal(
        productionBranchDecision({
            publicationRequested: false,
            noticeboardPostId: posts[0]._id,
            noticeboardPostIdsByCircleId: Object.fromEntries(
                circles.map((id, index) => [id.toHexString(), posts[index]._id.toHexString()]),
            ),
        }),
        true,
        "production branch selects orchestration for false checkbox with stored state",
    );
    assert.equal(
        (
            await run(c, {
                noticeboardPublicationRequested: false,
                findPostById: async (id: ObjectId) =>
                    id.equals(posts[2]._id) ? corrupt : posts.find((post) => post._id.equals(id)) || null,
            })
        ).status,
        "noticeboard-unavailable",
    );
    assert.deepEqual(c, counts(), "false checkbox cannot bypass corrupt stored-reference preflight");
    assert.deepEqual(
        { title: posts[2].title, content: posts[2].content },
        corruptContentBefore,
        "false-checkbox denial preserves unrelated Post content",
    );
    c = counts();
    assert.equal(
        productionBranchDecision({
            publicationRequested: false,
            noticeboardPostId: posts[0]._id,
            noticeboardPostIdsByCircleId: Object.fromEntries(
                circles.map((id, index) => [id.toHexString(), posts[index]._id.toHexString()]),
            ),
        }),
        true,
        "production branch selects explicit-unpublish preflight for valid stored state",
    );
    assert.equal((await run(c, { noticeboardPublicationRequested: false })).status, "success");
    assert.equal(c.postDelete, 3, "valid explicit unpublish deletes every validated Post");
    assert.equal(c.eventUpdate, 1);
    assert.equal(c.backlink, 1, "backlinks clear only after cleanup succeeds");
    assert.equal(
        productionBranchDecision({ publicationRequested: false }),
        false,
        "production branch leaves false-checkbox updates without stored state on the plain path",
    );
    for (const noticeboardPostIdsByCircleId of ["", "   ", [], 0, false]) {
        c = counts();
        assert.equal(
            productionBranchDecision({ publicationRequested: false, noticeboardPostIdsByCircleId }),
            true,
            "production branch selects orchestration for malformed stored map state",
        );
        assert.equal(
            (
                await run(c, {
                    noticeboardPublicationRequested: false,
                    noticeboardPostId: undefined,
                    noticeboardPostIdsByCircleId,
                })
            ).status,
            "noticeboard-unavailable",
            "malformed stored map fails closed through the real resolver",
        );
        assert.deepEqual(c, counts(), "malformed false-checkbox state has zero effects");
    }
    class FakeMap {}
    for (const noticeboardPostIdsByCircleId of [
        new Date(),
        new Map(),
        new Set(),
        new Number(0),
        new String(""),
        new Boolean(false),
        new FakeMap(),
    ]) {
        c = counts();
        const storedState = { noticeboardPostId: posts[0]._id, noticeboardPostIdsByCircleId };
        assert.equal(
            productionBranchDecision({ publicationRequested: false, ...storedState }),
            true,
            "false checkbox plus malformed object map selects orchestration",
        );
        assert.equal(
            (
                await run(c, {
                    noticeboardPublicationRequested: false,
                    ...storedState,
                })
            ).status,
            "noticeboard-unavailable",
            "malformed object map fails closed through the real resolver",
        );
        assert.deepEqual(c, counts(), "malformed object map has exact zero effects");
        assert.equal(
            storedState.noticeboardPostIdsByCircleId,
            noticeboardPostIdsByCircleId,
            "malformed stored map is not rewritten",
        );
        assert.equal(storedState.noticeboardPostId, posts[0]._id, "stored primary is not rewritten");
    }
    c = counts();
    const unrelatedBefore = { title: posts[2].title, content: posts[2].content };
    assert.equal(
        (
            await run(c, {
                findFeedById: async (id: ObjectId) =>
                    id.equals(feeds[2]._id)
                        ? { ...feeds[2], circleId: circles[1] }
                        : feeds.find((feed) => feed._id.equals(id)) || null,
            })
        ).status,
        "noticeboard-unavailable",
    );
    assert.deepEqual(c, counts(), "cross-Circle binding has zero effects");
    assert.deepEqual(
        { title: posts[2].title, content: posts[2].content },
        unrelatedBefore,
        "unrelated public Post content is unchanged",
    );
    c = counts();
    assert.equal(
        (
            await run(c, {
                findPostById: async (id: ObjectId) =>
                    id.equals(posts[1]._id)
                        ? { ...posts[1], postType: "post", internalPreviewType: "post" }
                        : posts.find((post) => post._id.equals(id)) || null,
            })
        ).status,
        "noticeboard-unavailable",
    );
    assert.deepEqual(c, counts(), "same-Circle unrelated Post has zero effects");
    c = counts();
    assert.equal(
        (
            await run(c, {
                findPostById: async (id: ObjectId) =>
                    id.equals(posts[1]._id)
                        ? { ...posts[1], internalPreviewId: new ObjectId(), parentItemId: new ObjectId() }
                        : posts.find((post) => post._id.equals(id)) || null,
            })
        ).status,
        "noticeboard-unavailable",
    );
    assert.deepEqual(c, counts(), "wrong Event noticeboard has zero effects");
    c = counts();
    assert.equal((await run(c, { noticeboardPostId: undefined })).status, "noticeboard-unavailable");
    assert.deepEqual(c, counts(), "map-only primary has zero effects");
    c = counts();
    assert.equal((await run(c, { noticeboardPostId: new ObjectId() })).status, "noticeboard-unavailable");
    assert.deepEqual(c, counts(), "primary/map disagreement has zero effects");
    c = counts();
    observed = trace();
    assert.equal(
        (await run(c, { existingHostCircleIds: circles, requestedHostCircleIds: circles.slice(0, 2) }, observed))
            .status,
        "success",
    );
    assert.equal(c.postDelete, 1, "removed host cleanup deletes only its validated Post");
    assert.equal(observed.backlinkMap?.[circles[2].toHexString()], undefined, "removed host map key is pruned");
    assert.equal(c.postUpdate, 2, "retained hosts continue normal synchronization");
    c = counts();
    observed = trace();
    assert.equal(
        (
            await run(
                c,
                {
                    existingHostCircleIds: circles.slice(0, 2),
                    requestedHostCircleIds: circles,
                    noticeboardPostIdsByCircleId: Object.fromEntries(
                        circles.slice(0, 2).map((id, index) => [id.toHexString(), posts[index]._id.toHexString()]),
                    ),
                },
                observed,
            )
        ).status,
        "success",
    );
    assert.deepEqual(c, {
        upload: 1,
        imageDelete: 1,
        eventUpdate: 1,
        postUpdate: 2,
        postCreate: 1,
        postDelete: 0,
        backlink: 1,
        revalidate: 1,
    });
    assert.deepEqual(
        observed.updatedPostIds,
        posts.slice(0, 2).map((post) => post._id.toHexString()),
    );
    assert.deepEqual(observed.createdHostIds, [circles[2].toHexString()]);
    assert.equal(observed.backlinkMap?.[circles[2].toHexString()], observed.createdPostId);
    assert.equal(observed.primaryPostId, observed.backlinkMap?.[circles[0].toHexString()]);
    c = counts();
    assert.equal(
        (
            await run(c, {
                existingHostCircleIds: circles.slice(0, 2),
                requestedHostCircleIds: circles,
            })
        ).status,
        "success",
    );
    assert.equal(c.postUpdate, 3, "valid stale entry for an added host is reused");
    assert.equal(c.postCreate, 0);
    c = counts();
    const corruptStale = { ...posts[2], internalPreviewId: new ObjectId() };
    assert.equal(
        (
            await run(c, {
                existingHostCircleIds: circles.slice(0, 2),
                requestedHostCircleIds: circles,
                findPostById: async (id: ObjectId) =>
                    id.equals(posts[2]._id) ? corruptStale : posts.find((post) => post._id.equals(id)) || null,
            })
        ).status,
        "noticeboard-unavailable",
    );
    assert.deepEqual(c, counts(), "invalid stored entry for re-added host has zero effects and no replacement");
    c = counts();
    observed = trace();
    assert.equal(
        (
            await run(
                c,
                {
                    existingHostCircleIds: [circles[0]],
                    requestedHostCircleIds: [circles[0]],
                    noticeboardPostIdsByCircleId: undefined,
                },
                observed,
            )
        ).status,
        "success",
        "legacy primary-only binding synchronizes successfully",
    );
    assert.equal(c.postUpdate, 1);
    assert.equal(c.postCreate, 0);
    assert.equal(c.postDelete, 0);
    assert.deepEqual(observed.updatedPostIds, [posts[0]._id.toHexString()]);
    assert.equal(observed.backlinkMap?.[circles[0].toHexString()], posts[0]._id.toHexString());
    assert.equal(observed.primaryPostId, posts[0]._id.toHexString());
    c = counts();
    observed = trace();
    assert.equal(
        (
            await run(
                c,
                {
                    existingHostCircleIds: [circles[0]],
                    requestedHostCircleIds: [circles[0]],
                    noticeboardPostIdsByCircleId: {},
                },
                observed,
            )
        ).status,
        "success",
        "legacy primary with explicit empty map synchronizes successfully",
    );
    assert.equal(c.postUpdate, 1);
    assert.equal(c.postCreate, 0);
    assert.equal(c.postDelete, 0);
    assert.deepEqual(observed.updatedPostIds, [posts[0]._id.toHexString()]);
    assert.equal(observed.backlinkMap?.[circles[0].toHexString()], posts[0]._id.toHexString());
    assert.equal(observed.primaryPostId, posts[0]._id.toHexString());
    c = counts();
    assert.equal(
        (
            await run(c, {
                findPostById: async (id: ObjectId) => {
                    const post = posts.find((candidate) => candidate._id.equals(id));
                    if (!post) return null;
                    const { parentItemType: _type, parentItemId: _id, ...legacy } = post;
                    return legacy;
                },
            })
        ).status,
        "success",
        "legacy no-parent noticeboards synchronize",
    );
    assert.equal(c.postUpdate, 3);
    c = counts();
    observed = trace();
    assert.equal(
        (
            await run(c, {
                synchronizeHost: async (_hostCircleId: string, binding: { postId: string } | undefined) => {
                    c.postUpdate++;
                    if (c.postUpdate === 2) throw new Error("write failed");
                    observed.updatedPostIds.push(binding!.postId);
                    return binding!.postId;
                },
            })
        ).status,
        "noticeboard-sync-failed",
    );
    assert.equal(c.postCreate, 0, "validated update failure never creates replacement");
    assert.equal(c.backlink, 0, "failed synchronization does not rewrite map");
    assert.equal(c.postUpdate, 2, "A succeeds, B fails, and C is not attempted");
    assert.deepEqual(observed.updatedPostIds, [posts[0]._id.toHexString()]);
    assert.equal(c.revalidate, 0, "failed partial synchronization does not revalidate");
    c = counts();
    assert.equal(
        (
            await run(c, {
                existingHostCircleIds: circles,
                requestedHostCircleIds: circles.slice(0, 2),
                deleteValidatedPost: async () => {
                    c.postDelete++;
                    throw new Error("delete failed");
                },
            })
        ).status,
        "noticeboard-cleanup-failed",
    );
    assert.equal(c.postDelete, 1);
    assert.equal(c.upload, 0, "removed-host delete failure precedes media");
    assert.equal(c.eventUpdate, 0, "removed-host delete failure preserves source Event");
    assert.equal(c.backlink, 0, "removed-host delete failure retains its map key");
    assert.equal(c.postCreate, 0, "removed-host delete failure does not create replacement");
    assert.equal(c.revalidate, 0);

    c = counts();
    let productionMediaDeleteAttempts = 0;
    await assert.rejects(
        deleteEventMediaWithFailurePropagation(["a", "b"], async (url) => {
            productionMediaDeleteAttempts++;
            if (url === "b") throw new Error("media delete failed");
        }),
        /media delete failed/,
    );
    assert.equal(productionMediaDeleteAttempts, 2, "production media helper propagates a rejected deletion");

    c = counts();
    let deleteAttempt = 0;
    const partialUnpublish = await run(c, {
        noticeboardPublicationRequested: false,
        deleteValidatedPost: async () => {
            deleteAttempt++;
            c.postDelete++;
            if (deleteAttempt === 2) throw new Error("second delete failed");
        },
    });
    assert.equal(partialUnpublish.status, "noticeboard-cleanup-failed");
    if (partialUnpublish.status === "noticeboard-cleanup-failed") assert.equal(partialUnpublish.partial, true);
    assert.equal(c.postDelete, 2);
    assert.equal(c.eventUpdate, 0, "partial unpublish failure preserves source Event");
    assert.equal(c.backlink, 0, "partial unpublish failure does not clear remaining refs");
    assert.equal(c.revalidate, 0);

    for (const [name, overrides, phase] of [
        [
            "upload",
            {
                noticeboardPublicationRequested: false,
                uploadMedia: async () => {
                    throw new Error("upload failed");
                },
            },
            "media",
        ],
        [
            "old-media deletion",
            {
                noticeboardPublicationRequested: false,
                deleteOldMedia: async () => {
                    throw new Error("old-media deletion failed");
                },
            },
            "media",
        ],
        [
            "Event update",
            {
                noticeboardPublicationRequested: false,
                updateEvent: async () => {
                    throw new Error("Event update failed");
                },
            },
            "event",
        ],
        [
            "backlink persistence",
            {
                noticeboardPublicationRequested: false,
                writeNoticeboardBacklinks: async () => {
                    throw new Error("backlink persistence failed");
                },
            },
            "backlinks",
        ],
    ] as const) {
        c = counts();
        const result = await run(c, overrides);
        assert.equal(result.status, "post-cleanup-operation-failed", `${name} exception is explicit`);
        if (result.status === "post-cleanup-operation-failed") {
            assert.equal(result.phase, phase);
            assert.equal(result.cleanupPerformed, true, `${name} retains cleanup disposition`);
            assert.equal(result.sourceMutationPossible, phase !== "media");
        }
        assert.equal(c.postDelete, 3, `${name} happens after validated cleanup`);
        assert.equal(c.revalidate, 0);
    }

    c = counts();
    let fakeEventTitle = "before";
    const ambiguousUpdate = await run(c, {
        noticeboardPublicationRequested: false,
        updateEvent: async () => {
            c.eventUpdate++;
            fakeEventTitle = "after";
            throw new Error("ambiguous Event update");
        },
    });
    assert.equal(fakeEventTitle, "after", "fake Event changed before update callback threw");
    assert.equal(ambiguousUpdate.status, "post-cleanup-operation-failed");
    if (ambiguousUpdate.status === "post-cleanup-operation-failed") {
        assert.equal(ambiguousUpdate.phase, "event");
        assert.equal(ambiguousUpdate.cleanupPerformed, true);
        assert.equal(ambiguousUpdate.sourceMutationCompleted, false);
        assert.equal(ambiguousUpdate.sourceMutationPossible, true);
    }

    c = counts();
    const revalidationFailure = await run(c, {
        noticeboardPublicationRequested: false,
        revalidate: () => {
            c.revalidate++;
            throw new Error("revalidation failed");
        },
    });
    assert.equal(revalidationFailure.status, "post-cleanup-operation-failed");
    if (revalidationFailure.status === "post-cleanup-operation-failed") {
        assert.equal(revalidationFailure.phase, "revalidate");
        assert.equal(revalidationFailure.cleanupPerformed, true);
        assert.equal(revalidationFailure.sourceMutationCompleted, true);
        assert.equal(revalidationFailure.sourceMutationPossible, true);
    }

    c = counts();
    const removedThenSyncFails = await run(c, {
        existingHostCircleIds: circles,
        requestedHostCircleIds: circles.slice(0, 2),
        synchronizeHost: async () => {
            throw new Error("retained synchronization failed");
        },
    });
    assert.equal(removedThenSyncFails.status, "noticeboard-sync-failed");
    if (removedThenSyncFails.status === "noticeboard-sync-failed") {
        assert.equal(removedThenSyncFails.cleanupPerformed, true);
        assert.equal(removedThenSyncFails.sourceMutationCompleted, true);
        assert.equal(removedThenSyncFails.sourceMutationPossible, true);
    }
    assert.equal(c.postDelete, 1, "removed host cleanup completed before retained synchronization failed");
    assert.equal(c.backlink, 0, "partial operation preserves backlink evidence");
    assert.equal(c.revalidate, 0);
    console.log("event update orchestration tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
