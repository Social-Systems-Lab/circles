import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { isShiftNoticeboardBound, normalizeCanonicalObjectId } from "./noticeboard-source-binding-policy";

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
assert.equal(
    normalizeCanonicalObjectId({
        toString: () => {
            throw new Error("nope");
        },
    }),
    null,
);
console.log("noticeboard source binding policy tests passed");
