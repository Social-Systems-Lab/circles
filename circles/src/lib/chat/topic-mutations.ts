export const buildConversationUpdatedAtCompareAndSetFilter = <T>(
    conversationObjectId: T,
    observedUpdatedAt?: Date,
) => ({
    _id: conversationObjectId,
    updatedAt: observedUpdatedAt || { $exists: false },
});

export const buildThreadActivityCompareAndSetFilter = <T>(
    topicObjectId: T,
    conversationId: string,
    observedUpdatedAt: Date | undefined,
) => ({
    _id: topicObjectId,
    conversationId,
    thread: { $exists: true },
    "thread.updatedAt": observedUpdatedAt || { $exists: false },
});
