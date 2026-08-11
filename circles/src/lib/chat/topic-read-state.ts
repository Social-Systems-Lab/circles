export type TopicReadBoundary = {
    topicId: string;
    explicitLastReadMessageId?: string | null;
    conversationFallbackMessageId?: string | null;
};

export const CHAT_READ_STATE_VERSION = 2 as const;
const OBJECT_ID_HEX_PATTERN = /^[0-9a-fA-F]{24}$/;

export const normalizeObjectIdHex = (value?: string | null): string | null => {
    if (!value || !OBJECT_ID_HEX_PATTERN.test(value)) return null;
    return value.toLowerCase();
};

export const selectGreatestObjectIdHex = (values: Array<string | null | undefined>): string | null => {
    const normalized = values.map(normalizeObjectIdHex).filter((value): value is string => !!value);
    return normalized.length ? normalized.reduce((greatest, value) => (value > greatest ? value : greatest)) : null;
};

export type TopicCursorLookup = (input: {
    conversationId: string;
    topicId: string;
    messageId: string;
    kind: "starter" | "reply";
}) => Promise<boolean>;

export const validateTopicCursorCandidate = async ({
    conversationId,
    topicId,
    messageId,
    lookup,
}: {
    conversationId: string;
    topicId: string;
    messageId: string;
    lookup: TopicCursorLookup;
}): Promise<string | null> => {
    const normalizedTopicId = normalizeObjectIdHex(topicId);
    const normalizedMessageId = normalizeObjectIdHex(messageId);
    if (!normalizedTopicId || !normalizedMessageId) return null;
    const kind = normalizedMessageId === normalizedTopicId ? "starter" : "reply";
    const exists = await lookup({
        conversationId,
        topicId: normalizedTopicId,
        messageId: normalizedMessageId,
        kind,
    });
    return exists ? normalizedMessageId : null;
};

export const resolveTopicReadBoundary = ({
    explicitLastReadMessageId,
    conversationFallbackMessageId,
}: TopicReadBoundary): string | null => {
    if (explicitLastReadMessageId !== undefined) return explicitLastReadMessageId;
    return conversationFallbackMessageId ?? null;
};

export const resolveTopicMigrationFallback = (
    readState?: {
        lastReadMessageId?: string | null;
        topicFallbackMessageId?: string | null;
        readStateVersion?: number;
    } | null,
): string | null => {
    if (!readState) return null;
    if (Object.prototype.hasOwnProperty.call(readState, "topicFallbackMessageId")) {
        return readState.topicFallbackMessageId ?? null;
    }
    return readState.lastReadMessageId ?? null;
};

export const buildTopicUnreadMessagesQuery = (
    userDid: string,
    conversationId: string,
    topicId: string,
    lastReadObjectId?: unknown,
    includeStarter: boolean = false,
    topicObjectId?: unknown,
): Record<string, unknown> => {
    const query: Record<string, unknown> = {
        conversationId,
        senderDid: { $ne: userDid },
    };
    if (includeStarter) {
        query.$or = [{ _id: topicObjectId ?? topicId, thread: { $exists: true } }, { threadId: topicId }];
    } else {
        query.threadId = topicId;
    }
    if (lastReadObjectId) query._id = { $gt: lastReadObjectId };
    return query;
};

export const shouldApplyTopicUnreadResponse = (requestId: number, latestRequestId: number): boolean =>
    requestId === latestRequestId;

export const sumConversationUnreadCounts = (
    legacyUnreadCount: number,
    topicUnreadCounts: Record<string, number>,
): number => legacyUnreadCount + Object.values(topicUnreadCounts).reduce((total, count) => total + count, 0);
