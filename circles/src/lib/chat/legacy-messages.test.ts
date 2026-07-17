import assert from "node:assert/strict";
import type { ChatMessage } from "@/models/models";
import {
    buildLegacyLooseMessageQuery,
    getLegacyLooseMessages,
    isLegacyLooseMessageCandidate,
    shouldFetchLegacyLooseMessagesOnExpand,
    shouldShowLegacyLooseMessageSection,
} from "./legacy-messages";

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

const legacyNewer = makeMessage("legacy-newer", {
    createdAt: new Date("2026-07-17T11:00:00.000Z"),
});
const legacyOlder = makeMessage("legacy-older", {
    createdAt: new Date("2026-07-17T09:00:00.000Z"),
});
const topicStarter = makeMessage("topic-starter", {
    thread: {
        title: "Topic",
        createdAt: new Date("2026-07-17T10:00:00.000Z"),
        updatedAt: new Date("2026-07-17T10:00:00.000Z"),
        replyCount: 0,
    },
});
const topicReply = makeMessage("topic-reply", {
    threadId: "topic-starter",
});
const systemMessage = makeMessage("system-message", {
    source: "system_welcome",
    system: { messageType: "system", systemType: "welcome" },
});

assert.equal(
    isLegacyLooseMessageCandidate(legacyOlder as any),
    true,
    "ordinary root messages are legacy loose messages",
);
assert.equal(isLegacyLooseMessageCandidate(topicStarter as any), false, "topic starters are excluded");
assert.equal(isLegacyLooseMessageCandidate(topicReply as any), false, "topic replies are excluded");
assert.equal(isLegacyLooseMessageCandidate(systemMessage as any), false, "system records are excluded");

assert.deepEqual(
    getLegacyLooseMessages([legacyNewer, topicStarter, topicReply, systemMessage, legacyOlder]).map(
        (message) => message.id,
    ),
    ["legacy-older", "legacy-newer"],
    "legacy loose messages are returned oldest to newest",
);

assert.equal(shouldShowLegacyLooseMessageSection(0), false, "conversations without legacy messages hide the section");
assert.equal(shouldShowLegacyLooseMessageSection(null), false, "unknown counts do not show the section");
assert.equal(shouldShowLegacyLooseMessageSection(2), true, "positive counts show the section");

assert.equal(
    shouldFetchLegacyLooseMessagesOnExpand({
        isExpanded: false,
        hasLoadedMessages: false,
        isLoadingMessages: false,
    }),
    false,
    "collapsed legacy section does not fetch full history",
);
assert.equal(
    shouldFetchLegacyLooseMessagesOnExpand({
        isExpanded: true,
        hasLoadedMessages: false,
        isLoadingMessages: false,
    }),
    true,
    "expanding legacy section fetches full history once",
);
assert.equal(
    shouldFetchLegacyLooseMessagesOnExpand({
        isExpanded: true,
        hasLoadedMessages: true,
        isLoadingMessages: false,
    }),
    false,
    "expanded legacy section does not refetch after messages are loaded",
);

const query = buildLegacyLooseMessageQuery("conversation-1") as any;
assert.equal(query.conversationId, "conversation-1", "legacy query is scoped to one conversation");
assert.deepEqual(query.threadId, { $exists: false }, "legacy query excludes topic replies");
assert.deepEqual(query.thread, { $exists: false }, "legacy query excludes topic starters");
assert.equal(
    Object.prototype.hasOwnProperty.call(query, "updatedAt"),
    false,
    "read-only query does not touch updatedAt",
);

console.log("legacy-messages tests passed");
