import { Posts, Comments } from "./db";
import { Post, Comment } from "@/models/models";
import { ObjectId } from "mongodb";

/**
 * Create a new discussion (a Post of type 'discussion')
 */
import { getUserByDid } from "./user";
import { upsertVbdPosts } from "./vdb";

export async function createDiscussion(data: Partial<Post>) {
    const now = new Date();
    const doc: any = {
        ...data,
        postType: "discussion",
        pinned: false,
        closed: false,
        createdAt: now,
    };

    // Ensure both circleId and feedId are stored
    if (data.feedId) {
        doc.feedId = data.feedId;
    }
    if ((data as any).circleId) {
        doc.circleId = (data as any).circleId;
    }

    const result = await Posts.insertOne(doc);

    const newDiscussion: any = {
        ...(data as Post),
        _id: result.insertedId.toString(),
        postType: "discussion",
        pinned: false,
        closed: false,
        createdAt: now,
        feedId: doc.feedId,
        circleId: doc.circleId,
    };

    // attach author
    if (newDiscussion.createdBy) {
        const author = await getUserByDid(newDiscussion.createdBy);
        if (author) {
            (newDiscussion as any).author = author;
        }
    }

    // upsert into VDB for search/embedding
    try {
        await upsertVbdPosts([newDiscussion as any]);
    } catch (e) {
        console.error("Failed to upsert discussion embedding", e);
    }

    return newDiscussion;
}

/**
 * List discussions for a circle, pinned first
 */
export async function listDiscussionsByCircle(circleId: string) {
    const discussions = await Posts.find({ circleId, postType: "discussion" })
        .sort({ pinned: -1, createdAt: -1 })
        .toArray();

    return discussions.map((d: any) => ({
        ...d,
        _id: d._id.toString(),
    }));
}

/**
 * Get a discussion with comments
 */
export async function getDiscussionWithComments(id: string) {
    const discussion: any = await Posts.findOne({ _id: new ObjectId(id), postType: "discussion" });
    if (!discussion) return null;
    discussion._id = discussion._id.toString();

    const comments = await Comments.find({ postId: id }).toArray();
    discussion.comments = comments.map((c: any) => ({
        ...c,
        _id: c._id.toString(),
    }));

    return discussion;
}

/**
 * Add a comment to a discussion (if not closed)
 */
export async function addCommentToDiscussion(discussionId: string, data: Partial<Comment>) {
    const discussion = await Posts.findOne({ _id: new ObjectId(discussionId), postType: "discussion" });
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
    return Posts.updateOne({ _id: new ObjectId(id) }, { $set: { pinned } });
}

/**
 * Close a discussion
 */
export async function closeDiscussion(id: string) {
    return Posts.updateOne({ _id: new ObjectId(id) }, { $set: { closed: true } });
}
