import { ObjectId } from "mongodb";

export const shouldApplyConversationMute = (type: string, roomId: unknown): roomId is string =>
    (type === "pm_received" || type === "chat_mention") && typeof roomId === "string" && ObjectId.isValid(roomId);

export const filterMutedConversationRecipients = async <T extends { did: string }>(
    type: string,
    roomId: unknown,
    recipients: T[],
    findMutedDids: (conversationId: string, recipientDids: string[]) => Promise<string[]>,
    logError: (message: string, context: Record<string, unknown>) => void = console.error,
): Promise<T[]> => {
    if (!shouldApplyConversationMute(type, roomId) || recipients.length === 0) return recipients;

    try {
        const mutedDids = new Set(
            await findMutedDids(
                roomId,
                recipients.map((recipient) => recipient.did),
            ),
        );
        return recipients.filter((recipient) => !mutedDids.has(recipient.did));
    } catch (error) {
        logError("Conversation mute preference lookup failed; delivering notifications", {
            event: "chat_mute_preference_lookup_failed",
            notificationType: type,
            conversationId: roomId,
            recipientCount: recipients.length,
            errorName: error instanceof Error ? error.name : "UnknownError",
        });
        return recipients;
    }
};
