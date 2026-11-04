import assert from "node:assert/strict";
import test from "node:test";
import {
    buildChatMentionNotificationMessage,
    presentChatMentionNotificationMessage,
} from "./notification-presentation";

test("chat mentions use the sender and topic title", () => {
    assert.equal(
        buildChatMentionNotificationMessage("Alice", "Budget planning"),
        "Alice mentioned you in “Budget planning”",
    );
});

test("chat mentions use a safe fallback when no topic title is available", () => {
    assert.equal(buildChatMentionNotificationMessage("Alice"), "Alice mentioned you in chat");
});

test("legacy chat mention bodies do not expose canonical DM identifiers", () => {
    assert.equal(
        presentChatMentionNotificationMessage({
            message: "Alice mentioned you in dm-did:example:alice-did:example:bob",
            senderName: "Alice",
            topicTitle: "Budget planning",
        }),
        "Alice mentioned you in “Budget planning”",
    );
});

test("non-legacy stored mention copy remains unchanged", () => {
    assert.equal(
        presentChatMentionNotificationMessage({
            message: "Alice mentioned you in Project chat",
            senderName: "Alice",
            topicTitle: "Budget planning",
        }),
        "Alice mentioned you in Project chat",
    );
});
