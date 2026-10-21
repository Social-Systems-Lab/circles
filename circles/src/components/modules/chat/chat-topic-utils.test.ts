import assert from "node:assert/strict";
import type { ChatMessage } from "@/models/models";
import {
    FIRST_TOPIC_DEFAULT_TITLE,
    acknowledgeTopicUnreadIndicator,
    canApplyTopicReplyLoad,
    createTopicUnreadIndicator,
    findFirstUnreadReplyId,
    getInitialTopicTitle,
    getTopicIndexMessages,
    getTopicReplyChangeSignals,
    getTopicViewportSnapshot,
    mergeRefreshedTopicStarters,
    selectInitialTopicId,
    selectFollowUpTopicReplySignal,
    selectOldestUnreadTopicId,
    recordTopicUnreadIndicatorBoundary,
    shouldAcknowledgeTopicIndicatorFromDraft,
} from "./chat-topic-utils";

const makeMessage = (id: string, overrides: Partial<ChatMessage> & Record<string, any> = {}): ChatMessage =>
    ({
        id,
        roomId: "conversation-1",
        type: "m.room.message",
        content: { msgtype: "m.text", body: id },
        createdBy: "did:example:sender",
        createdAt: new Date("2026-07-17T10:00:00.000Z"),
        author: { _id: "sender", name: "Sender" },
        reactions: {},
        ...overrides,
    }) as ChatMessage;

const looseMessage = makeMessage("loose-message");
const olderTopic = makeMessage("older-topic", {
    createdAt: new Date("2026-07-17T09:00:00.000Z"),
    thread: {
        title: "Older topic",
        createdAt: new Date("2026-07-17T09:00:00.000Z"),
        updatedAt: new Date("2026-07-17T09:30:00.000Z"),
        replyCount: 1,
    },
});
const activeTopic = makeMessage("active-topic", {
    createdAt: new Date("2026-07-17T08:00:00.000Z"),
    thread: {
        title: "Active topic",
        createdAt: new Date("2026-07-17T08:00:00.000Z"),
        updatedAt: new Date("2026-07-17T11:00:00.000Z"),
        replyCount: 4,
    },
});
const topicReply = makeMessage("topic-reply", {
    threadId: "active-topic",
    createdAt: new Date("2026-07-17T11:05:00.000Z"),
});

assert.deepEqual(
    getTopicReplyChangeSignals([
        topicReply,
        makeMessage("other-topic-reply", { threadId: "older-topic" }),
        makeMessage("latest-active-reply", { threadId: "active-topic" }),
        looseMessage,
    ]),
    {
        "active-topic": "latest-active-reply",
        "older-topic": "other-topic-reply",
    },
    "a poll batch retains the latest change signal for every affected topic",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 2,
        currentRequestId: 2,
        loadScope: 4,
        currentLoadScope: 4,
        isTopicOpen: true,
    }),
    true,
    "the current reply response applies to an open topic",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 1,
        currentRequestId: 2,
        loadScope: 4,
        currentLoadScope: 4,
        isTopicOpen: true,
    }),
    false,
    "an overlapping stale reply response cannot overwrite newer state",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 2,
        currentRequestId: 2,
        loadScope: 3,
        currentLoadScope: 4,
        isTopicOpen: true,
    }),
    false,
    "a previous-conversation reply response cannot apply after the load scope changes",
);
assert.equal(
    canApplyTopicReplyLoad({
        requestId: 2,
        currentRequestId: 2,
        loadScope: 4,
        currentLoadScope: 4,
        isTopicOpen: false,
    }),
    false,
    "a closed topic cannot apply a reply response or advance its read boundary",
);
assert.equal(
    selectFollowUpTopicReplySignal({
        pendingSignal: "reply-3",
        appliedSignal: "reply-2",
        isTopicOpen: true,
    }),
    "reply-3",
    "the newest queued signal schedules one follow-up after an in-flight load",
);
assert.equal(
    selectFollowUpTopicReplySignal({
        pendingSignal: "reply-3",
        appliedSignal: "reply-2",
        isTopicOpen: false,
    }),
    undefined,
    "closing a topic suppresses its queued background refresh",
);
assert.equal(
    selectFollowUpTopicReplySignal({
        pendingSignal: "reply-3",
        appliedSignal: "reply-3",
        isTopicOpen: true,
    }),
    undefined,
    "an already-applied signal does not cause a duplicate reply load",
);

assert.deepEqual(
    getTopicIndexMessages([looseMessage, olderTopic, activeTopic, topicReply]).map((message) => message.id),
    ["active-topic", "older-topic"],
    "topic index contains only topic starters ordered by original topic creation ascending",
);
assert.deepEqual(
    getTopicViewportSnapshot([activeTopic, olderTopic]),
    getTopicViewportSnapshot([activeTopic, topicReply, olderTopic, makeMessage("new-reply", { threadId: "older-topic" })]),
    "incoming replies do not look like new topic cards and cannot trigger an outer viewport jump",
);

const refreshedActiveTopic = makeMessage("active-topic", {
    createdAt: activeTopic.createdAt,
    thread: {
        ...(activeTopic as any).thread,
        updatedAt: new Date("2026-07-17T11:05:00.000Z"),
        replyCount: 5,
    },
});
const refreshedMessages = mergeRefreshedTopicStarters(
    [looseMessage, olderTopic, activeTopic, topicReply],
    [olderTopic, refreshedActiveTopic],
);
assert.equal(
    (refreshedMessages.find((message) => message.id === "active-topic") as any).thread.replyCount,
    5,
    "refreshed starter metadata updates the displayed reply count",
);
assert.ok(
    refreshedMessages.some((message) => message.id === "topic-reply"),
    "refreshing starter metadata preserves already loaded replies",
);
assert.deepEqual(
    getTopicIndexMessages(refreshedMessages).map((message) => message.id),
    ["active-topic", "older-topic"],
    "reply activity does not reorder topic cards",
);

