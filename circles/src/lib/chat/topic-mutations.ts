export const buildConversationUpdatedAtCompareAndSetFilter = <T>(
    conversationObjectId: T,
    observedUpdatedAt?: Date,
) => ({
    _id: conversationObjectId,
    updatedAt: observedUpdatedAt || { $exists: false },
});
