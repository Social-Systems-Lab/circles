export const highlightedCommentFilter = (postId: string) => ({
    postId,
    parentCommentId: null,
    isDeleted: { $ne: true },
});

export const highlightedCommentPointerUpdate = (highlightedCommentId?: string) =>
    highlightedCommentId ? { $set: { highlightedCommentId } } : { $unset: { highlightedCommentId: "" } };
