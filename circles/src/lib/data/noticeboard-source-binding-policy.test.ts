import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
    isEventNoticeboardBound,
    isShiftNoticeboardBound,
    normalizeCanonicalObjectId,
} from "./noticeboard-source-binding-policy";

const taskId = new ObjectId();
const circleId = new ObjectId();
const postId = new ObjectId();
const feedId = new ObjectId();

const valid = () => ({
    storedNoticeboardPostId: postId.toHexString(),
    expectedTaskId: taskId,
    expectedCircleId: circleId.toHexString(),
    post: {
        _id: postId,
        feedId: feedId.toHexString(),
        postType: "post",
        internalPreviewType: "task",
        internalPreviewId: taskId.toHexString(),
    },
    feed: { _id: feedId, handle: "default", circleId: circleId.toHexString() },
});

assert.equal(isShiftNoticeboardBound(valid()), true);
const uppercase = valid();
uppercase.storedNoticeboardPostId = postId.toHexString().toUpperCase();
uppercase.post.internalPreviewId = taskId.toHexString().toUpperCase();
uppercase.feed.circleId = circleId.toHexString().toUpperCase();
assert.equal(isShiftNoticeboardBound(uppercase), true);

for (const [name, mutate] of [
    ["malformed backlink", (x: ReturnType<typeof valid>) => (x.storedNoticeboardPostId = "bad")],
    ["missing Post", (x: ReturnType<typeof valid>) => (x.post = null as never)],
    ["wrong Post identity", (x: ReturnType<typeof valid>) => (x.post._id = new ObjectId())],
    ["malformed Post feed", (x: ReturnType<typeof valid>) => (x.post.feedId = "bad")],
    ["missing Feed", (x: ReturnType<typeof valid>) => (x.feed = null as never)],
    ["wrong Feed identity", (x: ReturnType<typeof valid>) => (x.feed._id = new ObjectId())],
    ["malformed Feed Circle", (x: ReturnType<typeof valid>) => (x.feed.circleId = "bad")],
    ["wrong Circle", (x: ReturnType<typeof valid>) => (x.feed.circleId = new ObjectId().toHexString())],
    ["non-default Feed", (x: ReturnType<typeof valid>) => (x.feed.handle = "community")],
    ["wrong post type", (x: ReturnType<typeof valid>) => (x.post.postType = "comment")],
    ["wrong preview type", (x: ReturnType<typeof valid>) => (x.post.internalPreviewType = "event")],
    ["malformed preview ID", (x: ReturnType<typeof valid>) => (x.post.internalPreviewId = "bad")],
    [
        "wrong Task preview ID",
        (x: ReturnType<typeof valid>) => (x.post.internalPreviewId = new ObjectId().toHexString()),
    ],
] as const) {
    const candidate = valid();
    mutate(candidate);
    assert.equal(isShiftNoticeboardBound(candidate), false, name);
}

assert.equal(normalizeCanonicalObjectId("not-an-id"), null);

const eventId = new ObjectId();
const eventValid = () => ({
    storedNoticeboardPostId: postId.toHexString(),
    expectedEventId: eventId.toHexString(),
    expectedCircleId: circleId.toHexString(),
    post: {
        _id: postId,
        feedId,
        postType: "post",
        internalPreviewType: "event",
        internalPreviewId: eventId,
        parentItemType: "event",
        parentItemId: eventId,
    },
    feed: { _id: feedId, handle: "default", circleId },
});
assert.equal(isEventNoticeboardBound(eventValid()), true);
const legacyEvent = eventValid();
delete (legacyEvent.post as Partial<typeof legacyEvent.post>).parentItemType;
delete (legacyEvent.post as Partial<typeof legacyEvent.post>).parentItemId;
assert.equal(isEventNoticeboardBound(legacyEvent), true, "legacy Event markers remain compatible");
for (const [name, mutate] of [
    ["partial parent type", (x: ReturnType<typeof eventValid>) => delete (x.post as any).parentItemId],
    ["partial parent id", (x: ReturnType<typeof eventValid>) => delete (x.post as any).parentItemType],
    ["wrong parent type", (x: ReturnType<typeof eventValid>) => (x.post.parentItemType = "task")],
    ["wrong parent event", (x: ReturnType<typeof eventValid>) => (x.post.parentItemId = new ObjectId())],
    ["wrong preview event", (x: ReturnType<typeof eventValid>) => (x.post.internalPreviewId = new ObjectId())],
    ["malformed preview event", (x: ReturnType<typeof eventValid>) => ((x.post as any).internalPreviewId = "bad")],
    ["malformed Post ID", (x: ReturnType<typeof eventValid>) => ((x.post as any)._id = "bad")],
    ["malformed Post feed", (x: ReturnType<typeof eventValid>) => ((x.post as any).feedId = "bad")],
    ["wrong Feed identity", (x: ReturnType<typeof eventValid>) => (x.feed._id = new ObjectId())],
    ["malformed Feed Circle", (x: ReturnType<typeof eventValid>) => ((x.feed as any).circleId = "bad")],
    ["malformed parent event", (x: ReturnType<typeof eventValid>) => ((x.post as any).parentItemId = "bad")],
    ["wrong circle", (x: ReturnType<typeof eventValid>) => (x.feed.circleId = new ObjectId())],
    ["non-default feed", (x: ReturnType<typeof eventValid>) => (x.feed.handle = "other")],
    ["wrong Post type", (x: ReturnType<typeof eventValid>) => (x.post.postType = "comment")],
    ["wrong preview type", (x: ReturnType<typeof eventValid>) => (x.post.internalPreviewType = "task")],
] as const) {
    const candidate = eventValid();
    mutate(candidate);
    assert.equal(isEventNoticeboardBound(candidate), false, name);
}
assert.equal(
    normalizeCanonicalObjectId({
        toString: () => {
            throw new Error("nope");
        },
    }),
    null,
);
console.log("noticeboard source binding policy tests passed");
