import assert from "node:assert/strict";
import type { ChatMessage } from "@/models/models";
import { FIRST_TOPIC_DEFAULT_TITLE, getInitialTopicTitle, getTopicIndexMessages } from "./chat-topic-utils";

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
    getTopicIndexMessages([looseMessage, olderTopic, activeTopic, topicReply]).map((message) => message.id),
    ["older-topic", "active-topic"],
    "topic index contains only topic starters ordered by latest topic activity ascending",
);

const equalActivityTopicA = makeMessage("equal-activity-a", {
    thread: {
        title: "Equal A",
        createdAt: new Date("2026-07-17T12:00:00.000Z"),
        updatedAt: new Date("2026-07-17T12:30:00.000Z"),
        replyCount: 0,
    },
});
const equalActivityTopicB = makeMessage("equal-activity-b", {
    thread: {
        title: "Equal B",
        createdAt: new Date("2026-07-17T12:10:00.000Z"),
        updatedAt: new Date("2026-07-17T12:30:00.000Z"),
        replyCount: 0,
    },
});
const missingActivityTopicA = makeMessage("missing-activity-a", {
    createdAt: undefined as any,
    thread: {
        title: "Missing A",
        createdAt: undefined as any,
        updatedAt: undefined as any,
        replyCount: 0,
    },
});
const missingActivityTopicB = makeMessage("missing-activity-b", {
    createdAt: undefined as any,
    thread: {
        title: "Missing B",
        createdAt: undefined as any,
        updatedAt: undefined as any,
        replyCount: 0,
    },
});

assert.deepEqual(
    getTopicIndexMessages([equalActivityTopicA, equalActivityTopicB]).map((message) => message.id),
    ["equal-activity-a", "equal-activity-b"],
    "topics with equal latest activity keep their input order",
);

assert.deepEqual(
    getTopicIndexMessages([missingActivityTopicA, missingActivityTopicB]).map((message) => message.id),
    ["missing-activity-a", "missing-activity-b"],
    "topics with missing activity keep their input order",
);

assert.equal(getInitialTopicTitle(0), FIRST_TOPIC_DEFAULT_TITLE, "first topic gets the neutral default title");
assert.equal(getInitialTopicTitle(1), "", "later topics are not prefilled");

console.log("chat-topic-utils tests passed");
