import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { ChatConversations, ChatMessageDocs, Notifications, ensureRequiredChatIndexes } from "@/lib/data/db";
import { getCircleByDid } from "@/lib/data/circle";
import { sendNotifications } from "@/lib/data/notifications";
import {
    getChatNotificationLocation,
    getParticipantNotificationDids,
    resolveChatMentionRecipientDids,
} from "./participant-notifications";
import { buildChatMentionNotificationMessage } from "./notification-presentation";

const LEASE_MS = 60_000;
const RETRY_DELAY_MS = 30_000;

export async function processFirstTopicNotifications(limit = 25, topicId?: string) {
    await ensureRequiredChatIndexes();
    let delivered = 0;
    let failed = 0;
    for (let index = 0; index < Math.max(0, Math.min(limit, 100)); index += 1) {
        const now = new Date();
        const token = randomUUID();
        const claimed = await ChatMessageDocs.findOneAndUpdate(
            {
                ...(topicId ? { _id: new ObjectId(topicId) } : {}),
                $or: [
                    {
                        "firstTopicNotification.state": "pending",
                        $or: [
                            { "firstTopicNotification.retryAfter": { $exists: false } },
                            { "firstTopicNotification.retryAfter": { $lte: now } },
                        ],
                    },
                    {
                        "firstTopicNotification.state": "processing",
                        "firstTopicNotification.leaseUntil": { $lte: now },
                    },
                ],
            },
            {
                $set: {
                    "firstTopicNotification.state": "processing",
                    "firstTopicNotification.processingToken": token,
                    "firstTopicNotification.leaseUntil": new Date(now.getTime() + LEASE_MS),
                    "firstTopicNotification.lastAttemptAt": now,
                },
                $inc: { "firstTopicNotification.attempts": 1 },
                $unset: {
                    "firstTopicNotification.lastError": "",
                    "firstTopicNotification.retryAfter": "",
                },
            },
            { sort: { createdAt: 1 }, returnDocument: "after" },
        );
        if (!claimed) break;
        try {
            const conversation = await ChatConversations.findOne({ _id: new ObjectId(claimed.conversationId) });
            if (
                !conversation ||
                conversation.type !== "dm" ||
                conversation.archived === true ||
                conversation.metadata?.dmProvisional === true ||
                conversation.participants.length !== 2 ||
                !conversation.participants.includes(claimed.senderDid) ||
                !claimed.thread ||
                claimed.threadId
            ) {
                throw new Error("First-topic conversation is not visible");
            }
            const messagePreview = claimed.body.trim() || claimed.thread.title || "New topic";
            const mentionRecipientDids = await resolveChatMentionRecipientDids(
                conversation,
                claimed.senderDid,
                claimed.body,
            );
            const mentionDidSet = new Set(mentionRecipientDids);
            const participantRecipientDids = getParticipantNotificationDids(
                conversation,
                claimed.senderDid,
                mentionDidSet,
            );
            const sender = await getCircleByDid(claimed.senderDid);
            if (!sender?.did) throw new Error("Notification sender is unavailable");
            const notificationTopicId = claimed._id.toString();
            const topicTitle = claimed.thread.title?.trim() || undefined;
            const idempotencyKey = `first-topic:${notificationTopicId}`;
            const commonPayload = {
                ...getChatNotificationLocation(claimed.conversationId, notificationTopicId),
                user: sender,
                conversationName: conversation.name,
                topicTitle,
                messagePreview,
            };
            const persistentNotificationIds = (
                await Promise.all([
                    sendNotifications(
                        "pm_received",
                        participantRecipientDids.map((did) => ({ did })),
                        commonPayload,
                        { idempotencyKey },
                    ),
                    sendNotifications(
                        "chat_mention",
                        mentionRecipientDids.map((did) => ({ did })),
                        {
                            ...commonPayload,
                            messageBody: buildChatMentionNotificationMessage(sender.name, topicTitle),
                        },
                        { idempotencyKey },
                    ),
                ])
            ).flat();
            if (
                (await Notifications.countDocuments({ _id: { $in: persistentNotificationIds } } as any)) !==
                persistentNotificationIds.length
            ) {
                throw new Error("Persistent first-topic notifications were not created");
            }
            const result = await ChatMessageDocs.updateOne(
                {
                    _id: claimed._id,
                    "firstTopicNotification.state": "processing",
                    "firstTopicNotification.processingToken": token,
                },
                {
                    $set: {
                        "firstTopicNotification.state": "delivered",
                        "firstTopicNotification.deliveredAt": new Date(),
                    },
                    $unset: {
                        "firstTopicNotification.leaseUntil": "",
                        "firstTopicNotification.processingToken": "",
                        "firstTopicNotification.lastError": "",
                        "firstTopicNotification.retryAfter": "",
                    },
                },
            );
            if (result.modifiedCount === 1) delivered += 1;
            if (topicId) break;
        } catch (error) {
            failed += 1;
            await ChatMessageDocs.updateOne(
                {
                    _id: claimed._id,
                    "firstTopicNotification.state": "processing",
                    "firstTopicNotification.processingToken": token,
                },
                {
                    $set: {
                        "firstTopicNotification.state": "pending",
                        "firstTopicNotification.lastError":
                            error instanceof Error ? error.message.slice(0, 500) : "Unknown notification error",
                        "firstTopicNotification.retryAfter": new Date(Date.now() + RETRY_DELAY_MS),
                    },
                    $unset: { "firstTopicNotification.leaseUntil": "", "firstTopicNotification.processingToken": "" },
                },
            );
            if (topicId) break;
        }
    }
    return { delivered, failed };
}
