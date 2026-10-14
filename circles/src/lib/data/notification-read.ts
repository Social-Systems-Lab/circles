import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export const getNotificationIdempotencyId = (type: string, idempotencyKey: string, userId: string) =>
    createHash("sha256").update(`${type}:${idempotencyKey}:${userId}`).digest("hex");

export function parseNotificationId(notificationId: unknown): ObjectId | string | null {
    if (typeof notificationId !== "string") return null;
    if (ObjectId.isValid(notificationId) && new ObjectId(notificationId).toString() === notificationId.toLowerCase()) {
        return new ObjectId(notificationId);
    }
    return SHA256_HEX_PATTERN.test(notificationId) ? notificationId.toLowerCase() : null;
}

export async function markNotificationReadForUser(
    notifications: { updateOne: (filter: any, update: any) => Promise<{ matchedCount: number }> },
    notificationId: unknown,
    userDid: string,
) {
    const parsedId = parseNotificationId(notificationId);
    if (parsedId === null) return null;
    return notifications.updateOne({ _id: parsedId, userId: userDid }, { $set: { isRead: true } });
}
