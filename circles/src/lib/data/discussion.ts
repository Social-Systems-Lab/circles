import { Posts, Comments } from "./db";
import { Post, Comment } from "@/models/models";

/**
 * Create a new discussion (a Post of type 'discussion')
 */
export async function createDiscussion(data: Partial<Post>) {
    const result = await Posts.insertOne({
        ...data,
        postType: "discussion",
        pinned: false,
        closed: false,
        createdAt: new Date(),
    } as Post);
    return {
        _id: result.insertedId.toString(),
        ...data,
        postType: "discussion",
        pinned: false,
        closed: false,
        createdAt: new Date(),
    };
}

/**
 * List discussions for a circle, pinned first
 */
export async function listDiscussionsByCircle(circleId: string) {
    return Posts.find({ circleId, postType: "discussion" }).sort({ pinned: -1, createdAt: -1 }).toArray();
}

/**
 * Get a discussion with comments
 */
export async function getDiscussionWithComments(id: string) {
    return Posts.findOne({ id, postType: "discussion" });
}

/**
 * Add a comment to a discussion (if not closed)
 */
export async function addCommentToDiscussion(discussionId: string, data: Partial<Comment>) {
    const discussion = await Posts.findOne({ id: discussionId, postType: "discussion" });
    if (!discussion || discussion.closed) {
        throw new Error("Discussion is closed or not found");
    }
    const result = await Comments.insertOne({
        ...data,
        postId: discussionId,
        createdAt: new Date(),
        createdBy: data.createdBy!,
        content: data.content!,
        parentCommentId: data.parentCommentId ?? null,
        reactions: data.reactions ?? {},
        replies: 0,
    } as Comment);
    return { _id: result.insertedId.toString(), ...data, postId: discussionId, createdAt: new Date(), replies: 0 };
}

/**
 * Pin or unpin a discussion
 */
export async function pinDiscussion(id: string, pinned: boolean) {
    return Posts.updateOne({ id }, { $set: { pinned } });
}

/**
 * Close a discussion
 */
export async function closeDiscussion(id: string) {
    return Posts.updateOne({ id }, { $set: { closed: true } });
}
