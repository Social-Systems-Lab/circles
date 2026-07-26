import assert from "node:assert/strict";
import { canDeletePost, canEditOwnPost, resolvePostRevalidationRoute } from "@/lib/data/post-action-policy";

assert.deepEqual(
    canEditOwnPost({ postType: "community", isAuthor: true, isCreateAuthorized: true }),
    { ok: true, reason: "author" },
    "Community author with community.post can edit",
);
assert.deepEqual(
    canEditOwnPost({ postType: "community", isAuthor: true, isCreateAuthorized: false }),
    { ok: false, message: "You are not authorized to edit this post" },
    "Community author without community.post cannot edit",
);
assert.deepEqual(
    canEditOwnPost({ postType: "post", isAuthor: true, isCreateAuthorized: true }),
    { ok: true, reason: "author" },
    "Noticeboard author edit remains supported",
);
assert.deepEqual(
    canEditOwnPost({ postType: "discussion", isAuthor: true, isCreateAuthorized: true }),
    { ok: true, reason: "author" },
    "Forum author behavior remains supported",
);
assert.deepEqual(
    canEditOwnPost({ postType: "unknown", isAuthor: true, isCreateAuthorized: true }),
    { ok: false, message: "Post not found" },
    "Unknown postType edit fails closed",
);

assert.deepEqual(
    canDeletePost({
        postType: "community",
        isAuthor: true,
        isCreateAuthorized: true,
        isModerateAuthorized: false,
    }),
    { ok: true, reason: "author" },
    "Community author with community.post can delete",
);
assert.deepEqual(
    canDeletePost({
        postType: "community",
        isAuthor: true,
        isCreateAuthorized: false,
        isModerateAuthorized: false,
    }),
    { ok: false, message: "You are not authorized to delete this post" },
    "Community author without community.post cannot delete",
);
assert.deepEqual(
    canDeletePost({
        postType: "community",
        isAuthor: false,
        isCreateAuthorized: false,
        isModerateAuthorized: true,
    }),
    { ok: true, reason: "moderator" },
    "Community moderator with community.moderate can delete",
);
assert.deepEqual(
    canDeletePost({
        postType: "community",
        isAuthor: false,
        isCreateAuthorized: true,
        isModerateAuthorized: false,
    }),
    { ok: false, message: "You are not authorized to delete this post" },
    "community.post does not grant moderation over other authors",
);
assert.deepEqual(
    canDeletePost({
        postType: "post",
        isAuthor: true,
        isCreateAuthorized: true,
        isModerateAuthorized: false,
    }),
    { ok: true, reason: "author" },
    "Noticeboard author delete remains supported",
);
assert.deepEqual(
    canDeletePost({
        postType: "discussion",
        isAuthor: true,
        isCreateAuthorized: true,
        isModerateAuthorized: false,
    }),
    { ok: true, reason: "author" },
    "Forum author delete remains supported",
);

assert.equal(resolvePostRevalidationRoute("/circles/example/", "community"), "/circles/example/community");
assert.equal(resolvePostRevalidationRoute("/circles/example/", "post"), "/circles/example/feed");
assert.equal(resolvePostRevalidationRoute("/circles/example/", undefined), "/circles/example/feed");
assert.equal(resolvePostRevalidationRoute("/circles/example/", "discussion"), "/circles/example/discussions");
assert.equal(resolvePostRevalidationRoute("/circles/example/", "unknown"), null);

console.log("post action policy tests passed");
