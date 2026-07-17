import assert from "node:assert/strict";
import { buildUnreadMessagesQuery, resolveConversationUnreadCount } from "./unread-counts";

assert.equal(resolveConversationUnreadCount(0, 5), 0, "fresh server zero wins over stale atom unread count");
assert.equal(resolveConversationUnreadCount(3, 5), 3, "fresh server count wins over atom unread count");
assert.equal(resolveConversationUnreadCount(undefined, 4), 4, "atom count is used only when server count is absent");
assert.equal(resolveConversationUnreadCount(undefined, undefined), 0, "missing unread counts resolve to zero");

const lastReadObjectId = { objectId: "last-read" };
const query = buildUnreadMessagesQuery("did:example:me", "conversation-1", lastReadObjectId) as any;

assert.equal(query.conversationId, "conversation-1", "unread count query is scoped to one conversation");
assert.deepEqual(query.senderDid, { $ne: "did:example:me" }, "own messages are not counted unread");
assert.deepEqual(query._id, { $gt: lastReadObjectId }, "messages at or before lastReadMessageId are not counted");
assert.equal(Object.prototype.hasOwnProperty.call(query, "threadId"), false, "topic replies are included by the query");
assert.deepEqual(
    buildUnreadMessagesQuery("did:example:me", "conversation-1", lastReadObjectId),
    buildUnreadMessagesQuery("did:example:me", "conversation-1", lastReadObjectId),
    "unread count query remains stable for identical input data",
);

const unreadFromBeginningQuery = buildUnreadMessagesQuery("did:example:me", "conversation-1") as any;
assert.equal(
    Object.prototype.hasOwnProperty.call(unreadFromBeginningQuery, "_id"),
    false,
    "without a read-state boundary, all other-user conversation messages are eligible",
);

console.log("unread-counts tests passed");
