import type { ChatMessage } from "@/models/models";

const SYSTEM_SOURCE_REGEX = /^system_/;

type LegacyLooseCandidate = {
    type?: string;
    thread?: unknown;
    threadId?: unknown;
    source?: unknown;
    system?: unknown;
    broadcastId?: unknown;
    createdAt?: unknown;
};

const isSystemMetadata = (system: unknown): boolean => {
    if (!system || typeof system !== "object" || Array.isArray(system)) return false;
    const metadata = system as Record<string, unknown>;
    return (
        metadata.messageType === "system" ||
        typeof metadata.systemType === "string" ||
        typeof metadata.source === "string"
    );
};

export const isLegacyLooseMessageCandidate = (message: LegacyLooseCandidate): boolean => {
    if (message.type && message.type !== "m.room.message") return false;
    if (message.thread) return false;
    if (message.threadId) return false;
    if (typeof message.source === "string" && SYSTEM_SOURCE_REGEX.test(message.source)) return false;
    if (isSystemMetadata(message.system)) return false;
    if (typeof message.broadcastId === "string" && message.broadcastId.length > 0) return false;
    return true;
};

export const getLegacyLooseMessages = (messages: ChatMessage[]): ChatMessage[] =>
    messages
        .filter((message) => isLegacyLooseMessageCandidate(message as ChatMessage & Record<string, unknown>))
        .sort((left, right) => {
            const leftTime = new Date(left.createdAt).getTime();
            const rightTime = new Date(right.createdAt).getTime();
            return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
        });

export const shouldShowLegacyLooseMessageSection = (count?: number | null): boolean =>
    typeof count === "number" && count > 0;

export const shouldFetchLegacyLooseMessagesOnExpand = (input: {
    isExpanded: boolean;
    hasLoadedMessages: boolean;
    isLoadingMessages: boolean;
}): boolean => input.isExpanded && !input.hasLoadedMessages && !input.isLoadingMessages;

export const buildLegacyLooseMessageQuery = (conversationId: string) => ({
    conversationId,
    threadId: { $exists: false },
    thread: { $exists: false },
    $and: [
        {
            $or: [{ source: { $exists: false } }, { source: { $not: SYSTEM_SOURCE_REGEX } }],
        },
        {
            $or: [
                { system: { $exists: false } },
                {
                    $and: [
                        { "system.messageType": { $ne: "system" } },
                        { "system.systemType": { $exists: false } },
                        { "system.source": { $exists: false } },
                    ],
                },
            ],
        },
        {
            $or: [{ broadcastId: { $exists: false } }, { broadcastId: "" }],
        },
    ],
});
