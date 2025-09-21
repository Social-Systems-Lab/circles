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
        lastActivityAt: now,
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
        lastActivityAt: now,
        feedId: doc.feedId,
        circleId: doc.circleId,
        media: doc.media || [],
        userGroups: doc.userGroups || ["everyone"],
        mentions: doc.mentions || [],
        linkPreviewUrl: doc.linkPreviewUrl,
        linkPreviewTitle: doc.linkPreviewTitle,
        linkPreviewDescription: doc.linkPreviewDescription,
        linkPreviewImage: doc.linkPreviewImage,
        internalPreviewType: doc.internalPreviewType,
        internalPreviewId: doc.internalPreviewId,
        internalPreviewUrl: doc.internalPreviewUrl,
        sdgs: doc.sdgs || [],
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

    const withAuthors = await Promise.all(
        discussions.map(async (d: any) => {
            const doc = { ...d, _id: d._id.toString() };
            if (d.createdBy) {
                try {
                    const author = await getUserByDid(d.createdBy);
                    if (author) {
                        (doc as any).author = author;
                    }
                } catch (e) {
                    console.error("Failed to fetch author for discussion", e);
                }
            }
            return doc;
        }),
    );

    return withAuthors;
}

/**
 * Get a discussion with comments
 */
export async function getDiscussionWithComments(id: string) {
    const pipeline = [
        { $match: { _id: new ObjectId(id), postType: "discussion" } },
        {
            $lookup: {
                from: "circles",
                localField: "createdBy",
                foreignField: "did",
                as: "authorDetails",
            },
        },
        { $unwind: "$authorDetails" },
        {
            $lookup: {
                from: "feeds",
                localField: "feedId",
                foreignField: "_id",
                as: "feed",
            },
        },
        { $unwind: { path: "$feed", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "circles",
                localField: "circleId",
                foreignField: "_id",
                as: "circle",
            },
        },
        { $unwind: { path: "$circle", preserveNullAndEmptyArrays: true } },
    ];

    const results = await Posts.aggregate(pipeline).toArray();
    if (!results || results.length === 0) return null;
    const discussion: any = results[0];
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

    // Update the lastActivityAt field on the parent discussion post
    await Posts.updateOne({ _id: new ObjectId(discussionId) }, { $set: { lastActivityAt: new Date() } });

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
