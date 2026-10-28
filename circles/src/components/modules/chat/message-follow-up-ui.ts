import { normalizeSystemMessageMetadata } from "@/lib/chat/system-messages";

type FollowUpEligibleMessage = {
    id?: string;
    type?: string;
    status?: string;
    source?: string;
    system?: { messageType?: string; systemType?: string; source?: string };
};

const isNormalizedSystemMessage = (message: FollowUpEligibleMessage): boolean =>
    normalizeSystemMessageMetadata({ source: message.source, system: message.system }).messageType === "system" ||
    message.source === "circle_moderation" ||
    message.source === "platform_admin" ||
    message.source?.startsWith("system_") === true;

export const canShowMessageFollowUpAction = (message: FollowUpEligibleMessage): boolean =>
    message.type === "m.room.message" &&
    !isNormalizedSystemMessage(message) &&
    typeof message.id === "string" &&
    /^[0-9a-fA-F]{24}$/.test(message.id) &&
    message.status !== "pending" &&
    message.status !== "failed";

export const canShowExistingReplyActions = (message: { status?: string }, canReply: boolean): boolean =>
    canReply && !message.status;

export const isOpenMessageFollowUpStatus = (status?: { followUpId?: string; completed?: boolean } | null): boolean =>
    !!status?.followUpId && status.completed !== true;
