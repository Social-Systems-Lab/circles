export const resolveConversationUnreadCount = (sharedUnread?: number, roomUnread?: number): number => {
    if (typeof sharedUnread === "number") return sharedUnread;
    if (typeof roomUnread === "number") return roomUnread;
    return 0;
};

export const buildConversationUnreadSnapshot = (
    rooms: Array<{ _id?: unknown; handle?: unknown; unreadCount?: number }>,
): Record<string, number> =>
    Object.fromEntries(
        rooms
            .map((room) => [String(room._id || room.handle || ""), room.unreadCount || 0] as const)
            .filter(([roomId]) => !!roomId),
    );

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
