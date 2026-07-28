import assert from "node:assert/strict";
import type { PostDisplay } from "@/models/models";
import { applyPostUpdateResult, replaceUpdatedPost } from "@/lib/data/post-list-state";

const original = {
    _id: "community-1",
    feedId: "feed-1",
    createdBy: "did:example:author",
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
    content: "Old Community body",
    reactions: { like: 3 },
    comments: 2,
    media: [{ name: "old.jpg", type: "image/jpeg", fileInfo: { url: "https://example.test/old.jpg" } }],
    userGroups: ["everyone"],
    postType: "community",
    author: { did: "did:example:author", name: "Author" },
    circleType: "post",
} as PostDisplay;
const unrelated = { ...original, _id: "community-2", content: "Unrelated post" };
const updated = {
    ...original,
    content: "Updated Community body",
    editedAt: new Date("2026-07-28T10:00:00.000Z"),
    media: [{ name: "new.jpg", type: "image/jpeg", fileInfo: { url: "https://example.test/new.jpg" } }],
};

const replaced = replaceUpdatedPost([original, unrelated], updated);
assert.equal(replaced.length, 2, "replacement does not duplicate posts");
assert.strictEqual(replaced[0], updated, "matching Community post uses the authoritative returned payload");
assert.strictEqual(replaced[1], unrelated, "unrelated posts remain unchanged");
assert.equal(replaced[0].content, "Updated Community body", "updated Community body appears immediately");
assert.deepEqual(
    replaced[0].media?.map((media) => media.fileInfo.url),
    ["https://example.test/new.jpg"],
    "removed and added Community images match the returned payload",
);
assert.deepEqual(replaced[0].reactions, { like: 3 }, "reactions are preserved by the returned post");
assert.equal(replaced[0].comments, 2, "comment count is preserved by the returned post");
assert.strictEqual(replaced[0].author, original.author, "author data is preserved by the returned post");

const failed = applyPostUpdateResult([original, unrelated], { success: false, message: "Validation failed" });
assert.strictEqual(failed[0], original, "failed updates leave the visible post unchanged");
assert.strictEqual(failed[1], unrelated, "failed updates leave unrelated posts unchanged");

for (const postType of ["post", "discussion"] as const) {
    const typedOriginal = { ...original, postType, title: "Old title" };
    const typedUpdated = { ...typedOriginal, title: "Updated title", content: "Updated body" };
    assert.strictEqual(
        replaceUpdatedPost([typedOriginal], typedUpdated)[0],
        typedUpdated,
        `${postType} edits use the same immediate replacement behavior`,
    );
}

console.log("post list state tests passed");
