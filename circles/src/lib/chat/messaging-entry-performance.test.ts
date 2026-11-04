import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const chatIndexSource = readFileSync(new URL("../../app/chat/page.tsx", import.meta.url), "utf8");
const chatDetailSource = readFileSync(new URL("../../app/chat/[handle]/page.tsx", import.meta.url), "utf8");
const chatRoomSource = readFileSync(new URL("../../components/modules/chat/chat-room.tsx", import.meta.url), "utf8");

test("messaging index reuses the layout room request", () => {
    assert.match(chatIndexSource, /useChatLayout\(\)/);
    assert.doesNotMatch(chatIndexSource, /listChatRoomsAction/);
});

test("conversation detail avoids the full sidebar and unread-count request", () => {
    assert.match(chatDetailSource, /getChatRoomAction\(slug\)/);
    assert.doesNotMatch(chatDetailSource, /listChatRoomsAction/);
});

test("topic starters are not gated on recent-message loading or acknowledgement", () => {
    const topicLoadEffect = chatRoomSource.match(
        /useEffect\(\(\) => \{\s*if \(!roomId \|\| hasLoadedTopicsRef\.current\)[\s\S]*?void refreshTopicStarters\(\);[\s\S]*?\}, \[roomId, refreshTopicStarters\]\);/,
    );
    assert.ok(topicLoadEffect, "topic starter loading begins as soon as the authorized room is mounted");
    assert.doesNotMatch(topicLoadEffect[0], /isLoadingMongo/);
    assert.doesNotMatch(topicLoadEffect[0], /markTopicRead/);
});
