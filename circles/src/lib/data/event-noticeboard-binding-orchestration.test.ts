import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
    hasStoredEventNoticeboardReferences,
    resolveEventNoticeboardBindings,
    shouldOrchestrateEventNoticeboardUpdate,
} from "./event-noticeboard-binding-orchestration";

const eventId = new ObjectId();
const primary = new ObjectId();
const second = new ObjectId();
const stale = new ObjectId();
const ids = [primary, second, stale];
const feeds = new Map(ids.map((id) => [id.toHexString(), { _id: new ObjectId(), handle: "default", circleId: id }]));
const posts = new Map<string, any>();
const add = (circleId: ObjectId, parent = true) => {
    const feed = feeds.get(circleId.toHexString())!;
    const post = {
        _id: new ObjectId(),
        feedId: feed._id,
        postType: "post",
        internalPreviewType: "event",
        internalPreviewId: eventId,
        ...(parent ? { parentItemType: "event", parentItemId: eventId } : {}),
    };
    posts.set(post._id.toHexString(), post);
    return post._id.toHexString();
};
const postA = add(primary);
const postB = add(second, false);
const postC = add(stale);
const deps = {
    findPostById: async (id: ObjectId) => posts.get(id.toHexString()) || null,
    findFeedById: async (id: ObjectId) => [...feeds.values()].find((feed) => feed._id.equals(id)) || null,
};
const resolve = (overrides: Record<string, unknown> = {}) =>
    resolveEventNoticeboardBindings({
        eventId,
        primaryCircleId: primary,
        existingHostCircleIds: [primary, second],
        requestedHostCircleIds: [primary, second],
        noticeboardPostId: postA,
        noticeboardPostIdsByCircleId: { [primary.toHexString()]: postA, [second.toHexString()]: postB },
        ...deps,
        ...overrides,
    });

