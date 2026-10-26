import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mongoActions = readFileSync(new URL("../../components/modules/chat/mongo-actions.ts", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../data/mongo-chat.ts", import.meta.url), "utf8");
const room = readFileSync(new URL("../../components/modules/chat/chat-room.tsx", import.meta.url), "utf8");
const settings = readFileSync(
    new URL("../../components/modules/chat/group-settings-modal.tsx", import.meta.url),
    "utf8",
);

test("topic sort preference actions authorize both reads and writes", () => {
    const getter = mongoActions.slice(
        mongoActions.indexOf("export const getTopicSortPreferenceAction"),
        mongoActions.indexOf("export const setTopicSortPreferenceAction"),
    );
    const setter = mongoActions.slice(
        mongoActions.indexOf("export const setTopicSortPreferenceAction"),
        mongoActions.indexOf("export const fetchTopicStartersAction"),
    );
    assert.match(getter, /getAuthenticatedUserDid\(\)/);
    assert.match(getter, /resolveMongoConversationAccess\(conversationId, userDid\)/);
    assert.match(getter, /getTopicSortOrder\(userDid, conversationId\)/);
    assert.match(setter, /getAuthenticatedUserDid\(\)/);
    assert.match(setter, /resolveMongoConversationAccess\(conversationId, userDid\)/);
    assert.match(setter, /setTopicSortOrder\(userDid, conversationId, sortOrder\)/);
    assert.match(persistence, /ChatConversationPreferences\.updateOne\(\s*\{ userDid, conversationId \}/);
});

test("preference persistence is isolated from chat read state and topic activity", () => {
    const setter = persistence.slice(
        persistence.indexOf("const setConversationPreferenceFields"),
        persistence.indexOf("export const toggleReaction"),
    );
    assert.doesNotMatch(setter, /thread\.updatedAt/);
    assert.doesNotMatch(setter, /ChatReadStates|ensureChatReadStateV2|lastReadMessageId/);
    assert.match(setter, /ChatConversationPreferences\.updateOne/);
});

test("reply deletion restores activity from the latest remaining reply or topic creation", () => {
    const deletion = persistence.slice(
        persistence.indexOf("export const deleteMessage"),
        persistence.indexOf("export const getTopicSortOrder"),
    );
    assert.match(deletion, /latestRemainingReply/);
    assert.match(deletion, /sort: \{ createdAt: -1, _id: -1 \}/);
    assert.match(
        deletion,
        /latestRemainingReply\?\.createdAt \|\| threadStarter\.thread\.createdAt/,
    );
    assert.doesNotMatch(deletion, /"thread\.updatedAt": new Date\(\)/);
});

test("activity sorting stays separate from unread order and expanded-topic scrolling", () => {
    assert.match(room, /getMainFeedTopicMessages\(messages, topicSortOrder\)/);
    assert.match(room, /selectUnreadTopicIds\(messages, topicUnreadCounts\)/);
    assert.match(room, /deferTopicReordering=\{openTopicIds\.size > 0 \|\| showJumpToLatest\}/);
    assert.match(room, /shouldRenderTopicFeed\(hasLoadedTopicSortOrder, isLoadingMessages\)/);
    assert.match(room, /pendingScrollToLatestRef\.current = true/);
    assert.match(room, /selectTopicReplyScrollTarget\(\{/);
});

test("reply deletion refreshes starter metadata before reloading expanded replies", () => {
    assert.match(room, /await onTopicActivity\?\.\(\);\s*await loadReplies\(\);/);
});

test("Chat Info topics stay creation-dated while Settings exposes both personal choices", () => {
    assert.match(settings, /thread\.thread\?\.createdAt \|\| thread\.createdAt/);
    assert.match(settings, /Latest activity/);
    assert.match(settings, /Date created/);
    assert.match(settings, /This setting applies only to you/);
});
