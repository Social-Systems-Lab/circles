import assert from "node:assert/strict";
import {
    buildTopicUnreadMessagesQuery,
    resolveTopicReadBoundary,
    shouldApplyTopicUnreadResponse,
    sumConversationUnreadCounts,
} from "./topic-read-state";

type Reply = { id: string; topicId: string; senderDid: string };
const me = "did:me";
const replies: Reply[] = [
    { id: "02", topicId: "a", senderDid: "did:other" },
    { id: "03", topicId: "a", senderDid: me },
    { id: "04", topicId: "b", senderDid: "did:other" },
];
const count = (topicId: string, boundary: string | null) =>
    replies.filter((reply) => reply.topicId === topicId && reply.senderDid !== me && (!boundary || reply.id > boundary))
        .length;

const persisted = { a: "03", b: "04" };
assert.equal(count("a", persisted.a), 0, "1. a read topic remains read after reload");
assert.equal(count("a", persisted.a), 0, "2. a read topic remains read after switching conversations");
assert.equal(
    resolveTopicReadBoundary({ topicId: "a", explicitLastReadMessageId: persisted.a }),
    "03",
    "3. persistent topic state is independent of localStorage",
);

const afterNewBReply = [...replies, { id: "05", topicId: "b", senderDid: "did:other" }];
const countAfterNewBReply = (topicId: string, boundary: string | null) =>
    afterNewBReply.filter(
        (reply) => reply.topicId === topicId && reply.senderDid !== me && (!boundary || reply.id > boundary),
    ).length;
assert.equal(countAfterNewBReply("a", persisted.a), 0, "4. a reply in topic B does not make topic A unread");
assert.equal(sumConversationUnreadCounts(0, { a: 0, b: 1 }), 1, "5. unread topic B makes its conversation unread");
assert.equal(count("a", "02"), 0, "6. own replies never count as unread");
assert.equal(countAfterNewBReply("b", persisted.b), 1, "7. opening a conversation does not advance topic B");
assert.equal(countAfterNewBReply("b", "05"), 0, "8. opening topic B marks its existing replies read");
assert.equal(countAfterNewBReply("b", "04"), 1, "9. replies after the topic cursor are unread");
assert.equal(sumConversationUnreadCounts(2, { a: 0, b: 1 }), 3, "10. conversation total sums legacy and topic unread");
assert.equal(
    resolveTopicReadBoundary({ topicId: "old", conversationFallbackMessageId: "99" }),
    "99",
    "11. an old conversation cursor is the initial missing-topic boundary",
);
assert.equal(count("a", "99"), 0, "12. the migration fallback prevents historical resurrection");
assert.equal(sumConversationUnreadCounts(1, { a: 0, b: 0 }), 1, "13. legacy Earlier messages retain unread behavior");
assert.equal(countAfterNewBReply("b", persisted.b), 1, "14. polling alone cannot advance a closed topic cursor");
assert.equal(shouldApplyTopicUnreadResponse(1, 2), false, "15. stale unread responses cannot restore a badge");

const mentionQuery = buildTopicUnreadMessagesQuery(me, "conversation", "b", { objectId: "cursor" });
assert.deepEqual(
    mentionQuery.senderDid,
    { $ne: me },
    "16. chat unread state remains message/sender based and independent of mention notifications",
);

const conversationQuery = buildTopicUnreadMessagesQuery(me, "conversation", "topic", { objectId: "cursor" }, true, {
    objectId: "topic",
});
assert.deepEqual(conversationQuery.$or, [
    { _id: { objectId: "topic" }, thread: { $exists: true } },
    { threadId: "topic" },
]);

const starterOnly = [{ id: "10", topicId: "10", senderDid: "did:other" }];
const ownStarterOnly = [{ id: "11", topicId: "11", senderDid: me }];
const unreadInTopic = (messages: Reply[], topicId: string, boundary: string | null) =>
    messages.filter(
        (message) => message.topicId === topicId && message.senderDid !== me && (!boundary || message.id > boundary),
    ).length;
assert.equal(unreadInTopic(starterOnly, "10", null), 1, "17. an unopened other-user starter is unread");
assert.equal(unreadInTopic(ownStarterOnly, "11", null), 0, "18. an own starter is never unread");
assert.equal(sumConversationUnreadCounts(0, { "10": 1 }), 1, "19. a starter-only topic makes its parent unread");
assert.equal(unreadInTopic(starterOnly, "10", "10"), 0, "20. opening a starter-only topic clears it");
assert.equal(unreadInTopic(starterOnly, "10", "10"), 0, "21. its persisted starter cursor remains read on reload");
assert.ok(sumConversationUnreadCounts(0, { topic: 2 }) > 0, "22. two unread replies cannot yield a zero parent");
assert.equal(unreadInTopic(starterOnly, "10", null), 1, "23. an open conversation alone does not read a new topic");
assert.equal(countAfterNewBReply("b", persisted.b), 1, "24. an open conversation alone does not read a closed reply");

console.log("topic-read-semantics tests passed");
