export const resolveConversationUnreadCount = (serverUnread?: number, atomUnread?: number): number => {
    if (typeof serverUnread === "number") return serverUnread;
    if (typeof atomUnread === "number") return atomUnread;
    return 0;
};

export const buildUnreadMessagesQuery = (
    userDid: string,
    conversationId: string,
    lastReadObjectId?: unknown,
): Record<string, unknown> => {
    const query: Record<string, unknown> = {
        conversationId,
        senderDid: { $ne: userDid },
    };

    if (lastReadObjectId) {
        query._id = { $gt: lastReadObjectId };
    }

    return query;
};
