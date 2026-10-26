import assert from "node:assert/strict";
import { filterMutedConversationRecipients, shouldApplyConversationMute } from "./conversation-notification-mute";

const roomId = "507f1f77bcf86cd799439011";

assert.equal(shouldApplyConversationMute("pm_received", roomId), true);
assert.equal(shouldApplyConversationMute("chat_mention", roomId), true);
assert.equal(shouldApplyConversationMute("new_follower", roomId), false);
assert.equal(shouldApplyConversationMute("pm_received", "not-a-conversation-id"), false);
assert.equal(shouldApplyConversationMute("pm_received", undefined), false);

const main = async () => {
    const recipients = [{ did: "did:muted" }, { did: "did:enabled" }];
    const filtered = await filterMutedConversationRecipients("pm_received", roomId, recipients, async () => [
        "did:muted",
    ]);
    assert.deepEqual(filtered, [{ did: "did:enabled" }]);

    const errors: Array<{ message: string; context: Record<string, unknown> }> = [];
    const failOpen = await filterMutedConversationRecipients(
        "chat_mention",
        roomId,
        recipients,
        async () => {
            throw new Error("simulated lookup failure with private body: do not log me");
        },
        (message, context) => errors.push({ message, context }),
    );
    assert.deepEqual(failOpen, recipients);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].context.event, "chat_mute_preference_lookup_failed");
    assert.equal(JSON.stringify(errors).includes("private body"), false);

    const unrelated = await filterMutedConversationRecipients("new_follower", roomId, recipients, async () => {
        throw new Error("unrelated notification must not query mute preferences");
    });
    assert.deepEqual(unrelated, recipients);

    console.log("conversation notification mute tests passed");
};

void main();
