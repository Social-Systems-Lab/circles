import assert from "node:assert/strict";
import { highlightedCommentFilter, highlightedCommentPointerUpdate } from "./highlighted-comment-policy";

assert.deepEqual(highlightedCommentFilter("post"), {
    postId: "post",
    parentCommentId: null,
    isDeleted: { $ne: true },
});
assert.deepEqual(highlightedCommentPointerUpdate("comment"), { $set: { highlightedCommentId: "comment" } });
assert.deepEqual(highlightedCommentPointerUpdate(), { $unset: { highlightedCommentId: "" } });
console.log("comment delete highlight policy tests passed");
