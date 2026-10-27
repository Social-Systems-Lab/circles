type ChatIndexRoom = {
    _id?: unknown;
    handle?: unknown;
    unreadCount?: number;
};

export const getChatIndexAutoSelectionPath = ({
    isMobile,
    hasLoadedChatRooms,
    hasRedirected,
    hasExplicitSelection,
    chatRooms,
}: {
    isMobile: boolean | null;
    hasLoadedChatRooms: boolean;
    hasRedirected: boolean;
    hasExplicitSelection: boolean;
    chatRooms: ChatIndexRoom[];
}): string | null => {
    if (isMobile !== false || !hasLoadedChatRooms || hasRedirected || hasExplicitSelection || chatRooms.length === 0) {
        return null;
    }
    const targetRoom = chatRooms.find((room) => (room.unreadCount || 0) > 0) || chatRooms[0];
    const conversationId = String(targetRoom?._id || targetRoom?.handle || "");
    return conversationId ? `/chat/${conversationId}` : null;
};

export const getConversationListPath = (archivedReadOnly: boolean): "/chat" | "/chat/archived" =>
    archivedReadOnly ? "/chat/archived" : "/chat";
