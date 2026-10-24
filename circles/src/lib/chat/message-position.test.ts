import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { compareMessagePositions, selectLatestMessagePosition, type MessagePosition } from "./message-position";
import { buildMessagesAfterPositionQuery } from "./message-position-query";
import { resolveTopicReadBoundary } from "./topic-read-state";

const starter: MessagePosition = {
    id: "64afffffffffffffffffffff",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const makeReplies = (count: number, sender: "P1" | "P2", offset: number) =>
    Array.from({ length: count }, (_, index) => ({
        id: `64a00000000000000000${(offset + index).toString(16).padStart(4, "0")}`,
        createdAt: new Date(Date.UTC(2026, 0, 2, 0, index)),
        sender,
    }));
const replies = [...makeReplies(11, "P2", 1), ...makeReplies(6, "P1", 100)];

assert.ok(
    replies.every((reply) => reply.id < starter.id),
    "the production-shaped replies sort below the old starter",
);
assert.equal(
    replies.filter((reply) => reply.sender !== "P1" && reply.id > starter.id).length,
    0,
    "the former ObjectId unread rule suppresses all eleven incoming P1 replies",
);
assert.equal(
    replies.filter((reply) => reply.sender !== "P2" && reply.id > starter.id).length,
    0,
    "the former ObjectId unread rule suppresses all six incoming P2 replies",
);
assert.equal(
    replies.filter((reply) => reply.sender !== "P1" && compareMessagePositions(reply, starter) > 0).length,
    11,
    "chronological unread counting restores P1's eleven replies",
);
assert.equal(
    replies.filter((reply) => reply.sender !== "P2" && compareMessagePositions(reply, starter) > 0).length,
    6,
    "chronological unread counting restores P2's six replies",
);
assert.equal(
    replies.filter((reply) => compareMessagePositions(reply, starter) > 0).length,
    17,
    "chronological polling retrieves every inverted reply",
);
assert.equal(
    selectLatestMessagePosition([starter, ...replies])?.id,
    replies[10].id,
    "latest selection uses time first",
);

const query = buildMessagesAfterPositionQuery(starter) as any;
assert.ok(Array.isArray(query.$or), "timestamped cursors produce a chronological Mongo range query");
assert.deepEqual(
    buildMessagesAfterPositionQuery({ id: starter.id }),
    { _id: { $gt: new ObjectId(starter.id) } },
    "missing historical timestamps conservatively retain ObjectId semantics",
);

assert.equal(
    resolveTopicReadBoundary({
        topicId: starter.id,
        explicitLastReadMessageId: null,
        conversationFallbackMessageId: starter.id,
    }),
    null,
    "an explicit null cursor remains authoritative over the frozen fallback",
);
assert.equal(
    resolveTopicReadBoundary({ topicId: starter.id, conversationFallbackMessageId: starter.id }),
    starter.id,
    "a missing explicit cursor continues to use the frozen V2 fallback",
);

let stored = starter;
const laterLowerId = replies[0];
const earlierHigherId = { id: "64affffffffffffffffffffe", createdAt: new Date("2025-12-31T23:59:00Z") };
for (const candidate of [laterLowerId, earlierHigherId]) {
    if (compareMessagePositions(candidate, stored) > 0) stored = candidate;
}
assert.equal(stored.id, laterLowerId.id, "a stale concurrent acknowledgement cannot move a cursor backward");

console.log("message-position tests passed");
