import { isSystemMessageSource } from "@/config/welcome-message";

export type MessageType = "user" | "system";
export type SystemMessageType = "welcome" | "member_joined_circle" | "member_left_circle" | "announcement";
export type SystemMessageSource = "signup" | "circle_membership" | "admin";

export type SystemMessageMetadata = {
    messageType: MessageType;
    systemType?: SystemMessageType;
    source?: SystemMessageSource;
    actorDid?: string;
    targetDid?: string;
    circleId?: string;
    repliesDisabled?: boolean;
    templateKey?: string;
    version?: string;
};

export const SYSTEM_TYPE_TO_LEGACY_SOURCE: Record<SystemMessageType, string> = {
    welcome: "system_welcome",
    member_joined_circle: "system_member_joined_circle",
    member_left_circle: "system_member_left_circle",
    announcement: "system_announcement",
};

const LEGACY_SOURCE_TO_SYSTEM_TYPE: Record<string, SystemMessageType> = Object.entries(SYSTEM_TYPE_TO_LEGACY_SOURCE).reduce(
    (acc, [systemType, source]) => {
        acc[source] = systemType as SystemMessageType;
        return acc;
    },
    {} as Record<string, SystemMessageType>,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value);

const normalizeSystemType = (value: unknown): SystemMessageType | undefined => {
    return value === "welcome" ||
        value === "member_joined_circle" ||
        value === "member_left_circle" ||
        value === "announcement"
        ? value
        : undefined;
};

const normalizeSystemSource = (value: unknown): SystemMessageSource | undefined => {
    return value === "signup" || value === "circle_membership" || value === "admin" ? value : undefined;
};

const inferSourceFromSystemType = (systemType?: SystemMessageType): SystemMessageSource | undefined => {
    if (!systemType) return undefined;
    if (systemType === "welcome") return "signup";
    if (systemType === "member_joined_circle" || systemType === "member_left_circle") return "circle_membership";
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
