import { ObjectId } from "mongodb";
import type { ChatConversation, ChatMessageDoc, ChatReadState, MessageEmailReminder } from "@/lib/chat/mongo-types";
import { ChatConversations, ChatMessageDocs, ChatReadStates, Circles, MessageEmailReminders } from "./db";
import { sendEmail } from "./email";

export const MESSAGE_REMINDER_DELAY_MS = 60 * 60 * 1000;
const DEFAULT_PROCESS_LIMIT = 100;

MessageEmailReminders?.createIndex({ messageId: 1, recipientDid: 1 }, { unique: true });
MessageEmailReminders?.createIndex({ status: 1, dueAt: 1 });

const toObjectId = (value?: string | null) => {
    if (!value) return null;
    try {
        return new ObjectId(value);
    } catch {
        return null;
    }
};

const truncatePreview = (value: string, maxLength: number = 160): string => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}...`;
};

const buildChatUrl = (conversationId: string): string => {
    const baseUrl = (process.env.CIRCLES_URL || "http://localhost:3000").replace(/\/+$/, "");
    return `${baseUrl}/chat/${conversationId}`;
};

const hasReadConversationAfterMessage = async ({
    conversationId,
    recipientDid,
    messageId,
    readState,
}: {
    conversationId: string;
    recipientDid: string;
    messageId: string;
    readState: ChatReadState | null;
}): Promise<boolean> => {
    if (!readState?.lastReadMessageId) {
        return false;
    }

    const lastReadObjectId = toObjectId(readState.lastReadMessageId);
    const messageObjectId = toObjectId(messageId);
    if (!lastReadObjectId || !messageObjectId) {
        return false;
    }

    // Use the same ObjectId boundary model as chat unread counting:
    // if there are no incoming messages between the last-read marker and this message,
    // then this message has already been read by the recipient.
    const unreadMessageAtOrBeforeTarget = await ChatMessageDocs.findOne({
        conversationId,
        senderDid: { $ne: recipientDid },
        _id: {
            $gt: lastReadObjectId,
            $lte: messageObjectId,
        },
    });

    return !unreadMessageAtOrBeforeTarget;
};

const markReminderSkipped = async (reminderId: any, reason: string) => {
    await MessageEmailReminders.updateOne(
        { _id: reminderId },
        {
            $set: {
                status: "skipped",
                skipReason: reason,
                skippedAt: new Date(),
                updatedAt: new Date(),
            },
        },
    );
};

const markReminderFailed = async (reminderId: any, reason: string) => {
    await MessageEmailReminders.updateOne(
        { _id: reminderId },
        {
            $set: {
                status: "failed",
                failureReason: reason,
                failedAt: new Date(),
                updatedAt: new Date(),
            },
        },
    );
};

const markReminderSent = async (reminderId: any) => {
    await MessageEmailReminders.updateOne(
        { _id: reminderId },
        {
            $set: {
                status: "sent",
                sentAt: new Date(),
                updatedAt: new Date(),
            },
        },
    );
};

const isEligibleReminderConversation = (conversation: ChatConversation | null, reminder: MessageEmailReminder): boolean => {
    if (!conversation || conversation.type !== "dm") {
        return false;
    }

    if (!conversation.participants?.includes(reminder.senderDid)) {
        return false;
    }

    if (!conversation.participants?.includes(reminder.recipientDid)) {
        return false;
    }

    return reminder.senderDid !== reminder.recipientDid;
};

type MessageEmailReminderProcessResult = {
    outcome: "sent" | "skipped" | "failed";
    status: "sent" | "skipped" | "failed";
    skipReason?: string;
    failureReason?: string;
};

const processClaimedMessageEmailReminder = async (
    claimed: MessageEmailReminder,
): Promise<MessageEmailReminderProcessResult> => {
    try {
        const conversationObjectId = toObjectId(claimed.conversationId);
        const messageObjectId = toObjectId(claimed.messageId);
        if (!conversationObjectId || !messageObjectId) {
            const skipReason = "invalid_ids";
            await markReminderSkipped(claimed._id, skipReason);
            return {
                outcome: "skipped",
                status: "skipped",
                skipReason,
            };
        }

        const [conversation, message, readState, recipient, sender] = await Promise.all([
            ChatConversations.findOne({ _id: conversationObjectId }) as Promise<ChatConversation | null>,
            ChatMessageDocs.findOne({ _id: messageObjectId }) as Promise<ChatMessageDoc | null>,
            ChatReadStates.findOne({
                conversationId: claimed.conversationId,
                userDid: claimed.recipientDid,
            }) as Promise<ChatReadState | null>,
            Circles.findOne(
                { did: claimed.recipientDid, circleType: "user" },
                { projection: { did: 1, name: 1, handle: 1, email: 1, emailMissedMessages: 1 } },
            ),
            Circles.findOne(
                { did: claimed.senderDid, circleType: "user" },
                { projection: { did: 1, name: 1, handle: 1 } },
            ),
        ]);

        if (!message || message.conversationId !== claimed.conversationId || message.senderDid !== claimed.senderDid) {
            const skipReason = "message_missing";
            await markReminderSkipped(claimed._id, skipReason);
            return {
                outcome: "skipped",
                status: "skipped",
                skipReason,
            };
        }

        if (!isEligibleReminderConversation(conversation, claimed)) {
            const skipReason = "conversation_ineligible";
            await markReminderSkipped(claimed._id, skipReason);
            return {
                outcome: "skipped",
                status: "skipped",
                skipReason,
            };
        }

        if (recipient?.emailMissedMessages !== true) {
            const skipReason = "missed_message_emails_disabled";
            await markReminderSkipped(claimed._id, skipReason);
            return {
                outcome: "skipped",
                status: "skipped",
                skipReason,
            };
        }

        if (!recipient.email) {
            const skipReason = "missing_email";
            await markReminderSkipped(claimed._id, skipReason);
            return {
                outcome: "skipped",
                status: "skipped",
                skipReason,
            };
        }

        if (
            await hasReadConversationAfterMessage({
                conversationId: claimed.conversationId,
                recipientDid: claimed.recipientDid,
                messageId: claimed.messageId,
                readState,
            })
        ) {
            const skipReason = "conversation_read";
            await markReminderSkipped(claimed._id, skipReason);
            return {
                outcome: "skipped",
                status: "skipped",
                skipReason,
            };
        }

        if (!process.env.POSTMARK_API_TOKEN || !process.env.POSTMARK_SENDER_EMAIL) {
            const failureReason = "postmark_not_configured";
            await markReminderFailed(claimed._id, failureReason);
            return {
                outcome: "failed",
                status: "failed",
                failureReason,
            };
        }

        const senderName = sender?.name || sender?.handle || "Someone";
        const messagePreview = truncatePreview(message.body || "Sent you a message");

        await sendEmail({
            to: recipient.email,
            templateAlias: "notification-reminder",
            templateModel: {
                name: recipient.name || recipient.handle || "there",
                notifications: [`${senderName} sent you a message: ${messagePreview}`],
                actionUrl: buildChatUrl(claimed.conversationId),
            },
        });

        await markReminderSent(claimed._id);
        return {
            outcome: "sent",
            status: "sent",
        };
    } catch (error) {
        const failureReason = error instanceof Error ? error.message : "unexpected_error";
        await markReminderFailed(claimed._id, failureReason);
        return {
            outcome: "failed",
            status: "failed",
            failureReason,
        };
    }
};

export const enqueueMessageEmailReminders = async ({
    messageId,
    conversation,
    senderDid,
    recipientDids,
}: {
    messageId: string;
    conversation?: ChatConversation | null;
    senderDid: string;
    recipientDids: string[];
}): Promise<number> => {
    if (!messageId || conversation?.type !== "dm") {
        return 0;
    }

    const uniqueRecipientDids = Array.from(
        new Set(
            (recipientDids || []).filter(
                (recipientDid) => typeof recipientDid === "string" && recipientDid.length > 0 && recipientDid !== senderDid,
            ),
        ),
    );
    if (!uniqueRecipientDids.length) {
        return 0;
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + MESSAGE_REMINDER_DELAY_MS);
    let createdCount = 0;

    for (const recipientDid of uniqueRecipientDids) {
        const result = await MessageEmailReminders.updateOne(
            { messageId, recipientDid },
            {
                $setOnInsert: {
                    messageId,
                    conversationId: String(conversation._id),
                    senderDid,
                    recipientDid,
                    dueAt,
                    status: "pending",
                    createdAt: now,
                    updatedAt: now,
                } satisfies MessageEmailReminder,
            },
            { upsert: true },
        );

        createdCount += result.upsertedCount || 0;
    }

    return createdCount;
};

export const processDueMessageEmailReminders = async (limit: number = DEFAULT_PROCESS_LIMIT) => {
    const stats = {
        scanned: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
    };

    const dueReminders = await MessageEmailReminders.find({
        status: "pending",
        dueAt: { $lte: new Date() },
    })
        .sort({ dueAt: 1, _id: 1 })
        .limit(Math.max(1, limit))
        .toArray();

    for (const reminder of dueReminders as MessageEmailReminder[]) {
        const claimed = await MessageEmailReminders.findOneAndUpdate(
            { _id: reminder._id, status: "pending" },
            {
                $set: {
                    status: "processing",
                    processingStartedAt: new Date(),
                    updatedAt: new Date(),
                },
            },
            { returnDocument: "after" },
        );
        if (!claimed?._id) {
            continue;
        }

        stats.scanned += 1;
        const result = await processClaimedMessageEmailReminder(claimed);
        stats[result.outcome] += 1;
    }

    return stats;
};

export const processMessageEmailReminderById = async (reminderId: string) => {
    const reminderObjectId = toObjectId(reminderId);
    if (!reminderObjectId) {
        return {
            ok: false as const,
            code: "invalid_id" as const,
            reminderId,
        };
    }

    const existingReminder = await MessageEmailReminders.findOne({ _id: reminderObjectId });
    if (!existingReminder?._id) {
        return {
            ok: false as const,
            code: "not_found" as const,
            reminderId,
        };
    }

    const claimed = await MessageEmailReminders.findOneAndUpdate(
        { _id: reminderObjectId, status: "pending" },
        {
            $set: {
                status: "processing",
                processingStartedAt: new Date(),
                updatedAt: new Date(),
            },
        },
        { returnDocument: "after" },
    );

    if (!claimed?._id) {
        const currentReminder = await MessageEmailReminders.findOne({ _id: reminderObjectId });
        return {
            ok: false as const,
            code: "not_pending" as const,
            reminderId,
            currentStatus: currentReminder?.status || existingReminder.status,
        };
    }

    const result = await processClaimedMessageEmailReminder(claimed);
    const refreshedReminder = await MessageEmailReminders.findOne(
        { _id: reminderObjectId },
        {
            projection: {
                status: 1,
                sentAt: 1,
                skippedAt: 1,
                failedAt: 1,
                skipReason: 1,
                failureReason: 1,
                dueAt: 1,
                processingStartedAt: 1,
                updatedAt: 1,
            },
        },
    );

    return {
        ok: true as const,
        code: "processed" as const,
        reminderId,
        outcome: result.outcome,
        reminder: refreshedReminder,
    };
};
