import { WELCOME_MESSAGE } from "@/config/welcome-message";
import {
    buildSystemMessageMetadata,
    toLegacySystemSource,
} from "@/lib/chat/system-messages";
import type { SystemMessageSource, SystemMessageType } from "@/lib/chat/system-messages";
import { getCircleByDid, getCircleByHandle } from "@/lib/data/circle";
import { ChatMessageDocs } from "@/lib/data/db";
import { createMessage } from "@/lib/data/mongo-chat";

const DEFAULT_SYSTEM_SENDER_HANDLE = WELCOME_MESSAGE.senderHandle;
const GROUP_CHAT_EVENT_DEDUPE_WINDOW_MS = 30 * 1000;

const resolveSystemSenderDid = async (): Promise<string> => {
    const systemCircle = await getCircleByHandle(DEFAULT_SYSTEM_SENDER_HANDLE);
    return systemCircle?.did || `system:${DEFAULT_SYSTEM_SENDER_HANDLE}`;
};

export const buildWelcomeSystemMessageMetadata = (input: {
    targetDid: string;
    repliesDisabled: boolean;
    version: string;
}): ReturnType<typeof buildSystemMessageMetadata> =>
    buildSystemMessageMetadata({
        systemType: "welcome",
        source: "signup",
        targetDid: input.targetDid,
        repliesDisabled: input.repliesDisabled,
        templateKey: "welcome",
        version: input.version,
    });

export const sendSystemMessage = async (input: {
    conversationId: string;
    body: string;
    systemType: SystemMessageType;
    source: SystemMessageSource;
    actorDid?: string;
    targetDid?: string;
    circleId?: string;
    chatRoomId?: string;
    repliesDisabled?: boolean;
    templateKey?: string;
    version?: string;
    format?: "markdown";
    senderDid?: string;
    dedupeWindowMs?: number;
}): Promise<{ created: boolean; messageId: string }> => {
    if (!input.conversationId) {
        throw new Error("Missing conversationId for system message");
    }

    const systemMetadata = buildSystemMessageMetadata({
        systemType: input.systemType,
        source: input.source,
        actorDid: input.actorDid,
        targetDid: input.targetDid,
        circleId: input.circleId,
        chatRoomId: input.chatRoomId,
        repliesDisabled: input.repliesDisabled,
        templateKey: input.templateKey,
        version: input.version,
    });

    const dedupeWindowMs = Math.max(0, input.dedupeWindowMs || 0);
    if (dedupeWindowMs > 0) {
        const dedupeFilter: Record<string, unknown> = {
            conversationId: input.conversationId,
            "system.messageType": "system",
            "system.systemType": input.systemType,
            createdAt: { $gte: new Date(Date.now() - dedupeWindowMs) },
        };

        if (input.actorDid) dedupeFilter["system.actorDid"] = input.actorDid;
        if (input.targetDid) dedupeFilter["system.targetDid"] = input.targetDid;
        if (input.circleId) dedupeFilter["system.circleId"] = input.circleId;
        if (input.chatRoomId) dedupeFilter["system.chatRoomId"] = input.chatRoomId;

        const duplicate = await ChatMessageDocs.findOne(dedupeFilter, { sort: { createdAt: -1 } });
        if (duplicate?._id) {
            return { created: false, messageId: String(duplicate._id) };
        }
    }

    const senderDid = input.senderDid || (await resolveSystemSenderDid());
    const created = await createMessage({
        conversationId: input.conversationId,
        senderDid,
        body: input.body,
        createdAt: new Date(),
        format: input.format,
        source: toLegacySystemSource(input.systemType),
        version: input.version,
        system: systemMetadata,
    });

    return { created: true, messageId: String(created._id) };
};

type GroupChatMembershipEventType = Extract<
    SystemMessageType,
    "group_chat_joined" | "group_chat_left" | "group_chat_member_added" | "group_chat_member_removed"
>;

const getDisplayName = (circle?: { name?: string; handle?: string } | null): string =>
    circle?.name || circle?.handle || "A member";

const buildGroupChatEventBody = (input: {
    eventType: GroupChatMembershipEventType;
    actorName?: string;
    targetName: string;
}): string => {
    switch (input.eventType) {
        case "group_chat_joined":
            return `${input.targetName} joined the group chat.`;
        case "group_chat_left":
            return `${input.targetName} left the group chat.`;
        case "group_chat_member_added":
            return input.actorName
                ? `${input.actorName} added ${input.targetName} to the group chat.`
                : `${input.targetName} was added to the group chat.`;
        case "group_chat_member_removed":
            return input.actorName
                ? `${input.actorName} removed ${input.targetName} from the group chat.`
                : `${input.targetName} was removed from the group chat.`;
        default:
            return `${input.targetName} was updated in the group chat.`;
    }
};

export const emitGroupChatMembershipSystemEvent = async (input: {
    conversationId: string;
    eventType: GroupChatMembershipEventType;
    actorDid?: string;
    targetDid: string;
}): Promise<{ created: boolean; messageId: string }> => {
    const [actor, target] = await Promise.all([
        input.actorDid ? getCircleByDid(input.actorDid) : Promise.resolve(null),
        getCircleByDid(input.targetDid),
    ]);
    const targetName = getDisplayName(target);
    const actorName =
        input.actorDid && input.actorDid !== input.targetDid ? getDisplayName(actor) : undefined;
    const body = buildGroupChatEventBody({
        eventType: input.eventType,
        actorName,
        targetName,
    });

    return await sendSystemMessage({
        conversationId: input.conversationId,
        body,
        systemType: input.eventType,
        source: "group_chat_membership",
        actorDid: input.actorDid,
        targetDid: input.targetDid,
        chatRoomId: input.conversationId,
        templateKey: input.eventType,
        version: "v1",
        dedupeWindowMs: GROUP_CHAT_EVENT_DEDUPE_WINDOW_MS,
    });
};
