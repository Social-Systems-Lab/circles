import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const chatList = read("src/components/modules/chat/chat-list.tsx");
const chatLayout = read("src/app/chat/layout.tsx");
const userToolbox = read("src/components/layout/user-toolbox.tsx");
const settings = read("src/components/modules/chat/group-settings-modal.tsx");
const actions = read("src/components/modules/chat/mongo-actions.ts");
const notifications = read("src/lib/data/notifications.ts");
const firstTopics = read("src/lib/chat/first-topic-notifications.ts");

assert.match(chatList, /DropdownMenuTrigger asChild/);
assert.match(chatList, /event\.stopPropagation\(\)/);
assert.match(chatList, /Chat Info/);
assert.match(chatList, /Group Info/);
assert.match(chatList, /Mute notifications/);
assert.match(chatList, /Unmute notifications/);
assert.match(chatList, /chat\.isDirect[\s\S]*Archive conversation/);
assert.match(chatList, /archivedView[\s\S]*onUnarchive/);
assert.match(chatList, /getPostArchiveNavigationTarget/);
assert.match(chatLayout, /getPostArchiveNavigationTarget\(pathname, conversationId\)/);
assert.match(userToolbox, /getPostArchiveNavigationTarget\(pathname, conversationId\)/);
assert.match(chatLayout, /router\.push\(`\/chat\/\$\{String\(chat\._id\)\}`\)/);

assert.match(settings, /checked=\{notificationsMuted === true\}/);
assert.match(settings, /setConversationMutePreferenceAction/);
assert.match(settings, /CONVERSATION_MUTE_PREFERENCE_EVENT/);
assert.match(settings, /muteLoadState === "error"/);
assert.match(settings, /Retry/);
assert.match(settings, /router\.replace\("\/chat\/archived"\)/);
assert.match(chatList, /CONVERSATION_MUTE_PREFERENCE_EVENT/);
assert.match(chatList, /notificationsMutePreferenceAvailable === false/);
assert.match(chatList, /Retry notification setting/);
assert.match(chatList, /beginConversationMuteMutation/);

assert.match(actions, /resolveMongoConversationAccess\(conversationId, userDid, "read"\)/);
assert.match(actions, /getConversationNotificationsMuted/);
assert.match(actions, /setConversationNotificationsMuted/);
const muteSetter = actions.slice(
    actions.indexOf("export const setConversationMutePreferenceAction"),
    actions.indexOf("export const fetchRecentMessagesAction"),
);
assert.doesNotMatch(muteSetter, /markConversationRead|markTopicRead|ChatConversations|ChatMessageDocs/);

assert.match(notifications, /filterMutedConversationRecipients\(\s*type,\s*roomId/);
assert.match(notifications, /notificationsMuted: true/);
assert.doesNotMatch(chatList, /getConversationMutePreferenceAction/);
assert.match(chatList, /chat\.notificationsMuted === true/);
assert.match(firstTopics, /sendNotifications\(\s*"pm_received"/);
assert.match(firstTopics, /sendNotifications\(\s*"chat_mention"/);

console.log("messaging archive and mute policy tests passed");
