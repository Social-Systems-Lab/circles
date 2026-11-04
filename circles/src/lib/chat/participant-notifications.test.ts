import assert from "node:assert/strict";
import test from "node:test";
import {
    getChatNotificationLocation,
    getParticipantNotificationDids,
    isPrivateParticipantNotificationConversation,
    PARTICIPANT_MESSAGE_NOTIFICATION_TYPE,
} from "./participant-notifications";

test("chat notification locations deep-link only when a topic is known", () => {
    assert.deepEqual(getChatNotificationLocation("conversation-1", "topic-1"), {
        roomId: "conversation-1",
        topicId: "topic-1",
        url: "/chat/conversation-1?topic=topic-1",
    });
    assert.deepEqual(
        getChatNotificationLocation("conversation-1"),
        { roomId: "conversation-1" },
        "historical and loose-message notifications retain conversation navigation",
    );
});

test("circle moderation replies notify participants other than the sender", () => {
    const conversation = {
        type: "group",
        metadata: { source: "circle_moderation", version: "v1" },
        participants: ["did:example:moderator", "did:example:admin", "did:example:admin"],
    };

    assert.equal(isPrivateParticipantNotificationConversation(conversation), true);
    assert.deepEqual(getParticipantNotificationDids(conversation, "did:example:moderator"), ["did:example:admin"]);
    assert.equal(PARTICIPANT_MESSAGE_NOTIFICATION_TYPE, "pm_received");
});
