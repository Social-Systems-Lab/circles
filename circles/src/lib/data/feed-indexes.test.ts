import assert from "node:assert/strict";
import {
    COMMUNITY_FEED_UNIQUE_INDEX_KEYS,
    COMMUNITY_FEED_UNIQUE_INDEX_OPTIONS,
    isDuplicateKeyError,
} from "@/lib/data/feed-indexes";

assert.deepEqual(
    COMMUNITY_FEED_UNIQUE_INDEX_KEYS,
    { circleId: 1, handle: 1 },
    "Community feed index is scoped by circleId and handle",
);
assert.equal(COMMUNITY_FEED_UNIQUE_INDEX_OPTIONS.unique, true, "Community feed index is unique");
assert.equal(
    COMMUNITY_FEED_UNIQUE_INDEX_OPTIONS.name,
    "unique_community_feed_per_circle",
    "Community feed index has a stable name",
);
assert.deepEqual(
    COMMUNITY_FEED_UNIQUE_INDEX_OPTIONS.partialFilterExpression,
    { handle: "community" },
    "Community feed index only constrains Community feeds",
);

assert.equal(isDuplicateKeyError({ code: 11000 }), true, "Mongo duplicate-key errors are recognized");
assert.equal(isDuplicateKeyError({ code: 42 }), false, "Other Mongo errors are not duplicate-key errors");
assert.equal(isDuplicateKeyError(null), false, "Malformed errors are not duplicate-key errors");

console.log("feed index tests passed");
