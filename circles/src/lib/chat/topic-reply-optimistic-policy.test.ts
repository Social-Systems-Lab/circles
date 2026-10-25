import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const chatRoomSource = readFileSync(new URL("../../components/modules/chat/chat-room.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../../components/modules/chat/mongo-actions.ts", import.meta.url), "utf8");
const persistenceSource = readFileSync(new URL("../data/mongo-chat.ts", import.meta.url), "utf8");

test("topic replies render pending state before awaiting the server", () => {
    assert.match(
        chatRoomSource,
        /setReplies\(\(current\) => \[\.\.\.current, optimisticReply\]\);[\s\S]*?setTopicReplyText\(""\);[\s\S]*?void submitTopicReply\(optimisticReply\)/,
    );
    assert.match(chatRoomSource, /Sending…/);
    assert.match(chatRoomSource, />\s*Retry\s*</);
});

test("retry reuses a stable submission id and persistence recovers duplicate requests", () => {
    assert.match(chatRoomSource, /submitTopicReply\(reply\)/, "Retry resubmits the retained reply object");
    assert.match(chatRoomSource, /optimisticReply\.submissionId/);
    assert.match(actionSource, /idempotencyKey: submissionId \? `topic-reply:\$\{submissionId\}`/);
    assert.match(persistenceSource, /senderDid,\s*submissionId: payload\.submissionId/);
    assert.match(persistenceSource, /error\?\.code !== 11000/);
    assert.match(persistenceSource, /return recovered/);
});

test("topic scrolling stays separate from acknowledgement", () => {
    assert.match(chatRoomSource, /pendingScrollToLatestRef\.current = true/);
    assert.match(chatRoomSource, /isTopicViewportNearBottom/);
    assert.match(chatRoomSource, /repliesEndRef\.current\?\.scrollIntoView/);
    assert.doesNotMatch(
        chatRoomSource,
        /scrollIntoView[\s\S]{0,200}acknowledgeLoadedTopic/,
        "scroll effects do not acknowledge topic reads",
    );
});
