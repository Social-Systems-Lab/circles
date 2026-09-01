import assert from "node:assert/strict";
import type { CommentDisplay } from "@/models/models";
import {
    applyCommentDeleteDisposition,
    applyHighlightedCommentDeleteDisposition,
    replaceCommentWithServerResult,
} from "./comment-list-state";

const comment = (id: string, content: string) => ({ _id: id, content }) as CommentDisplay;
const original = [comment("root", "old root"), comment("reply", "old reply")];
const sanitized = comment("reply", "Unavailable Circle");
const replaced = replaceCommentWithServerResult(original, sanitized);

assert.equal(replaced[0], original[0]);
assert.equal(replaced[1], sanitized);
assert.equal(replaced[1].content, "Unavailable Circle");
assert.equal(original[1].content, "old reply", "optimistic input is not mutated");
console.log("comment list state tests passed");

const tree = [
    comment("root", "root"),
    { ...comment("child", "sensitive"), parentCommentId: "root", createdBy: "did:old" },
    { ...comment("grandchild", "grandchild"), parentCommentId: "child" },
    comment("unrelated", "unrelated"),
];
const tombstone = {
    ...comment("child", ""),
    parentCommentId: "root",
    createdBy: "anonymous",
    isDeleted: true,
    reactions: {},
    mentions: [],
};
for (const disposition of ["tombstone", "already-deleted"] as const) {
    const next = applyCommentDeleteDisposition(tree, "child", disposition, tombstone);
    assert.equal(next.length, 4);
    assert.equal(
        next.find((item) => item._id === "child"),
        tombstone,
    );
    assert.equal(next.find((item) => item._id === "grandchild")?.content, "grandchild");
    assert.equal(
        next.find((item) => item._id === "unrelated"),
        tree[3],
    );
    assert.equal(next.find((item) => item._id === "child")?.content, "");
    assert.equal(next.find((item) => item._id === "child")?.createdBy, "anonymous");
    assert.equal(applyHighlightedCommentDeleteDisposition(tree[1], "child", disposition, tombstone), tombstone);
}
const hardDeleted = applyCommentDeleteDisposition(tree, "child", "hard-delete");
assert.deepEqual(
    hardDeleted.map((item) => item._id),
    ["root", "grandchild", "unrelated"],
);
assert.equal(applyHighlightedCommentDeleteDisposition(tree[1], "child", "hard-delete"), undefined);
assert.equal(applyHighlightedCommentDeleteDisposition(tree[0], "child", "hard-delete"), tree[0]);
