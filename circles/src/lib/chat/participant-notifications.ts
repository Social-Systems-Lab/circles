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
import { ObjectId } from "mongodb";
import { Circles } from "@/lib/data/db";
import { extractChatMentionIds } from "./mention-markup";

export async function resolveChatMentionRecipientDids(
    conversation: any,
    senderDid: string,
    messageBody: string,
): Promise<string[]> {
    const participantDids = new Set(
        ((conversation?.participants || []) as unknown[]).filter(
            (did): did is string => typeof did === "string" && did.length > 0,
        ),
    );
    const mentionedDids = new Set<string>();
    await Promise.all(
        extractChatMentionIds(messageBody).map(async (mentionId) => {
            const clauses: any[] = [{ handle: mentionId }, { did: mentionId }];
            if (ObjectId.isValid(mentionId)) clauses.push({ _id: new ObjectId(mentionId) });
            const circle = await Circles.findOne({ $or: clauses }, { projection: { did: 1 } });
            if (circle?.did && circle.did !== senderDid && participantDids.has(circle.did))
                mentionedDids.add(circle.did);
        }),
    );
    return Array.from(mentionedDids);
}
