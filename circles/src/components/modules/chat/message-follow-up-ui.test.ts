import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    canShowExistingReplyActions,
    canShowMessageFollowUpAction,
    isOpenMessageFollowUpStatus,
} from "./message-follow-up-ui";
import {
    isNoteEditorForViewer,
    MessageFollowUpStatusCache,
    readCurrentMessageFollowUpStatus,
} from "./message-follow-up-status-cache";

const persistedId = "64a000000000000000000001";

test("follow-up actions are available for persisted loose messages, topic starters, and replies", () => {
    for (const message of [
        { id: persistedId, type: "m.room.message" },
        { id: persistedId, type: "m.room.message", thread: { title: "Topic" } },
        { id: persistedId, type: "m.room.message", threadId: "64a000000000000000000002" },
        { id: persistedId, type: "m.room.message", status: "sent" },
    ]) {
        assert.equal(canShowMessageFollowUpAction(message), true);
    }
});

test("follow-up availability is independent of message ownership", () => {
    const ownMessage = { id: persistedId, type: "m.room.message", createdBy: "did:viewer" };
    const participantMessage = { id: persistedId, type: "m.room.message", createdBy: "did:participant" };
    assert.equal(canShowMessageFollowUpAction(ownMessage), true);
    assert.equal(canShowMessageFollowUpAction(participantMessage), true);
});

test("optimistic, failed, malformed, and non-message events do not expose follow-up actions", () => {
    for (const message of [
        { id: "temp-1", type: "m.room.message", status: "pending" },
        { id: persistedId, type: "m.room.message", status: "pending" },
        { id: persistedId, type: "m.room.message", status: "failed" },
        { id: "not-an-object-id", type: "m.room.message" },
        { id: persistedId, type: "m.room.member" },
    ]) {
        assert.equal(canShowMessageFollowUpAction(message), false);
    }
});

test("normalized Mongo system messages do not expose follow-up actions", () => {
    for (const message of [
        {
            id: persistedId,
            type: "m.room.message",
            source: "welcome_message",
            system: { messageType: "system", systemType: "welcome", source: "signup" },
        },
        {
            id: persistedId,
            type: "m.room.message",
            source: "group_chat_member_added",
            system: {
                messageType: "system",
                systemType: "group_chat_member_added",
                source: "group_chat_membership",
            },
        },
        {
            id: persistedId,
            type: "m.room.message",
            source: "platform_announcement",
            system: { messageType: "system", systemType: "announcement", source: "platform_admin" },
        },
        { id: persistedId, type: "m.room.message", source: "circle_moderation" },
        { id: persistedId, type: "m.room.message", source: "system_group_chat_member_removed" },
    ]) {
        assert.equal(canShowMessageFollowUpAction(message), false);
    }
});

test("existing reply actions keep their original status rule independently of follow-up", () => {
    const persistedSentMessage = { id: persistedId, type: "m.room.message", status: "sent" };
    assert.equal(canShowMessageFollowUpAction(persistedSentMessage), true);
    assert.equal(canShowExistingReplyActions(persistedSentMessage, true), false);
    assert.equal(canShowExistingReplyActions({}, true), true);
    assert.equal(canShowExistingReplyActions({}, false), false);
});

test("the persistent indicator is visible only for an open saved follow-up", () => {
    assert.equal(isOpenMessageFollowUpStatus({ followUpId: "follow-up", completed: false }), true);
    assert.equal(isOpenMessageFollowUpStatus({ followUpId: "follow-up", completed: true }), false);
    assert.equal(isOpenMessageFollowUpStatus(null), false);
});

test("a successful mutation wins over an older hydration response", () => {
    const cache = new MessageFollowUpStatusCache();
    const key = "did:viewer\u0000message";
    const hydration = cache.beginHydration(key);
    cache.applyMutation(key, { followUpId: "follow-up", completed: true, note: "new note" });
    assert.equal(
        cache.applyHydration(key, hydration, { followUpId: "follow-up", completed: false, note: "old note" }),
        false,
    );
    assert.deepEqual(cache.get(key), { followUpId: "follow-up", completed: true, note: "new note" });
});

test("only the newest concurrent hydration response may update an entry", () => {
    const cache = new MessageFollowUpStatusCache();
    const key = "did:viewer\u0000message";
    const older = cache.beginHydration(key);
    const newer = cache.beginHydration(key);
    assert.equal(cache.applyHydration(key, newer, { followUpId: "new", completed: false }), true);
    assert.equal(cache.applyHydration(key, older, { followUpId: "old", completed: false }), false);
    assert.equal(cache.get(key)?.followUpId, "new");
});

