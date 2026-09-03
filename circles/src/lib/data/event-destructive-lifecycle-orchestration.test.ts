import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { orchestrateEventNoticeboardCleanup } from "./event-noticeboard-cleanup-orchestration";
import { orchestrateEventDestructiveLifecycle } from "./event-destructive-lifecycle-orchestration";

const eventId = new ObjectId();
const circles = [new ObjectId(), new ObjectId(), new ObjectId()];
const feeds = circles.map((circleId) => ({ _id: new ObjectId(), handle: "default", circleId }));
const posts = circles.map((_, index) => ({
    _id: new ObjectId(),
    feedId: feeds[index]._id,
    postType: "post",
    internalPreviewType: "event",
    internalPreviewId: eventId,
    parentItemType: "event",
    parentItemId: eventId,
}));
const map = Object.fromEntries(
    circles.map((circleId, index) => [circleId.toHexString(), posts[index]._id.toHexString()]),
);

const harness = ({
    corrupt = false,
    resolverThrows = false,
    deleteThrowsAt,
    prepareThrows = false,
    sourceThrows = false,
    sourceMutatesBeforeThrow = false,
    sourceSucceeds = true,
    backlinksThrow = false,
    revalidateThrows = false,
    withPrepare = false,
    withBacklinks = false,
}: {
    corrupt?: boolean;
    resolverThrows?: boolean;
    deleteThrowsAt?: number;
    prepareThrows?: boolean;
    sourceThrows?: boolean;
    sourceMutatesBeforeThrow?: boolean;
    sourceSucceeds?: boolean;
    backlinksThrow?: boolean;
    revalidateThrows?: boolean;
    withPrepare?: boolean;
    withBacklinks?: boolean;
} = {}) => {
    const effects: string[] = [];
    const sourceState = { changed: false };
    let deleteAttempt = 0;
    const result = orchestrateEventDestructiveLifecycle({
        cleanupNoticeboards: () =>
            orchestrateEventNoticeboardCleanup({
                eventId,
                primaryCircleId: circles[0],
                existingHostCircleIds: circles,
                noticeboardPostId: posts[0]._id,
                noticeboardPostIdsByCircleId: map,
                findPostById: async (id) => {
                    if (resolverThrows) throw new Error("resolver dependency unavailable");
                    const post = posts.find((candidate) => candidate._id.equals(id)) || null;
                    return corrupt && id.equals(posts[2]._id) && post
                        ? { ...post, internalPreviewId: new ObjectId() }
                        : post;
                },
                findFeedById: async (id) => feeds.find((feed) => feed._id.equals(id)) || null,
                deleteValidatedPost: async (postId) => {
                    deleteAttempt++;
                    effects.push(`delete:${postId}`);
                    if (deleteAttempt === deleteThrowsAt) throw new Error("derived cleanup failed");
                },
            }),
        prepare: withPrepare
            ? async () => {
                  effects.push("prepare");
                  if (prepareThrows) throw new Error("prepare failed");
                  return "prepared";
              }
            : undefined,
        mutateSource: async () => {
            effects.push("source");
            if (sourceMutatesBeforeThrow) sourceState.changed = true;
            if (sourceThrows) throw new Error("source failed");
            return sourceSucceeds;
        },
        clearBacklinks: withBacklinks
            ? async () => {
                  effects.push("backlinks");
                  if (backlinksThrow) throw new Error("backlinks failed");
              }
            : undefined,
        revalidate: () => {
            effects.push("revalidate");
            if (revalidateThrows) throw new Error("revalidation failed");
        },
    });
    return { result, effects, sourceState };
};

