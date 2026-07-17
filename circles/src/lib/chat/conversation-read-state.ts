export const buildLatestConversationMessageLookup = (conversationId: string) => ({
    filter: { conversationId },
    options: {
        sort: { _id: -1 as const },
        projection: { _id: 1 as const },
    },
});
