import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { orchestrateEventNoticeboardCleanup } from "./event-noticeboard-cleanup-orchestration";

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
const map = Object.fromEntries(circles.map((id, index) => [id.toHexString(), posts[index]._id.toHexString()]));

const run = (overrides: Record<string, unknown> = {}) => {
    const deleted: string[] = [];
    return {
        deleted,
        result: orchestrateEventNoticeboardCleanup({
            eventId,
            primaryCircleId: circles[0],
            existingHostCircleIds: circles,
            requestedHostCircleIds: circles,
            noticeboardPostId: posts[0]._id,
            noticeboardPostIdsByCircleId: map,
            findPostById: async (id) => posts.find((post) => post._id.equals(id)) || null,
            findFeedById: async (id) => feeds.find((feed) => feed._id.equals(id)) || null,
            deleteValidatedPost: async (id) => {
                deleted.push(id);
            },
            ...overrides,
        }),
    };
};

async function main() {
    let execution = run({
        existingHostCircleIds: [circles[0]],
        requestedHostCircleIds: [circles[0]],
        noticeboardPostIdsByCircleId: undefined,
    });
    assert.equal((await execution.result).status, "success", "legacy primary-only cleanup succeeds");
    assert.deepEqual(execution.deleted, [posts[0]._id.toHexString()]);

    execution = run({
        existingHostCircleIds: [circles[0]],
        requestedHostCircleIds: [circles[0]],
        noticeboardPostIdsByCircleId: {},
    });
    assert.equal((await execution.result).status, "success", "primary plus empty map cleanup succeeds");
    assert.deepEqual(execution.deleted, [posts[0]._id.toHexString()]);

    execution = run();
    const successful = await execution.result;
    assert.equal(successful.status, "success", "multi-host cleanup succeeds");
    assert.equal(successful.attemptedTargetCount, 3);
    assert.equal(successful.deletedCount, 3);
    assert.deepEqual(successful.deletedHostCircleIds, circles.map((circle) => circle.toHexString()));
    assert.deepEqual(successful.deletedPostIds, posts.map((post) => post._id.toHexString()));
    assert.equal(successful.uncertainHostCircleId, null);
    assert.equal(successful.uncertainPostId, null);
    assert.deepEqual(successful.remainingEntriesByCircleId, {});
    assert.equal(successful.destructiveEffectsPossible, true);
    assert.deepEqual(
        execution.deleted,
        posts.map((post) => post._id.toHexString()),
    );

    const corruptions = [
        {
            name: "one corrupt of many",
            findPostById: async (id: ObjectId) =>
                id.equals(posts[2]._id)
                    ? { ...posts[2], internalPreviewId: new ObjectId() }
                    : posts.find((post) => post._id.equals(id)) || null,
        },
        {
            name: "same-Circle wrong Event",
            findPostById: async (id: ObjectId) =>
                id.equals(posts[1]._id)
                    ? { ...posts[1], parentItemId: new ObjectId(), internalPreviewId: new ObjectId() }
                    : posts.find((post) => post._id.equals(id)) || null,
        },
        {
            name: "cross-Circle pointer",
            findFeedById: async (id: ObjectId) =>
                id.equals(feeds[2]._id)
                    ? { ...feeds[2], circleId: circles[1] }
                    : feeds.find((feed) => feed._id.equals(id)) || null,
        },
    ];
    for (const corruption of corruptions) {
        execution = run(corruption);
        const unavailable = await execution.result;
        assert.equal(unavailable.status, "noticeboard-unavailable", corruption.name);
        assert.equal(unavailable.attemptedTargetCount, 0);
        assert.equal(unavailable.deletedCount, 0);
        assert.deepEqual(unavailable.deletedHostCircleIds, []);
        assert.deepEqual(unavailable.deletedPostIds, []);
        assert.equal(unavailable.uncertainHostCircleId, null);
        assert.equal(unavailable.uncertainPostId, null);
        assert.equal(unavailable.remainingEntriesByCircleId, null);
        assert.equal(unavailable.destructiveEffectsPossible, false);
        assert.deepEqual(execution.deleted, [], `${corruption.name} has zero deletes`);
    }

    execution = run({
        findPostById: async () => {
            throw new Error("resolver dependency unavailable");
        },
    });
    const resolverThrow = await execution.result;
    assert.equal(resolverThrow.status, "noticeboard-unavailable", "resolver dependency throw fails closed");
    assert.equal(resolverThrow.attemptedTargetCount, 0);
    assert.equal(resolverThrow.destructiveEffectsPossible, false);
    assert.equal(resolverThrow.remainingEntriesByCircleId, null, "unvalidated state is not fabricated");
    assert.deepEqual(execution.deleted, [], "resolver throw has zero delete callbacks");

    for (const malformed of [new Date(), new Map(), new Set(), new String(""), { bad: "id" }]) {
        execution = run({ noticeboardPostIdsByCircleId: malformed });
        assert.equal((await execution.result).status, "noticeboard-unavailable", "malformed map rejects");
        assert.deepEqual(execution.deleted, []);
    }
    execution = run({ noticeboardPostId: undefined });
    assert.equal((await execution.result).status, "noticeboard-unavailable", "map-only rejects");
    assert.deepEqual(execution.deleted, []);
    execution = run({ noticeboardPostId: new ObjectId() });
    assert.equal((await execution.result).status, "noticeboard-unavailable", "primary/map disagreement rejects");
    assert.deepEqual(execution.deleted, []);

    execution = run({
        shouldDelete: (circleId: string) => circleId === circles[2].toHexString(),
    });
    const removed = await execution.result;
    assert.equal(removed.status, "success", "removed-host cleanup succeeds");
    assert.deepEqual(execution.deleted, [posts[2]._id.toHexString()]);
    if (removed.status === "success") {
        assert.equal(removed.remainingEntriesByCircleId[circles[2].toHexString()], undefined);
        assert.equal(removed.remainingEntriesByCircleId[circles[0].toHexString()], posts[0]._id.toHexString());
    }

    execution = run({
        existingHostCircleIds: circles.slice(0, 2),
        requestedHostCircleIds: circles.slice(0, 2),
        shouldDelete: (circleId: string) => circleId === circles[2].toHexString(),
    });
    assert.equal((await execution.result).status, "success", "valid stale key cleans up");
    assert.deepEqual(execution.deleted, [posts[2]._id.toHexString()]);

    const existingPostIds = new Set(posts.map((post) => post._id.toHexString()));
    let firstAttempts = 0;
    execution = run({
        deleteValidatedPost: async (id: string) => {
            firstAttempts++;
            existingPostIds.delete(id);
            throw new Error("derived cleanup failed after Post removal");
        },
    });
    const uncertainFirst = await execution.result;
    assert.equal(uncertainFirst.status, "partial-cleanup-failed", "first invoked deletion is uncertain");
    if (uncertainFirst.status === "partial-cleanup-failed") {
        assert.equal(uncertainFirst.attemptedTargetCount, 1);
        assert.equal(uncertainFirst.deletedCount, 0, "no deletion completion is confirmed");
        assert.deepEqual(uncertainFirst.deletedHostCircleIds, []);
        assert.deepEqual(uncertainFirst.deletedPostIds, []);
        assert.equal(uncertainFirst.uncertainHostCircleId, circles[0].toHexString());
        assert.equal(uncertainFirst.uncertainPostId, posts[0]._id.toHexString());
        assert.equal(uncertainFirst.destructiveEffectsPossible, true);
        assert.equal(
            uncertainFirst.remainingEntriesByCircleId[circles[0].toHexString()],
            posts[0]._id.toHexString(),
            "uncertain backlink evidence is retained",
        );
    }
    assert.equal(existingPostIds.has(posts[0]._id.toHexString()), false, "simulated Post is already gone");
    assert.equal(firstAttempts, 1, "later targets are not attempted");

    let attempts = 0;
    execution = run({
        deleteValidatedPost: async (id: string) => {
            attempts++;
            if (attempts === 2) throw new Error("second failure");
            execution.deleted.push(id);
        },
    });
    const partial = await execution.result;
    assert.equal(partial.status, "partial-cleanup-failed", "later failure reports partial cleanup");
    assert.deepEqual(execution.deleted, [posts[0]._id.toHexString()]);
    assert.equal(attempts, 2, "sequential cleanup stops at first failure");
    if (partial.status === "partial-cleanup-failed") {
        assert.equal(partial.attemptedTargetCount, 2);
        assert.deepEqual(partial.deletedHostCircleIds, [circles[0].toHexString()]);
        assert.deepEqual(partial.deletedPostIds, [posts[0]._id.toHexString()]);
        assert.equal(partial.uncertainHostCircleId, circles[1].toHexString());
        assert.equal(partial.remainingEntriesByCircleId[circles[0].toHexString()], undefined);
        assert.equal(partial.remainingEntriesByCircleId[circles[1].toHexString()], posts[1]._id.toHexString());
        assert.equal(partial.remainingEntriesByCircleId[circles[2].toHexString()], posts[2]._id.toHexString());
        assert.equal(partial.destructiveEffectsPossible, true);
    }

    console.log("event noticeboard cleanup orchestration tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
