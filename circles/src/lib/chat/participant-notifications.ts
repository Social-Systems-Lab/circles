export const CIRCLE_MODERATION_SOURCE = "circle_moderation";
export const PARTICIPANT_MESSAGE_NOTIFICATION_TYPE = "pm_received" as const;

export function isPrivateParticipantNotificationConversation(conversation: any): boolean {
    return (
        conversation?.type === "dm" ||
        conversation?.metadata?.source === "circle_contact" ||
        conversation?.metadata?.source === CIRCLE_MODERATION_SOURCE
    );
}

export function getParticipantNotificationDids(
    conversation: any,
    senderDid: string,
    excludedDids: Set<string> = new Set(),
): string[] {
    return Array.from(
        new Set(
            (conversation?.participants || []).filter(
                (participantDid: unknown): participantDid is string =>
                    typeof participantDid === "string" &&
                    participantDid.length > 0 &&
                    participantDid !== senderDid &&
                    !excludedDids.has(participantDid),
            ),
        ),
    );
}
