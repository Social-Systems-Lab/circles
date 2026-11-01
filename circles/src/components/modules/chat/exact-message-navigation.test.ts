import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatRoom = readFileSync("src/components/modules/chat/chat-room.tsx", "utf8");
const mongoHook = readFileSync("src/components/modules/chat/useMongoChat.ts", "utf8");
const chatPage = readFileSync("src/app/chat/[handle]/page.tsx", "utf8");

test("exact topic navigation waits for loaded replies and reuses message highlighting", () => {
    assert.match(chatRoom, /expectedReplyCount > replies\.length/);
    assert.match(chatRoom, /scrollToMessageElement\(targetMessageId\)/);
    assert.match(chatRoom, /classList\.add\(\.\.\.CHAT_MESSAGE_HIGHLIGHT_CLASSES\)/);
    assert.match(chatRoom, /classList\.remove\(\.\.\.CHAT_MESSAGE_HIGHLIGHT_CLASSES\)/);
    assert.match(chatRoom, /}, 1800\)/);
    assert.match(chatRoom, /targetMessageId\?: string/);
    assert.match(chatRoom, /if \(exactNavigationPendingRef\.current\) return/);
    assert.match(chatRoom, /pendingIncomingAutoScrollRef\.current = false/);
    assert.match(chatRoom, /pendingOutgoingScrollRef\.current = false/);
    assert.match(chatRoom, /cancelAnimationFrame\(topicAutoScrollFrameRef\.current\)/);
});

test("legacy exact navigation expands, loads, and identifies the saved message", () => {
    assert.match(chatRoom, /targetMessageId[\s\S]*setIsExpanded\(true\)/);
    assert.match(chatRoom, /messages === null[\s\S]*loadMessages\(\)/);
    assert.match(chatRoom, /id=\{getMessageElementId\(message\.id\)\}/);
    assert.match(chatRoom, /legacyTargetMessageId=\{!initialTopicId \? initialMessageId : undefined\}/);
});

test("exact navigation suppresses automatic legacy read advancement only while targeted", () => {
    assert.match(chatRoom, /suppressAutoRead,/);
    assert.match(chatPage, /suppressAutoRead=\{searchParams\.message !== undefined\}/);
    assert.match(mongoHook, /if \(!roomId \|\| suppressAutoRead \|\| lastMarkedIdRef\.current === lastSeenId\) return/);
    assert.match(mongoHook, /suppressAutoRead = false/);
    assert.match(chatPage, /validateMessageDeepLink/);
    assert.doesNotMatch(chatRoom, /markTopicReadAction\([^)]*initialMessageId/);
});

test("exact navigation avoids initial bottom scrolling and accepts changed navigation targets", () => {
    assert.match(chatRoom, /if \(!initialMessageId\) return;[\s\S]*hasInitiallyScrolledRef\.current = true/);
    assert.match(chatRoom, /openedDeepLinkTopicRef\.current === `\$\{initialTopicId\}:\$\{initialMessageId \|\| ""\}`/);
    assert.match(chatRoom, /if \(!initialMessageId\) openedDeepLinkTopicRef\.current = null/);
    assert.match(
        chatRoom,
        /if \(initialMessageId\) \{[\s\S]*lastRenderedMessageRef\.current = nextSnapshot;[\s\S]*return;/,
    );
});

test("exact topic navigation cancels stale animation frames", () => {
    assert.match(chatRoom, /exactNavigationFrameRef = useRef<number \| null>\(null\)/);
    assert.match(chatRoom, /cancelAnimationFrame\(exactNavigationFrameRef\.current\)/);
    assert.match(chatRoom, /return \(\) => \{[\s\S]*cancelAnimationFrame\(frame\)/);
    assert.match(chatRoom, /cancelAnimationFrame\(bottomScrollFrameRef\.current\)/);
});
