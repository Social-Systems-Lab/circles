import assert from "node:assert/strict";
import { buildLatestConversationMessageLookup } from "./conversation-read-state";

const lookup = buildLatestConversationMessageLookup("conversation-1");

assert.deepEqual(
    lookup.filter,
    { conversationId: "conversation-1" },
    "latest read marker lookup includes all messages in the conversation, including topic replies",
);

assert.equal(
    Object.prototype.hasOwnProperty.call(lookup.filter, "threadId"),
    false,
    "latest read marker lookup must not filter to root messages only",
);

assert.deepEqual(
    lookup.options.sort,
    { createdAt: -1, _id: -1 },
    "latest read marker lookup uses chronological order with an ObjectId tie-breaker",
);
assert.deepEqual(lookup.options.projection, { _id: 1 }, "latest read marker lookup only fetches the message id");

console.log("conversation-read-state tests passed");
