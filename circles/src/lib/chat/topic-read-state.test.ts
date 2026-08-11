import assert from "node:assert/strict";
import {
    buildTopicUnreadMessagesQuery,
    resolveTopicReadBoundary,
    resolveTopicMigrationFallback,
    shouldApplyTopicUnreadResponse,
} from "./topic-read-state";

assert.equal(
    resolveTopicReadBoundary({
        topicId: "topic-a",
        conversationFallbackMessageId: "legacy-boundary",
    }),
    "legacy-boundary",
    "a missing topic cursor inherits the existing conversation cursor",
);
assert.equal(
    resolveTopicReadBoundary({
        topicId: "topic-a",
        explicitLastReadMessageId: "topic-boundary",
        conversationFallbackMessageId: "legacy-boundary",
    }),
    "topic-boundary",
    "an explicit topic cursor is authoritative",
);
assert.equal(
    resolveTopicReadBoundary({
        topicId: "topic-a",
        explicitLastReadMessageId: null,
        conversationFallbackMessageId: "legacy-boundary",
    }),
    null,
    "an explicit null cursor does not fall back to the legacy boundary",
);
assert.equal(
    resolveTopicMigrationFallback({ lastReadMessageId: "old-conversation-cursor" }),
    "old-conversation-cursor",
    "pre-upgrade rows lazily expose their old cursor as the topic fallback",
);
assert.equal(
    resolveTopicMigrationFallback({
        lastReadMessageId: "new-legacy-cursor",
        topicFallbackMessageId: "old-conversation-cursor",
    }),
    "old-conversation-cursor",
    "later legacy reads cannot move the preserved topic fallback",
);
assert.equal(
    resolveTopicMigrationFallback({ lastReadMessageId: "legacy-only", topicFallbackMessageId: null }),
    null,
    "new read-state rows do not inherit the legacy cursor for unopened topics",
);

const query = buildTopicUnreadMessagesQuery("did:me", "conversation-a", "topic-a", { objectId: "cursor" });
assert.equal(query.conversationId, "conversation-a");
assert.equal(query.threadId, "topic-a");
assert.deepEqual(query.senderDid, { $ne: "did:me" }, "own replies never count as unread");
assert.deepEqual(query._id, { $gt: { objectId: "cursor" } });

assert.equal(shouldApplyTopicUnreadResponse(2, 2), true);
assert.equal(shouldApplyTopicUnreadResponse(1, 2), false, "stale topic unread responses are discarded");

console.log("topic-read-state tests passed");
