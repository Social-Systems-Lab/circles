"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import {
    CHAT_FOLLOW_UP_UNAVAILABLE,
    listAuthorizedMessageFollowUps,
    markMessageForFollowUp,
    setFollowUpCompleted,
    parseChatFollowUpListOptions,
    updateFollowUpNote,
} from "@/lib/data/chat-message-followups";
import { resolveMongoConversationAccessBatch } from "./mongo-actions";

const canReadConversations = (ownerDid: string, conversationIds: string[]) =>
    resolveMongoConversationAccessBatch(conversationIds, ownerDid, "read");

export async function markMessageForFollowUpAction(messageId: string) {
    const ownerDid = await getAuthenticatedUserDid();
    if (!ownerDid) return { success: false, message: "Not authenticated" };
    const followUp = await markMessageForFollowUp(ownerDid, messageId, canReadConversations);
    return followUp ? { success: true, followUp } : { success: false, message: CHAT_FOLLOW_UP_UNAVAILABLE };
}

export async function updateMessageFollowUpNoteAction(followUpId: string, note: string) {
    const ownerDid = await getAuthenticatedUserDid();
    if (!ownerDid) return { success: false, message: "Not authenticated" };
    try {
        const success = await updateFollowUpNote(ownerDid, followUpId, note);
        return success ? { success: true } : { success: false, message: CHAT_FOLLOW_UP_UNAVAILABLE };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Invalid private note" };
    }
}

export async function setMessageFollowUpCompletedAction(followUpId: string, completed: boolean) {
    const ownerDid = await getAuthenticatedUserDid();
    if (!ownerDid) return { success: false, message: "Not authenticated" };
    if (typeof completed !== "boolean") return { success: false, message: CHAT_FOLLOW_UP_UNAVAILABLE };
    const success = await setFollowUpCompleted(ownerDid, followUpId, completed);
    return success ? { success: true } : { success: false, message: CHAT_FOLLOW_UP_UNAVAILABLE };
}

export async function listMessageFollowUpsAction(options?: unknown) {
    const ownerDid = await getAuthenticatedUserDid();
    if (!ownerDid) return { success: false, message: "Not authenticated" };
    const parsed = parseChatFollowUpListOptions(options);
    if (!parsed.success) return { success: false, message: "Invalid request" };
    const result = await listAuthorizedMessageFollowUps(ownerDid, parsed.options, canReadConversations);
    return { success: true, ...result };
}
