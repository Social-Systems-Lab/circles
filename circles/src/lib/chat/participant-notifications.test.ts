import assert from "node:assert/strict";
import test from "node:test";
import {
    getParticipantNotificationDids,
    isPrivateParticipantNotificationConversation,
    PARTICIPANT_MESSAGE_NOTIFICATION_TYPE,
} from "./participant-notifications";

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
