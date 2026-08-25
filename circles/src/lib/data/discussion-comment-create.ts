import type { Comment } from "@/models/models";
import { ObjectId } from "mongodb";
import { toCommentDto } from "./comment-dto";

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
    const createdAt = dependencies.now();
    const {
        _id: _callerId,
        editedAt: _callerEditedAt,
        reactions: _callerReactions,
        isDeleted: _callerDeletedState,
        ...persistedData
    } = data;
    const result = await dependencies.insertComment({
        ...persistedData,
        postId: discussionId,
        createdAt,
        createdBy: data.createdBy!,
        content: data.content!,
        parentCommentId: data.parentCommentId ?? null,
        reactions: {},
        replies: 0,
    } as Comment);

    await dependencies.updateLastActivity(discussionObjectId, dependencies.now());

    return toCommentDto({
        _id: result.insertedId,
        postId: discussionId,
        parentCommentId: data.parentCommentId ?? null,
        content: data.content!,
        createdBy: data.createdBy!,
        createdAt,
        reactions: {},
        replies: 0,
    });
}
