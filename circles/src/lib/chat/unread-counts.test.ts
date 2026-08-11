import assert from "node:assert/strict";
import {
    buildConversationUnreadSnapshot,
    buildUnreadMessagesQuery,
    resolveConversationUnreadCount,
} from "./unread-counts";

assert.equal(resolveConversationUnreadCount(0, 5), 0, "the shared unread snapshot wins over an older room prop");
assert.equal(resolveConversationUnreadCount(3, 5), 3, "the shared unread snapshot supplies the visible badge");
assert.equal(resolveConversationUnreadCount(undefined, 4), 4, "the room prop is used before the shared snapshot loads");
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

assert.deepEqual(
    buildConversationUnreadSnapshot([
        { _id: "conversation-topic", unreadCount: 1 },
        { _id: "conversation-replies", unreadCount: 2 },
    ]),
    { "conversation-topic": 1, "conversation-replies": 2 },
    "topic creation and reply refreshes publish authoritative parent counts to sidebar/global consumers",
);
assert.deepEqual(
    buildConversationUnreadSnapshot([{ _id: "active-conversation", unreadCount: 1 }]),
    { "active-conversation": 1 },
    "the active conversation is not forced to zero",
);

console.log("unread-counts tests passed");