async function main() {
    let run = harness({ withPrepare: true, withBacklinks: true });
    assert.equal((await run.result).status, "success", "draft lifecycle succeeds");
    assert.deepEqual(run.effects.slice(-4), ["prepare", "source", "backlinks", "revalidate"]);

    run = harness({ corrupt: true, withPrepare: true, withBacklinks: true });
    assert.equal((await run.result).status, "noticeboard-unavailable", "corrupt draft fails before effects");
    assert.deepEqual(run.effects, []);

    run = harness({ resolverThrows: true, withPrepare: true, withBacklinks: true });
    const resolverUnavailable = await run.result;
    assert.equal(resolverUnavailable.status, "noticeboard-unavailable", "resolver throw fails closed");
    if (resolverUnavailable.status === "noticeboard-unavailable") {
        assert.equal(resolverUnavailable.attemptedTargetCount, 0);
        assert.equal(resolverUnavailable.destructiveEffectsPossible, false);
    }
    assert.deepEqual(run.effects, [], "resolver throw blocks media, source, backlinks, and revalidation");

    run = harness({ corrupt: true });
    assert.equal((await run.result).status, "noticeboard-unavailable", "corrupt withdrawal fails before source delete");
    assert.deepEqual(run.effects, []);

    run = harness({ corrupt: true, withPrepare: true });
    assert.equal(
        (await run.result).status,
        "noticeboard-unavailable",
        "corrupt direct delete fails before images/source",
    );
    assert.deepEqual(run.effects, []);

    run = harness({ deleteThrowsAt: 1, withPrepare: true, withBacklinks: true });
    const first = await run.result;
    assert.equal(first.status, "noticeboard-cleanup-failed", "first invoked delete is uncertain");
    if (first.status === "noticeboard-cleanup-failed") assert.equal(first.destructiveEffectsPossible, true);
    assert.equal(run.effects.length, 1, "first uncertain delete stops draft effects and later targets");

    run = harness({ deleteThrowsAt: 2, withPrepare: true, withBacklinks: true });
    const later = await run.result;
    assert.equal(later.status, "noticeboard-cleanup-failed", "later invoked delete is partial");
    if (later.status === "noticeboard-cleanup-failed" && later.cleanup.status === "partial-cleanup-failed") {
        assert.equal(later.cleanup.deletedCount, 1);
        assert.equal(later.cleanup.attemptedTargetCount, 2);
    }
    assert.equal(run.effects.length, 2, "third target and source effects are not attempted");

    run = harness({ withPrepare: true, prepareThrows: true });
    let failed = await run.result;
    assert.equal(failed.status, "post-cleanup-operation-failed");
    if (failed.status === "post-cleanup-operation-failed") assert.equal(failed.phase, "prepare");
    assert.equal(run.effects.includes("source"), false);

    run = harness({ sourceThrows: true });
    failed = await run.result;
    assert.equal(failed.status, "post-cleanup-operation-failed", "withdrawal source throw is explicit");
    if (failed.status === "post-cleanup-operation-failed") {
        assert.equal(failed.phase, "source");
        assert.equal(failed.destructiveEffectsPossible, true);
        assert.equal(failed.sourceMutationCompleted, false);
        assert.equal(failed.sourceMutationPossible, true);
    }

    run = harness({ deleteThrowsAt: 1 });
    failed = await run.result;
    assert.equal(failed.status, "noticeboard-cleanup-failed", "uncertain withdrawal cleanup blocks source delete");
    assert.equal(run.effects.includes("source"), false);

    run = harness({ withPrepare: true, sourceThrows: true });
    failed = await run.result;
    assert.equal(failed.status, "post-cleanup-operation-failed", "direct delete source throw is explicit");
    assert.deepEqual(run.effects.slice(-2), ["prepare", "source"]);

    run = harness({ withPrepare: true, prepareThrows: true });
    failed = await run.result;
    assert.equal(failed.status, "post-cleanup-operation-failed", "direct image failure is explicit");
    if (failed.status === "post-cleanup-operation-failed") assert.equal(failed.phase, "prepare");

    run = harness({ withPrepare: true, deleteThrowsAt: 1 });
    failed = await run.result;
    assert.equal(failed.status, "noticeboard-cleanup-failed", "uncertain direct cleanup blocks images/source");
    assert.equal(run.effects.includes("prepare"), false);
    assert.equal(run.effects.includes("source"), false);

    run = harness({ withBacklinks: true, backlinksThrow: true });
    failed = await run.result;
    assert.equal(failed.status, "post-cleanup-operation-failed", "draft backlink failure is explicit");
    if (failed.status === "post-cleanup-operation-failed") {
        assert.equal(failed.phase, "backlinks");
        assert.equal(failed.sourceMutationCompleted, true);
        assert.equal(failed.sourceMutationPossible, true);
    }
    assert.equal(run.effects.includes("revalidate"), false);

    run = harness({ sourceMutatesBeforeThrow: true, sourceThrows: true });
    const ambiguous = await run.result;
    assert.equal(run.sourceState.changed, true, "fake source changed before callback threw");
    assert.equal(ambiguous.status, "post-cleanup-operation-failed");
    if (ambiguous.status === "post-cleanup-operation-failed") {
        assert.equal(ambiguous.phase, "source");
        assert.equal(ambiguous.sourceMutationCompleted, false);
        assert.equal(ambiguous.sourceMutationPossible, true);
    }

    run = harness({ withBacklinks: true, revalidateThrows: true });
    failed = await run.result;
    assert.equal(failed.status, "post-cleanup-operation-failed", "revalidation failure is explicit");
    if (failed.status === "post-cleanup-operation-failed") {
        assert.equal(failed.phase, "revalidate");
        assert.equal(failed.sourceMutationCompleted, true);
        assert.equal(failed.sourceMutationPossible, true);
        assert.equal(failed.destructiveEffectsPossible, true);
    }

    console.log("event destructive lifecycle orchestration tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
