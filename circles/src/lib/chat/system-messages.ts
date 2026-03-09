import { isSystemMessageSource } from "@/config/welcome-message";

export type MessageType = "user" | "system";
export type SystemMessageType =
    | "welcome"
    | "group_chat_joined"
    | "group_chat_left"
    | "group_chat_member_added"
    | "group_chat_member_removed"
    | "announcement";
export type SystemMessageSource = "signup" | "group_chat_membership" | "admin";

export type SystemMessageMetadata = {
    messageType: MessageType;
    systemType?: SystemMessageType;
    source?: SystemMessageSource;
    actorDid?: string;
    targetDid?: string;
    circleId?: string;
    chatRoomId?: string;
    repliesDisabled?: boolean;
    templateKey?: string;
    version?: string;
};

export const SYSTEM_TYPE_TO_LEGACY_SOURCE: Record<SystemMessageType, string> = {
    welcome: "system_welcome",
    group_chat_joined: "system_group_chat_joined",
    group_chat_left: "system_group_chat_left",
    group_chat_member_added: "system_group_chat_member_added",
    group_chat_member_removed: "system_group_chat_member_removed",
    announcement: "system_announcement",
};

const LEGACY_SOURCE_TO_SYSTEM_TYPE: Record<string, SystemMessageType> = {
    ...Object.entries(SYSTEM_TYPE_TO_LEGACY_SOURCE).reduce(
        (acc, [systemType, source]) => {
            acc[source] = systemType as SystemMessageType;
            return acc;
        },
        {} as Record<string, SystemMessageType>,
    ),
    // Legacy compatibility from early v1 trials.
    system_member_joined_circle: "group_chat_joined",
    system_member_left_circle: "group_chat_left",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

const normalizeSystemType = (value: unknown): SystemMessageType | undefined => {
    if (
        value === "welcome" ||
        value === "group_chat_joined" ||
        value === "group_chat_left" ||
        value === "group_chat_member_added" ||
        value === "group_chat_member_removed" ||
        value === "announcement"
    ) {
        return value;
    }

    // Legacy compatibility from early v1 trials.
    if (value === "member_joined_circle") return "group_chat_joined";
    if (value === "member_left_circle") return "group_chat_left";
    return undefined;
};

const normalizeSystemSource = (value: unknown): SystemMessageSource | undefined => {
    if (value === "signup" || value === "group_chat_membership" || value === "admin") {
        return value;
    }
    if (value === "circle_membership") {
        return "group_chat_membership";
    }
    return undefined;
};

const inferSourceFromSystemType = (systemType?: SystemMessageType): SystemMessageSource | undefined => {
    if (!systemType) return undefined;
    if (systemType === "welcome") return "signup";
    if (
        systemType === "group_chat_joined" ||
        systemType === "group_chat_left" ||
        systemType === "group_chat_member_added" ||
        systemType === "group_chat_member_removed"
    ) {
        return "group_chat_membership";
    }
    return "admin";
};

const normalizeOptionalString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim().length > 0 ? value : undefined;

export const isSystemMessageMetadata = (metadata?: SystemMessageMetadata | null): boolean =>
    metadata?.messageType === "system";

export const toLegacySystemSource = (systemType: SystemMessageType): string => SYSTEM_TYPE_TO_LEGACY_SOURCE[systemType];

export const buildSystemMessageMetadata = (input: {
    systemType: SystemMessageType;
    source: SystemMessageSource;
    actorDid?: string;
    targetDid?: string;
    circleId?: string;
    chatRoomId?: string;
    repliesDisabled?: boolean;
    templateKey?: string;
    version?: string;
}): SystemMessageMetadata => ({
    messageType: "system",
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

export const normalizeSystemMessageMetadata = (input: {
    source?: string | null;
    version?: string | null;
    system?: unknown;
    repliesDisabled?: boolean;
}): SystemMessageMetadata => {
    if (isRecord(input.system)) {
        const rawSystemType = normalizeSystemType(input.system.systemType);
        const rawSource = normalizeSystemSource(input.system.source) || inferSourceFromSystemType(rawSystemType);
        const rawMessageType = input.system.messageType === "system" ? "system" : input.system.messageType === "user" ? "user" : undefined;

        if (rawMessageType === "user" && !rawSystemType && !rawSource) {
            return { messageType: "user" };
        }

        if (rawMessageType === "system" || rawSystemType || rawSource) {
            return {
                messageType: "system",
                systemType: rawSystemType,
                source: rawSource,
                actorDid: normalizeOptionalString(input.system.actorDid),
                targetDid: normalizeOptionalString(input.system.targetDid),
                circleId: normalizeOptionalString(input.system.circleId),
                chatRoomId: normalizeOptionalString(input.system.chatRoomId),
                repliesDisabled:
                    typeof input.system.repliesDisabled === "boolean" ? input.system.repliesDisabled : input.repliesDisabled,
                templateKey: normalizeOptionalString(input.system.templateKey),
                version: normalizeOptionalString(input.system.version) || normalizeOptionalString(input.version),
            };
        }
    }

    const legacySource = normalizeOptionalString(input.source);
    if (legacySource && isSystemMessageSource(legacySource)) {
        const systemType = LEGACY_SOURCE_TO_SYSTEM_TYPE[legacySource];
        return {
            messageType: "system",
            systemType,
            source: inferSourceFromSystemType(systemType),
            repliesDisabled: input.repliesDisabled,
            templateKey: systemType === "welcome" ? "welcome" : undefined,
            version: normalizeOptionalString(input.version),
        };
    }

    return { messageType: "user" };
};
