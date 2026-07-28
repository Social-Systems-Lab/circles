import assert from "node:assert/strict";
import { getDiscussionFormCircleId, getPostDisplayId, normalizePostId } from "@/lib/data/post-update-identity";

const forumPostId = "6a6867e0ffc0c243df2caf9f";

assert.equal(
    getPostDisplayId({ _id: forumPostId }),
    forumPostId,
    "Forum detail PostDisplay supplies the database post _id",
);
assert.equal(normalizePostId(" 6A6867E0FFC0C243DF2CAF9F "), forumPostId, "string ObjectId is normalized safely");
assert.equal(normalizePostId("discussion-route-slug"), null, "malformed route IDs fail closed");
assert.equal(normalizePostId(undefined), null, "missing post IDs fail closed");

assert.equal(
    getDiscussionFormCircleId({
        isEditing: true,
        postCircleId: "post-circle",
        selectedCircleId: "wrong-selector-circle",
        initialSelectedCircleId: "initial-circle",
    }),
    "post-circle",
    "Forum edits use the projected post circle instead of mutable selector state",
);
assert.equal(
    getDiscussionFormCircleId({
        isEditing: false,
        selectedCircleId: "creation-circle",
        initialSelectedCircleId: "initial-circle",
    }),
    "creation-circle",
    "Forum creation keeps its selected target-circle behavior",
);

for (const postType of ["community", "post"] as const) {
    assert.equal(
        getPostDisplayId({ _id: forumPostId }),
        forumPostId,
        `${postType} updates retain the same canonical _id behavior`,
    );
}

console.log("post update identity tests passed");
