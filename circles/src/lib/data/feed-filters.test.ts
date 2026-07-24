import assert from "node:assert/strict";
import {
    communityPostTypePredicate,
    discussionPostTypePredicate,
    getPostTypePredicate,
    noticeboardPostTypePredicate,
    unsupportedPostTypePredicate,
} from "@/lib/data/feed-filters";

const matches = (post: Record<string, unknown>, predicate: Record<string, any>): boolean => {
    if (predicate.postType !== undefined) {
        return post.postType === predicate.postType;
    }

    const clauses = predicate.$or ?? [];
    return clauses.some((clause: Record<string, any>) => {
        const condition = clause.postType;
        if (condition?.$eq !== undefined) {
            return post.postType === condition.$eq;
        }
        if (condition?.$exists === false) {
            return !Object.prototype.hasOwnProperty.call(post, "postType");
        }
        return false;
    });
};

assert.deepEqual(getPostTypePredicate(), noticeboardPostTypePredicate, "Noticeboard uses legacy/post predicate");
assert.deepEqual(
    getPostTypePredicate("post"),
    noticeboardPostTypePredicate,
    "Explicit post uses Noticeboard predicate",
);
assert.deepEqual(getPostTypePredicate("community"), communityPostTypePredicate, "Community uses community predicate");
assert.deepEqual(getPostTypePredicate("discussion"), discussionPostTypePredicate, "Forum uses discussion predicate");
assert.deepEqual(getPostTypePredicate("unknown"), unsupportedPostTypePredicate, "Unknown postType fails closed");
assert.deepEqual(getPostTypePredicate(null), unsupportedPostTypePredicate, "Malformed null postType fails closed");
assert.deepEqual(getPostTypePredicate("goal"), { postType: "goal" }, "Goal noticeboard shadow posts preserve predicate");

assert.equal(matches({}, getPostTypePredicate()), true, "legacy missing postType appears in Noticeboard");
assert.equal(matches({ postType: "post" }, getPostTypePredicate()), true, "post appears in Noticeboard");
assert.equal(matches({ postType: "community" }, getPostTypePredicate()), false, "community excluded from Noticeboard");
assert.equal(
    matches({ postType: "discussion" }, getPostTypePredicate()),
    false,
    "discussion excluded from Noticeboard",
);

assert.equal(
    matches({ postType: "community" }, getPostTypePredicate("community")),
    true,
    "community appears in Community",
);
assert.equal(matches({}, getPostTypePredicate("community")), false, "legacy post excluded from Community");
assert.equal(matches({ postType: "post" }, getPostTypePredicate("community")), false, "post excluded from Community");
assert.equal(
    matches({ postType: "discussion" }, getPostTypePredicate("community")),
    false,
    "discussion excluded from Community",
);

const circleACommunityQuery = { feedId: "feed-a-community", ...getPostTypePredicate("community") };
assert.deepEqual(
    circleACommunityQuery,
    { feedId: "feed-a-community", postType: "community" },
    "Community query scopes by feedId and cannot match another circle's feed",
);

console.log("feed filter tests passed");
