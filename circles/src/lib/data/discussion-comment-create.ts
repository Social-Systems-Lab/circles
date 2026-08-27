import type { Comment } from "@/models/models";
import { ObjectId } from "mongodb";
import { toCommentDto } from "./comment-dto";

export type CreateCommentDependencies = {
    insertComment: (comment: Comment) => Promise<{ insertedId: ObjectId }>;
    now: () => Date;
};

export async function createCommentForAuthorizedPost(
    postId: string,
    data: Partial<Comment>,
    createdBy: string,
    dependencies: CreateCommentDependencies,
): Promise<Comment> {
    const createdAt = dependencies.now();
    const {
        _id: _callerId,
        postId: _callerPostId,
        createdBy: _callerCreatedBy,
        createdAt: _callerCreatedAt,
        editedAt: _callerEditedAt,
        reactions: _callerReactions,
        replies: _callerReplies,
        isDeleted: _callerDeletedState,
        ...persistedData
    } = data;
    const comment = {
        ...persistedData,
        postId,
        createdAt,
        createdBy,
        content: data.content!,
        parentCommentId: data.parentCommentId ?? null,
        reactions: {},
        replies: 0,
    } as Comment;
    const result = await dependencies.insertComment(comment);
    return { ...comment, _id: result.insertedId };
}

export type AddCommentToDiscussionDependencies = {
    findDiscussion: (id: ObjectId) => Promise<{ closed?: boolean } | null>;
    insertComment: (comment: Comment) => Promise<{ insertedId: ObjectId }>;
    updateLastActivity: (id: ObjectId, at: Date) => Promise<void>;
    now: () => Date;
};

export async function addCommentToDiscussionWithDependencies(
    discussionId: string,
    data: Partial<Comment>,
    dependencies: AddCommentToDiscussionDependencies,
) {
    const discussionObjectId = new ObjectId(discussionId);
    const discussion = await dependencies.findDiscussion(discussionObjectId);
    if (!discussion || discussion.closed) {
        throw new Error("Forum post is closed or not found");
    }
    const comment = await createCommentForAuthorizedPost(discussionId, data, data.createdBy!, dependencies);

    await dependencies.updateLastActivity(discussionObjectId, dependencies.now());

    return toCommentDto(comment);
}