test("account switching never derives status or an editor from the previous viewer", () => {
    const cache = new MessageFollowUpStatusCache();
    const oldKey = "did:old\u0000message";
    const newKey = "did:new\u0000message";
    const oldStatus = { followUpId: "private", completed: false, note: "old viewer note" };
    cache.applyMutation(oldKey, oldStatus);
    assert.equal(readCurrentMessageFollowUpStatus(cache, { cacheKey: oldKey, status: oldStatus }, newKey), null);
    assert.equal(isNoteEditorForViewer({ viewerDid: "did:old", followUpId: "private" }, "did:new"), false);
});

test("cross-view note edits and clears update cached private notes without changing status", () => {
    const cache = new MessageFollowUpStatusCache();
    const key = "did:viewer\u0000message";
    cache.applyMutation(key, { followUpId: "follow-up", completed: false, note: "old" });
    cache.updateFollowUp("follow-up", (status) => ({ ...status, note: "new" }));
    assert.deepEqual(cache.get(key), { followUpId: "follow-up", completed: false, note: "new" });
    cache.updateFollowUp("follow-up", ({ note: _note, ...status }) => status);
    assert.deepEqual(cache.get(key), { followUpId: "follow-up", completed: false });
});

test("the UI uses private follow-up actions and covers all three existing message action surfaces", () => {
    const actionSource = readFileSync("src/components/modules/chat/message-follow-up-action.tsx", "utf8");
    const roomSource = readFileSync("src/components/modules/chat/chat-room.tsx", "utf8");

    assert.match(actionSource, /markMessageForFollowUpAction/);
    assert.match(actionSource, /updateMessageFollowUpNoteAction/);
    assert.match(actionSource, /never posted to the conversation/);
    assert.match(actionSource, /viewerDid/);
    assert.match(actionSource, /savedFollowUps/);
    assert.match(actionSource, /`\$\{viewerDid\}\\u0000\$\{messageId\}`/);
    assert.match(actionSource, /getMessageFollowUpStatusesAction/);
    assert.match(actionSource, /status\.completed/);
    assert.match(actionSource, /applyMessageFollowUpStatus/);
    assert.match(actionSource, /updateCachedMessageFollowUpCompletion/);
    assert.match(actionSource, /savingRef\.current/);
    assert.match(actionSource, /FOLLOW_UP_STATUS_BATCH_MAX/);
    assert.match(actionSource, /DialogContent/);
    assert.match(actionSource, /Textarea/);
    assert.match(actionSource, /Private follow-up note/);
    assert.doesNotMatch(actionSource, /window\.prompt/);
    assert.doesNotMatch(actionSource, /setInterval|setTimeout/);
    assert.doesNotMatch(actionSource, /setReplyToMessage|sendMessageAction|sendComposedMessageAction/);
    const failedSaveBranch = actionSource.slice(
        actionSource.indexOf("if (!result.success)"),
        actionSource.indexOf("} catch (saveError)"),
    );
    assert.match(failedSaveBranch, /setError/);
    assert.doesNotMatch(failedSaveBranch, /setNote\(/);
    assert.match(
        failedSaveBranch,
        /setError[\s\S]*return;\s*}[\s\S]*updateCachedMessageFollowUpNote[\s\S]*setEditor\(null\)/,
    );
    assert.equal((roomSource.match(/<MessageFollowUpAction/g) || []).length, 3);
    assert.equal((roomSource.match(/<MessageFollowUpIndicator/g) || []).length, 3);
    assert.equal((roomSource.match(/useHydrateMessageFollowUpStatuses/g) || []).length, 3);
    assert.equal((roomSource.match(/<MessageFollowUpNoteDialog/g) || []).length, 1);
    assert.match(roomSource, /toggleMobileMessageActions/);
    assert.match(roomSource, /setHoveredReplyId/);
    assert.match(roomSource, /canFollowUpStarter/);
    assert.match(roomSource, /canFollowUpReply/);
    assert.match(roomSource, /canFollowUpMessage/);
    assert.match(actionSource, /requestPrivateNote\(viewerDid, status!\.followUpId, status!\.note\)/);
    assert.match(actionSource, /aria-label="Edit private follow-up note"/);
    assert.match(actionSource, /text-\[#315C3D\]/);
    assert.match(actionSource, /after:-inset-2/);
    assert.match(actionSource, /role="alert"/);
    assert.match(actionSource, /detail\.viewerDid !== viewerDid/);
});
