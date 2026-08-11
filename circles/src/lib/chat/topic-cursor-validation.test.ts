import assert from "node:assert/strict";
import {
    normalizeObjectIdHex,
    selectGreatestObjectIdHex,
    validateTopicCursorCandidate,
    type TopicCursorLookup,
} from "./topic-read-state";

const conversationId = "conversation-a";
const topicId = "64a000000000000000000010";
const replyId = "64a000000000000000000020";
const higherObjectIdWithEarlierCreatedAt = "64a000000000000000000030";

const eligible = new Set([
    `${conversationId}:${topicId}:${topicId}:starter`,
    `${conversationId}:${topicId}:${replyId}:reply`,
    `${conversationId}:${topicId}:${higherObjectIdWithEarlierCreatedAt}:reply`,
]);
const lookup: TopicCursorLookup = async ({ conversationId, topicId, messageId, kind }) =>
    eligible.has(`${conversationId}:${topicId}:${messageId}:${kind}`);
const validate = (messageId: string, overrides: Partial<{ conversationId: string; topicId: string }> = {}) =>
    validateTopicCursorCandidate({
        conversationId: overrides.conversationId || conversationId,
        topicId: overrides.topicId || topicId,
        messageId,
        lookup,
    });

const run = async () => {
    assert.equal(await validate("malformed"), null, "malformed cursor IDs are rejected");
    assert.equal(
        await validate(replyId, { conversationId: "conversation-b" }),
        null,
        "another conversation is rejected",
    );
    assert.equal(await validate(replyId, { topicId: "64a000000000000000000099" }), null, "another topic is rejected");
    assert.equal(await validate("64a000000000000000000099"), null, "nonexistent or fabricated future IDs are rejected");
    assert.equal(await validate(topicId), topicId, "the legitimate topic starter is accepted");
    assert.equal(await validate(replyId.toUpperCase()), replyId, "a legitimate reply is accepted and canonicalized");
    assert.equal(
        normalizeObjectIdHex(replyId.toUpperCase()),
        replyId,
        "stored ObjectId strings are canonical lowercase hex",
    );
    assert.ok(replyId > topicId, "normalized fixed-length ObjectId strings preserve ObjectId byte ordering");
    assert.equal(
        selectGreatestObjectIdHex([topicId, higherObjectIdWithEarlierCreatedAt, replyId]),
        higherObjectIdWithEarlierCreatedAt,
        "the fetched boundary uses maximum ObjectId rather than createdAt/array order",
    );

    console.log("topic cursor validation tests passed");
};

void run();
