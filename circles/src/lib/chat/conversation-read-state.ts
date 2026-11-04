export const buildLatestConversationMessageLookup = (conversationId: string) => ({
    filter: { conversationId },
    options: {
        sort: { createdAt: -1 as const, _id: -1 as const },
        projection: { _id: 1 as const },
    },
});
