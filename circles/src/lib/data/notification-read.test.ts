import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { getNotificationIdempotencyId, markNotificationReadForUser, parseNotificationId } from "./notification-read";

test("notification idempotency IDs include notification type", () => {
    const first = getNotificationIdempotencyId("circle_moderation_update", "shared-key", "did:example:owner");
    const second = getNotificationIdempotencyId("chat_mention", "shared-key", "did:example:owner");
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(first, second);
});

test("marks ObjectId and deterministic SHA-256 notification IDs for only the authenticated user", async () => {
    const objectId = new ObjectId();
    const digest = "a".repeat(64);
    const rows = [
        { _id: objectId, userId: "did:example:owner", isRead: false },
        { _id: digest, userId: "did:example:owner", isRead: false },
        { _id: digest, userId: "did:example:other", isRead: false },
    ];
    const notifications = {
        updateOne: async (filter: any) => {
            const row = rows.find((item) => item._id.toString() === filter._id.toString() && item.userId === filter.userId);
            if (row) row.isRead = true;
            return { matchedCount: row ? 1 : 0 };
        },
    };

    assert.equal((await markNotificationReadForUser(notifications, objectId.toString(), "did:example:owner"))?.matchedCount, 1);
    assert.equal((await markNotificationReadForUser(notifications, digest, "did:example:owner"))?.matchedCount, 1);
    assert.equal(rows[2].isRead, false, "the same deterministic ID must not authorize a different user");
    assert.equal((await markNotificationReadForUser(notifications, objectId.toString(), "did:example:other"))?.matchedCount, 0);
});

test("rejects malformed notification IDs without querying", async () => {
    let updateCalls = 0;
    const notifications = { updateOne: async () => ({ matchedCount: ++updateCalls }) };
    for (const malformed of [undefined, "", "not-an-id", "a".repeat(63), "g".repeat(64)]) {
        assert.equal(parseNotificationId(malformed), null);
        assert.equal(await markNotificationReadForUser(notifications, malformed, "did:example:owner"), null);
    }
    assert.equal(updateCalls, 0);
});
