import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canShowExistingReplyActions, canShowMessageFollowUpAction } from "./message-follow-up-ui";

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
    assert.match(failedSaveBranch, /setError[\s\S]*return;\s*}\s*setFollowUpId\(null\)/);
    assert.equal((roomSource.match(/<MessageFollowUpAction/g) || []).length, 3);
    assert.equal((roomSource.match(/useHydrateMessageFollowUpStatuses/g) || []).length, 3);
    assert.equal((roomSource.match(/<MessageFollowUpNoteDialog/g) || []).length, 1);
    assert.match(roomSource, /toggleMobileMessageActions/);
    assert.match(roomSource, /setHoveredReplyId/);
    assert.match(roomSource, /canFollowUpStarter/);
    assert.match(roomSource, /canFollowUpReply/);
    assert.match(roomSource, /canFollowUpMessage/);
});
