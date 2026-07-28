import assert from "node:assert/strict";
import {
    getPostTitleUpdate,
    requiresPostTitle,
    showsPostTitle,
    validatePostUpdateContent,
} from "@/lib/data/post-content-policy";

assert.equal(showsPostTitle("community"), false, "Community edit UI hides Title");
assert.equal(requiresPostTitle("community"), false, "Community edit UI does not require Title");
assert.deepEqual(
    validatePostUpdateContent({ postType: "community", content: "Body only", mediaCount: 0 }),
    { ok: true },
    "Community body-only update succeeds without title",
);
assert.deepEqual(
    validatePostUpdateContent({ postType: "community", content: "", mediaCount: 1 }),
    { ok: true },
    "Community image-only update succeeds",
);
assert.deepEqual(
    validatePostUpdateContent({ postType: "community", content: "  ", mediaCount: 0 }),
    { ok: false, message: "Community posts must include text or an image" },
    "Community empty update fails",
);
assert.deepEqual(
    validatePostUpdateContent({
        postType: "community",
        existingTitle: "Legacy Community title",
        content: "Updated body",
    }),
    { ok: true },
    "Legacy Community title does not affect update validation",
);
assert.deepEqual(
    getPostTitleUpdate("community", ""),
    {},
    "Community updates omit title so an existing legacy title is preserved",
);

assert.equal(showsPostTitle("discussion"), true, "Discussion edit UI shows Title");
assert.equal(requiresPostTitle("discussion"), true, "Discussion edit UI requires Title");
assert.deepEqual(getPostTitleUpdate("discussion", " Forum title "), { title: "Forum title" });
assert.deepEqual(
    validatePostUpdateContent({
        postType: "discussion",
        title: "",
        existingTitle: "Existing Forum title",
        content: "Body",
    }),
    { ok: false, message: "Title is required" },
    "Discussion update without a title fails",
);

for (const postType of [undefined, "post", "goal", "task", "issue", "proposal", "event"] as const) {
    assert.equal(showsPostTitle(postType), true, `${postType ?? "legacy"} edit UI continues to show Title`);
    assert.equal(requiresPostTitle(postType), true, `${postType ?? "legacy"} continues to require Title`);
    assert.deepEqual(
        validatePostUpdateContent({ postType, title: "", existingTitle: "Existing title", content: "Body" }),
        { ok: true },
        `${postType ?? "legacy"} existing-title update behaviour is unchanged`,
    );
}

assert.equal(showsPostTitle("unknown"), true, "Unknown post type fails safely by showing Title");
assert.equal(requiresPostTitle("unknown"), true, "Unknown post type fails safely by requiring Title");
assert.deepEqual(
    validatePostUpdateContent({ postType: "unknown", title: "Title", content: "Body" }),
    { ok: false, message: "Unsupported post type" },
    "Unknown post type update fails closed",
);

console.log("post content policy tests passed");
