import { Posts, Comments } from "./db";
import { Post, Comment } from "@/models/models";
import { ObjectId } from "mongodb";

/**
 * Create a new discussion (a Post of type 'discussion')
 */
import { getUserByDid } from "./user";
import { upsertVbdPosts } from "./vdb";
import { buildAuthorizedPostHydrationMatch } from "./post-access-policy";
import { toCommentDto } from "./comment-dto";
import {
    addCommentToDiscussionWithDependencies,
    type AddCommentToDiscussionDependencies,
} from "./discussion-comment-create";

const defaultAddCommentToDiscussionDependencies: AddCommentToDiscussionDependencies = {
    findDiscussion: async (id) => Posts.findOne({ _id: id, postType: "discussion" }),
    insertComment: async (comment) => Comments.insertOne(comment),
    updateLastActivity: async (id, at) => {
        await Posts.updateOne({ _id: id }, { $set: { lastActivityAt: at } });
    },
    now: () => new Date(),
};

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
export async function listDiscussionsByCircle(circleId: string, feedId: string) {
    const discussions = await Posts.find({ circleId, feedId, postType: "discussion" })
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
export async function getDiscussionWithComments(id: string, authorizedFeedId?: string) {
    const authorizedMatch = authorizedFeedId
        ? buildAuthorizedPostHydrationMatch(id, authorizedFeedId, "discussion")
        : { _id: new ObjectId(id), postType: "discussion" as const };
    if (!authorizedMatch) return null;
    const pipeline = [
        { $match: authorizedMatch },
        {
            $addFields: {
                feedIdObject: {
                    $convert: { input: "$feedId", to: "objectId", onError: null, onNull: null },
                },
                circleIdObject: {
                    $convert: { input: "$circleId", to: "objectId", onError: null, onNull: null },
                },
            },
        },
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
                localField: "feedIdObject",
                foreignField: "_id",
                as: "feed",
            },
        },
        {
            $lookup: {
                from: "circles",
                localField: "circleIdObject",
                foreignField: "_id",
                as: "circle",
            },
        },
        {
            $match: {
                $expr: {
                    $and: [
                        { $eq: [{ $size: "$feed" }, 1] },
                        { $eq: [{ $size: "$circle" }, 1] },
                        { $eq: [{ $arrayElemAt: ["$feed.circleId", 0] }, "$circleId"] },
                    ],
                },
            },
        },
        { $unwind: "$feed" },
        { $unwind: "$circle" },
    ];

    const results = await Posts.aggregate(pipeline).toArray();
    if (!results || results.length === 0) return null;
    const discussion: any = results[0];
    discussion._id = discussion._id.toString();

    const comments = await Comments.find({ postId: id }).toArray();
    discussion.comments = comments.map(toCommentDto);

    return discussion;
}

/**
 * Add a comment to a discussion (if not closed)
 */
export async function addCommentToDiscussion(
    discussionId: string,
    data: Partial<Comment>,
    dependencies: AddCommentToDiscussionDependencies = defaultAddCommentToDiscussionDependencies,
) {
    return addCommentToDiscussionWithDependencies(discussionId, data, dependencies);
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
