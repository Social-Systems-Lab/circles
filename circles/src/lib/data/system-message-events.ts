import { WELCOME_MESSAGE } from "@/config/welcome-message";
import {
    buildSystemMessageMetadata,
    toLegacySystemSource,
} from "@/lib/chat/system-messages";
import type { SystemMessageSource, SystemMessageType } from "@/lib/chat/system-messages";
import { getCircleByDid, getCircleByHandle } from "@/lib/data/circle";
import { ChatMessageDocs } from "@/lib/data/db";
import { createMessage, ensureConversationForCircle } from "@/lib/data/mongo-chat";

const DEFAULT_SYSTEM_SENDER_HANDLE = WELCOME_MESSAGE.senderHandle;
const MEMBERSHIP_EVENT_DEDUPE_WINDOW_MS = 30 * 1000;

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

export const emitCircleMembershipSystemEvent = async (input: {
    circleId: string;
    actorDid: string;
    eventType: "member_joined_circle" | "member_left_circle";
}): Promise<{ created: boolean; messageId: string }> => {
    const conversation = await ensureConversationForCircle(input.circleId);
    const actor = await getCircleByDid(input.actorDid);
    const actorName = actor?.name || actor?.handle || "A member";
    const body =
        input.eventType === "member_joined_circle"
            ? `${actorName} joined this circle.`
            : `${actorName} left this circle.`;

    return await sendSystemMessage({
        conversationId: String(conversation._id),
        body,
        systemType: input.eventType,
        source: "circle_membership",
        actorDid: input.actorDid,
        targetDid: input.actorDid,
        circleId: input.circleId,
        templateKey: input.eventType,
        version: "v1",
        dedupeWindowMs: MEMBERSHIP_EVENT_DEDUPE_WINDOW_MS,
    });
};
