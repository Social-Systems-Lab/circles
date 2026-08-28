import type { Comment } from "@/models/models";
import { ObjectId } from "mongodb";
import { toCommentDto } from "./comment-dto";
import {
    prepareAuthoredComment,
    type AuthoredCommentRequest,
    type SafeAuthoredCommentInput,
} from "./comment-write-policy";

export type CreateCommentDependencies = {
    insertComment: (comment: Comment) => Promise<{ insertedId: ObjectId }>;
    incrementParentReplies: (id: ObjectId) => Promise<void>;
    now: () => Date;
};

export async function createCommentForAuthorizedPost(
    postId: string,
    data: SafeAuthoredCommentInput,
    createdBy: string,
    dependencies: CreateCommentDependencies,
): Promise<Comment> {
    const createdAt = dependencies.now();
    const comment = {
        postId,
        createdAt,
        createdBy,
        content: data.content,
        parentCommentId: data.parentCommentId,
        mentions: data.mentions,
        reactions: {},
        replies: 0,
    } as Comment;
    const result = await dependencies.insertComment(comment);
    if (data.parentCommentId) await dependencies.incrementParentReplies(new ObjectId(data.parentCommentId));
    return { ...comment, _id: result.insertedId };
}

export type AddCommentToDiscussionDependencies = {
    findDiscussion: (id: ObjectId) => Promise<{ closed?: boolean } | null>;
    insertComment: (comment: Comment) => Promise<{ insertedId: ObjectId }>;
    incrementParentReplies: (id: ObjectId) => Promise<void>;
    updateLastActivity: (id: ObjectId, at: Date) => Promise<void>;
    now: () => Date;
    prepareComment: typeof prepareAuthoredComment;
    findParentComment: (id: ObjectId) => Promise<Pick<Comment, "postId"> | null>;
    toCommentDto?: typeof toCommentDto;
};

export async function addCommentToDiscussionWithDependencies(
    discussionId: string,
    data: AuthoredCommentRequest & { createdBy: string },
    dependencies: AddCommentToDiscussionDependencies,
) {
    const discussionObjectId = new ObjectId(discussionId);
    const discussion = await dependencies.findDiscussion(discussionObjectId);
    if (!discussion || discussion.closed) {
        throw new Error("Forum post is closed or not found");
    }
    const prepared = await dependencies.prepareComment({
        postId: discussionId,
        parentCommentId: data.parentCommentId,
        content: data.content!,
        writerDid: data.createdBy!,
        dependencies: { findParentComment: dependencies.findParentComment },
    });
    const comment = await createCommentForAuthorizedPost(discussionId, prepared, data.createdBy!, dependencies);

    await dependencies.updateLastActivity(discussionObjectId, dependencies.now());

    return (dependencies.toCommentDto ?? toCommentDto)(comment);
}
