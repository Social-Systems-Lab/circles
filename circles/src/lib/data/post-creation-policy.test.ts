import assert from "node:assert/strict";
import { validateCreatePostTargetPolicy } from "@/lib/data/post-creation-policy";

const communityFeed = { circleId: "circle-a", handle: "community" };
const defaultFeed = { circleId: "circle-a", handle: "default" };

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: communityFeed,
        content: "Hello community",
        mediaCount: 0,
    }),
    { ok: true, isCommunityPost: true },
    "authorized Community target policy accepts the circle Community feed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: [],
        requestedFeed: communityFeed,
        content: "Hello community",
        mediaCount: 0,
    }),
    { ok: false, message: "Community is not enabled for this circle" },
    "Community disabled fails closed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: defaultFeed,
        content: "Hello community",
        mediaCount: 0,
    }),
    { ok: false, message: "Invalid Community feed" },
    "Community posts cannot target the default feed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: { circleId: "circle-b", handle: "community" },
        content: "Hello community",
        mediaCount: 0,
    }),
    { ok: false, message: "Invalid Community feed" },
    "Community posts cannot target another circle's Community feed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "unknown",
        circleId: "circle-a",
        enabledModules: ["community"],
    }),
    { ok: false, message: "Unsupported post type" },
    "unknown postType fails closed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "post",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: communityFeed,
    }),
    { ok: false, message: "Normal posts cannot be created in the Community feed" },
    "ordinary posts cannot target the Community feed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "post",
        circleId: "circle-a",
        enabledModules: ["community"],
    }),
    { ok: true, isCommunityPost: false },
    "ordinary Noticeboard creation remains valid without an injected feed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: communityFeed,
        content: "",
        mediaCount: 0,
    }),
    { ok: false, message: "Community posts must include text or an image" },
    "empty Community post is rejected",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: communityFeed,
        content: "   \n\t",
        mediaCount: 0,
    }),
    { ok: false, message: "Community posts must include text or an image" },
    "whitespace-only Community post is rejected",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: communityFeed,
        content: "Hello community",
        mediaCount: 0,
    }),
    { ok: true, isCommunityPost: true },
    "Community text-only post is allowed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: communityFeed,
        content: "",
        mediaCount: 1,
    }),
    { ok: true, isCommunityPost: true },
    "Community image-only post is allowed",
);

assert.deepEqual(
    validateCreatePostTargetPolicy({
        postType: "community",
        circleId: "circle-a",
        enabledModules: ["community"],
        requestedFeed: communityFeed,
        content: "",
        mediaCount: 0,
    }),
    { ok: false, message: "Community posts must include text or an image" },
    "malformed or empty media entries do not make Community content valid",
);

console.log("post creation policy tests passed");