async function main() {
    assert.equal(hasStoredEventNoticeboardReferences({}), false, "absent stored state remains absent");
    assert.equal(
        hasStoredEventNoticeboardReferences({ noticeboardPostId: postA }),
        true,
        "legacy primary is stored state",
    );
    assert.equal(
        hasStoredEventNoticeboardReferences({ noticeboardPostIdsByCircleId: { [primary.toHexString()]: postA } }),
        true,
        "non-empty map is stored state",
    );
    for (const noticeboardPostId of ["", "   ", [], {}]) {
        assert.equal(
            hasStoredEventNoticeboardReferences({ noticeboardPostId, noticeboardPostIdsByCircleId: {} }),
            true,
            "every present primary value counts as stored state",
        );
    }
    for (const noticeboardPostIdsByCircleId of ["", "   ", [], 0, false, new Date(), new Map()]) {
        assert.equal(
            hasStoredEventNoticeboardReferences({ noticeboardPostIdsByCircleId }),
            true,
            "every malformed present map value counts as stored state",
        );
    }
    assert.equal(
        hasStoredEventNoticeboardReferences({ noticeboardPostIdsByCircleId: { malformed: "value" } }),
        true,
        "non-empty malformed map counts as stored state",
    );
    assert.equal(
        hasStoredEventNoticeboardReferences({ noticeboardPostIdsByCircleId: Object.create(null) }),
        false,
        "empty null-prototype plain map remains absent",
    );
    class FakeMap {}
    for (const noticeboardPostIdsByCircleId of [
        new Date(),
        new Map(),
        new Set(),
        new Number(0),
        new String(""),
        new Boolean(false),
        new FakeMap(),
        [],
    ]) {
        assert.equal(
            await resolve({ noticeboardPostIdsByCircleId }),
            null,
            `${noticeboardPostIdsByCircleId.constructor.name} map shape rejects`,
        );
    }
    for (const [publicationRequested, hasStoredNoticeboardState, expected] of [
        [false, false, false],
        [true, false, true],
        [false, true, true],
        [true, true, true],
    ] as const) {
        assert.equal(
            shouldOrchestrateEventNoticeboardUpdate({ publicationRequested, hasStoredNoticeboardState }),
            expected,
            `production branch decision: requested=${publicationRequested}, stored=${hasStoredNoticeboardState}`,
        );
    }
    for (const [noticeboardPostId, noticeboardPostIdsByCircleId, expected] of [
        [undefined, undefined, false],
        [null, null, false],
        [undefined, {}, false],
        [postA, {}, true],
        [undefined, { [primary.toHexString()]: postA }, true],
        [postA, { [primary.toHexString()]: postA }, true],
    ] as const) {
        assert.equal(
            hasStoredEventNoticeboardReferences({ noticeboardPostId, noticeboardPostIdsByCircleId }),
            expected,
            "stored-state derivation uses production semantics",
        );
    }
    assert.ok(await resolve(), "valid multi-host current");
    assert.ok(
        await resolve({
            existingHostCircleIds: [primary],
            requestedHostCircleIds: [primary],
            noticeboardPostIdsByCircleId: { [primary.toHexString()]: postA },
        }),
        "valid single-host current",
    );
    assert.ok(
        await resolve({
            existingHostCircleIds: [primary],
            requestedHostCircleIds: [primary],
            noticeboardPostIdsByCircleId: undefined,
        }),
        "legacy primary-only",
    );
    const emptyMapPrimaryOnly = await resolve({
        existingHostCircleIds: [primary],
        requestedHostCircleIds: [primary],
        noticeboardPostIdsByCircleId: {},
    });
    assert.ok(emptyMapPrimaryOnly, "explicit empty map is primary-only legacy state");
    assert.deepEqual(Object.keys(emptyMapPrimaryOnly.entriesByCircleId), [primary.toHexString()]);
    assert.equal(emptyMapPrimaryOnly.entriesByCircleId[primary.toHexString()].postId, postA);
    assert.equal(emptyMapPrimaryOnly.entriesByCircleId[primary.toHexString()].classification, "current");
    const emptyNullPrototypeMap = Object.create(null) as Record<string, string>;
    assert.ok(
        await resolve({
            existingHostCircleIds: [primary],
            requestedHostCircleIds: [primary],
            noticeboardPostIdsByCircleId: emptyNullPrototypeMap,
        }),
        "empty null-prototype map retains primary-only compatibility",
    );
    const populatedNullPrototypeMap = Object.create(null) as Record<string, string>;
    populatedNullPrototypeMap[primary.toHexString()] = postA;
    assert.ok(
        await resolve({
            existingHostCircleIds: [primary],
            requestedHostCircleIds: [primary],
            noticeboardPostIdsByCircleId: populatedNullPrototypeMap,
        }),
        "populated null-prototype map undergoes normal binding validation",
    );
    const uppercase = await resolve({
        existingHostCircleIds: [primary.toHexString().toUpperCase()],
        requestedHostCircleIds: [primary.toHexString().toUpperCase()],
        noticeboardPostId: postA.toUpperCase(),
        noticeboardPostIdsByCircleId: { [primary.toHexString().toUpperCase()]: postA.toUpperCase() },
    });
    assert.ok(uppercase, "uppercase-equivalent IDs normalize successfully");
    assert.deepEqual(Object.keys(uppercase.entriesByCircleId), [primary.toHexString()]);
    assert.equal(uppercase.entriesByCircleId[primary.toHexString()].postId, postA);
    assert.equal(await resolve({ noticeboardPostId: undefined }), null, "map-only primary rejects");
    assert.equal(await resolve({ noticeboardPostId: new ObjectId().toHexString() }), null, "primary/map disagreement");
    assert.equal(await resolve({ noticeboardPostId: "", noticeboardPostIdsByCircleId: {} }), null, "empty primary rejects");
    assert.equal(
        await resolve({ noticeboardPostId: "   ", noticeboardPostIdsByCircleId: {} }),
        null,
        "whitespace primary rejects",
    );
    assert.equal(await resolve({ noticeboardPostId: "bad" }), null, "malformed primary Post ID");
    assert.equal(await resolve({ noticeboardPostIdsByCircleId: { bad: postA } }), null, "malformed key");
    assert.equal(
        await resolve({ noticeboardPostIdsByCircleId: { [primary.toHexString()]: "bad" } }),
        null,
        "malformed value",
    );
    assert.equal(
        await resolve({
            noticeboardPostIdsByCircleId: {
                [primary.toHexString()]: postA,
                [primary.toHexString().toUpperCase()]: postA,
            },
        }),
        null,
        "duplicate canonical keys",
    );
    assert.equal(
        await resolve({
            noticeboardPostIdsByCircleId: { [primary.toHexString()]: postA, [second.toHexString()]: postA },
        }),
        null,
        "duplicate Post IDs",
    );
    assert.equal(
        await resolve({ noticeboardPostIdsByCircleId: { [primary.toHexString()]: new ObjectId().toHexString() } }),
        null,
        "missing Post",
    );
    const staleContext = await resolve({
        noticeboardPostIdsByCircleId: {
            [primary.toHexString()]: postA,
            [second.toHexString()]: postB,
            [stale.toHexString()]: postC,
        },
    });
    assert.equal(staleContext?.entriesByCircleId[stale.toHexString()].classification, "stale");
    const corrupt = posts.get(postC)!;
    corrupt.internalPreviewId = new ObjectId();
    assert.equal(
        await resolve({
            noticeboardPostIdsByCircleId: { [primary.toHexString()]: postA, [stale.toHexString()]: postC },
        }),
        null,
        "invalid stale rejects",
    );
    corrupt.internalPreviewId = eventId;
    const wrongFeed = feeds.get(second.toHexString())!;
    wrongFeed.circleId = primary;
    assert.equal(await resolve(), null, "one invalid of many / wrong Feed Circle");
    wrongFeed.circleId = second;
    const savedFeed = feeds.get(primary.toHexString())!;
    feeds.delete(primary.toHexString());
    assert.equal(
        await resolve({
            existingHostCircleIds: [primary],
            requestedHostCircleIds: [primary],
            noticeboardPostIdsByCircleId: { [primary.toHexString()]: postA },
        }),
        null,
        "missing Feed",
    );
    feeds.set(primary.toHexString(), savedFeed);
    console.log("event noticeboard binding orchestration tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
