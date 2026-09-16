import type { Circle } from "@/models/models";
import { canReadCircleByLifecycle, canWriteCircleByLifecycle } from "@/lib/data/circle-lifecycle-policy";
import { getCircleVisibility } from "@/lib/data/circle-visibility-policy";

export const CHAT_UNAVAILABLE_MESSAGE = "Chat unavailable";

export type ConversationAccessIntent = "read" | "write";

export type ConversationAccessSubject = {
    _id?: unknown;
    type?: string;
    circleId?: unknown;
    participants?: string[];
};

export type ConversationAccessContext = {
    conversation: ConversationAccessSubject;
    viewerDid: string;
    intent: ConversationAccessIntent;
    ownerCircle?: Partial<Circle> | null;
    canonicalMember: boolean;
    chatMember: boolean;
};

export const buildConversationScopedReplyFilter = (conversationId: string, replyObjectIds: unknown[]) => ({
    _id: { $in: replyObjectIds },
    conversationId,
});

/** Canonical chat owners are organization Circles or projects, never personal profiles or malformed rows. */
export const isValidCircleChatOwner = (circle?: Partial<Circle> | null): boolean =>
    circle?.circleType === "circle" || circle?.circleType === "project";

/** Pure policy used by both single-room and batched browser-facing authorization. */
export const evaluateConversationAccess = ({
    conversation,
    viewerDid,
    intent,
    ownerCircle,
    canonicalMember,
    chatMember,
}: ConversationAccessContext): boolean => {
    const hasCircleOwner = conversation.circleId !== undefined && conversation.circleId !== null;

    // A DM is participant-owned. Attaching Circle ownership is contradictory and fails closed.
    if (conversation.type === "dm") {
        return !hasCircleOwner && Boolean(conversation.participants?.includes(viewerDid));
    }

    if (hasCircleOwner) {
        const circleId = typeof conversation.circleId === "string" ? conversation.circleId : "";
        const resolvedCircleId = ownerCircle?._id?.toString?.() || "";
        if (!circleId || !isValidCircleChatOwner(ownerCircle) || resolvedCircleId !== circleId) return false;
        if (intent === "read" ? !canReadCircleByLifecycle(ownerCircle) : !canWriteCircleByLifecycle(ownerCircle)) {
            return false;
        }
        if (getCircleVisibility(ownerCircle) === "secret" && !canonicalMember) return false;
    }

    if (conversation.type === "announcement") {
        return Boolean(conversation.participants?.includes(viewerDid));
    }

    return chatMember;
};