const equalCreationTopicA = makeMessage("equal-creation-a", {
    createdAt: new Date("2026-07-17T12:00:00.000Z"),
    thread: {
        title: "Equal A",
        createdAt: new Date("2026-07-17T12:00:00.000Z"),
        updatedAt: new Date("2026-07-17T12:30:00.000Z"),
        replyCount: 0,
    },
});
const equalCreationTopicB = makeMessage("equal-creation-b", {
    createdAt: new Date("2026-07-17T12:00:00.000Z"),
    thread: {
        title: "Equal B",
        createdAt: new Date("2026-07-17T12:00:00.000Z"),
        updatedAt: new Date("2026-07-17T12:30:00.000Z"),
        replyCount: 0,
    },
});
const missingCreationTopicA = makeMessage("missing-creation-a", {
    createdAt: undefined as any,
    thread: {
        title: "Missing A",
        createdAt: undefined as any,
        updatedAt: undefined as any,
        replyCount: 0,
    },
});
const missingCreationTopicB = makeMessage("missing-creation-b", {
    createdAt: undefined as any,
    thread: {
        title: "Missing B",
        createdAt: undefined as any,
        updatedAt: undefined as any,
        replyCount: 0,
    },
});

assert.deepEqual(
    getTopicIndexMessages([equalCreationTopicA, equalCreationTopicB]).map((message) => message.id),
    ["equal-creation-a", "equal-creation-b"],
    "topics with equal original creation time keep their input order",
);

assert.deepEqual(
    getTopicIndexMessages([missingCreationTopicA, missingCreationTopicB]).map((message) => message.id),
    ["missing-creation-a", "missing-creation-b"],
    "topics with missing creation time keep their input order",
);

assert.equal(getInitialTopicTitle(0), FIRST_TOPIC_DEFAULT_TITLE, "first topic gets the neutral default title");
assert.equal(getInitialTopicTitle(1), "", "later topics are not prefilled");

const topicsInNonChronologicalInputOrder = [olderTopic, activeTopic];
assert.equal(
    selectOldestUnreadTopicId(topicsInNonChronologicalInputOrder, {
        "active-topic": 2,
        "older-topic": 1,
    }),
    "active-topic",
    "the oldest unread topic is selected using chronological topic order",
);
assert.equal(
    selectInitialTopicId({
        explicitTopicId: "older-topic",
        initialEntryHandled: false,
        messages: topicsInNonChronologicalInputOrder,
        unreadCounts: { "active-topic": 2 },
    }),
    "older-topic",
    "an explicit topic deep link overrides automatic unread selection",
);
assert.equal(
    selectInitialTopicId({
        initialEntryHandled: false,
        messages: topicsInNonChronologicalInputOrder,
        unreadCounts: {},
    }),
    undefined,
    "no unread topics preserves the existing entry behavior",
);
assert.equal(
    selectInitialTopicId({
        initialEntryHandled: true,
        messages: topicsInNonChronologicalInputOrder,
        unreadCounts: { "active-topic": 1 },
    }),
    undefined,
    "polling cannot reopen a topic after initial entry has been handled",
);
assert.equal(
    selectOldestUnreadTopicId([activeTopic, olderTopic], { "older-topic": 1 }),
    "older-topic",
    "opening one topic leaves another unread topic selectable",
);
assert.deepEqual(createTopicUnreadIndicator(3), { unreadCount: 3 }, "automatic opening snapshots the unread count");
assert.equal(createTopicUnreadIndicator(0), undefined, "read topics do not create visual indicators");
assert.equal(
    findFirstUnreadReplyId(
        [
            { id: "reply-1", createdBy: "did:other" },
            { id: "reply-2", createdBy: "did:me" },
            { id: "reply-3", createdBy: "did:other" },
            { id: "reply-4", createdBy: "did:other" },
        ],
        2,
        "did:me",
    ),
    "reply-3",
    "the separator starts at the first unread reply and ignores the current user's replies",
);
assert.equal(shouldAcknowledgeTopicIndicatorFromDraft(""), false, "empty focus does not acknowledge the indicator");
assert.equal(shouldAcknowledgeTopicIndicatorFromDraft("   "), false, "whitespace does not acknowledge the indicator");
assert.equal(shouldAcknowledgeTopicIndicatorFromDraft("Reply"), true, "non-empty typing acknowledges the indicator");
const indicators = {
    "active-topic": { unreadCount: 3 },
    "older-topic": { unreadCount: 1 },
};
const withBoundary = recordTopicUnreadIndicatorBoundary(indicators, "active-topic", "reply-3");
assert.deepEqual(
    withBoundary["active-topic"],
    { unreadCount: 3, firstUnreadReplyId: "reply-3" },
    "capturing the visual boundary does not discard the pre-open count",
);
assert.deepEqual(
    withBoundary["older-topic"],
    indicators["older-topic"],
    "activity in one topic does not alter another topic's indicator",
);
const afterAcknowledgement = acknowledgeTopicUnreadIndicator(withBoundary, "active-topic");
assert.equal(afterAcknowledgement["active-topic"], undefined, "active engagement clears the selected indicator");
assert.deepEqual(
    afterAcknowledgement["older-topic"],
    indicators["older-topic"],
    "acknowledging one topic leaves other unread indicators intact",
);
assert.deepEqual(
    JSON.parse(JSON.stringify(withBoundary)),
    withBoundary,
    "the indicator snapshot can be restored after conversation re-entry within the browser session",
);

console.log("chat-topic-utils tests passed");
