import assert from "node:assert/strict";
import {
    defaultCircleModules,
    defaultProjectModules,
    defaultUserModules,
    features,
    getFeedViewFeature,
    getPostCommentFeature,
    getPostCreateFeature,
    getPostModerateFeature,
    getPostViewFeature,
} from "@/lib/data/constants";

assert.equal(getPostViewFeature("community"), features.community.view, "Community view resolves to community.view");
assert.equal(getPostCreateFeature("community"), features.community.post, "Community create resolves to community.post");
assert.equal(
    getPostCommentFeature("community"),
    features.community.post,
    "Community comment resolves to community.post",
);
assert.equal(
    getPostModerateFeature("community"),
    features.community.moderate,
    "Community moderate resolves to community.moderate",
);

assert.equal(getPostViewFeature("discussion"), features.discussions.view, "Forum view resolves to discussions.view");
assert.equal(
    getPostCreateFeature("discussion"),
    features.discussions.create,
    "Forum create resolves to discussions.create",
);
assert.equal(
    getPostCommentFeature("discussion"),
    features.discussions.comment,
    "Forum comment resolves to discussions.comment",
);
assert.equal(
    getPostModerateFeature("discussion"),
    features.discussions.moderate,
    "Forum moderate resolves to discussions.moderate",
);

assert.equal(getPostViewFeature(undefined), features.feed.view, "Legacy Noticeboard view resolves to feed.view");
assert.equal(getPostViewFeature("post"), features.feed.view, "Noticeboard view resolves to feed.view");
assert.equal(getPostCreateFeature("post"), features.feed.post, "Noticeboard create resolves to feed.post");
assert.equal(getPostCommentFeature("post"), features.feed.comment, "Noticeboard comment resolves to feed.comment");
assert.equal(getPostModerateFeature("post"), features.feed.moderate, "Noticeboard moderate resolves to feed.moderate");
assert.equal(getPostViewFeature("goal"), features.feed.view, "Goal noticeboard shadow posts resolve to feed.view");
assert.equal(getPostCreateFeature("task"), features.feed.post, "Task noticeboard shadow posts resolve to feed.post");
assert.equal(getPostCommentFeature("issue"), features.feed.comment, "Issue noticeboard shadow posts resolve to feed.comment");
assert.equal(
    getPostModerateFeature("proposal"),
    features.feed.moderate,
    "Proposal noticeboard shadow posts resolve to feed.moderate",
);
assert.equal(getPostViewFeature("event"), features.feed.view, "Event noticeboard shadow posts resolve to feed.view");

assert.equal(getPostViewFeature("unknown"), null, "Unknown postType view fails closed");
assert.equal(getPostViewFeature(null), null, "Malformed null postType view fails closed");
assert.equal(getPostCreateFeature("unknown"), null, "Unknown postType create fails closed");
assert.equal(getPostCommentFeature("unknown"), null, "Unknown postType comment fails closed");
assert.equal(getPostModerateFeature("unknown"), null, "Unknown postType moderate fails closed");

assert.equal(
    getFeedViewFeature("community"),
    features.community.view,
    "Community feed handle resolves to community.view",
);
assert.equal(getFeedViewFeature("default"), features.feed.view, "Default feed handle resolves to feed.view");
assert.equal(getFeedViewFeature(undefined), features.feed.view, "Missing feed handle resolves to feed.view");
assert.equal(getFeedViewFeature("unknown"), null, "Unknown feed handle view fails closed");
assert.equal(getFeedViewFeature(null), null, "Malformed null feed handle view fails closed");

const canUseFeature = (feature: ReturnType<typeof getPostCommentFeature>, allowedFeature: unknown): boolean => {
    return !!feature && feature === allowedFeature;
};

assert.equal(
    canUseFeature(getPostCommentFeature("discussion"), features.discussions.comment),
    true,
    "Forum comment controls follow discussions.comment",
);
assert.equal(
    canUseFeature(getPostCommentFeature("discussion"), features.feed.comment),
    false,
    "Forum comment controls do not follow feed.comment",
);
assert.equal(
    canUseFeature(getPostModerateFeature("discussion"), features.discussions.moderate),
    true,
    "Forum moderation controls follow discussions.moderate",
);
assert.equal(
    canUseFeature(getPostModerateFeature("discussion"), features.feed.moderate),
    false,
    "Forum moderation controls do not follow feed.moderate",
);

assert.equal(defaultUserModules.includes("community"), false, "User circles do not enable Community by default");
assert.equal(defaultCircleModules.includes("community"), false, "Circles do not enable Community by default");
assert.equal(defaultProjectModules.includes("community"), false, "Projects do not enable Community by default");

console.log("post permission resolver tests passed");
