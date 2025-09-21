// feed.ts - Feed data access functions
import { Feeds, Posts, Comments, Reactions, Circles, Members, Proposals, Issues, Tasks } from "./db"; // Added Tasks
import { ObjectId } from "mongodb";
import {
    Feed,
    Post,
    PostDisplay,
    Comment,
    CommentDisplay,
    Circle,
    Mention,
    SortingOptions,
    ProposalDisplay,
    IssueDisplay,
    TaskDisplay, // Added TaskDisplay
} from "@/models/models";
import { getCircleById, SAFE_CIRCLE_PROJECTION, updateCircle, getCircleByHandle } from "./circle";
import { getUserByDid } from "./user";
import { getMetrics } from "../utils/metrics";
import { deleteVbdPost, upsertVbdPosts } from "./vdb";
import { getProposalById } from "./proposal";
import { getIssueById } from "./issue";
import { getTaskById } from "./task"; // Added getTaskById
import { sdgs } from "./sdgs";

export const getFeedsByCircleId = async (circleId: string): Promise<Feed[]> => {
    const feeds = await Feeds.find({
        circleId,
    }).toArray();
    return feeds;
};

export async function getPublicFeeds(): Promise<Feed[]> {
    // Keep this export
    const feeds = await Feeds.find({ userGroups: "everyone" }).toArray();
    return feeds;
}

// Make sure getPublicUserFeed is also exported
export const getPublicUserFeed = async (userDid: string): Promise<Feed | null> => {
    const user = await getUserByDid(userDid);
    if (!user) {
        return null;
    }

    const feed = (await Feeds.findOne({
        circleId: user._id.toString(),
        handle: "default",
        userGroups: "everyone",
    })) as Feed;

    if (feed?._id) {
        feed._id = feed?._id.toString();
    }

    return feed;
};

export function extractMentions(content: string): Mention[] {
    const mentionPattern = /\[([^\]]+)\]\(\/circles\/([^)]+)\)/g;
    let match;
    const mentions: Mention[] = [];

    while ((match = mentionPattern.exec(content)) !== null) {
        //const display = match[1];
        const id = match[2];
        mentions.push({ type: "circle", id });
    }

    return mentions;
}

export const createFeed = async (feed: Feed): Promise<Feed> => {
    const result = await Feeds.insertOne(feed);
    return { ...feed, _id: result.insertedId };
};

export const getFeed = async (feedId: string): Promise<Feed | null> => {
    let feed = (await Feeds.findOne({ _id: new ObjectId(feedId) })) as Feed;
    if (feed) {
        feed._id = feed._id.toString();
    }
    return feed;
};

export const getFeedByHandle = async (circleId: string, feedHandle: string | undefined): Promise<Feed | null> => {
    // if handle is empty then return the default feed
    let feed: Feed;
    if (!feedHandle) {
        feed = (await Feeds.findOne({ circleId, handle: "default" })) as Feed;
    } else {
        feed = (await Feeds.findOne({ circleId, handle: feedHandle })) as Feed;
    }
    if (feed?._id) {
        feed._id = feed._id.toString();
    }
    return feed;
};

export const getFeeds = async (circleId: string): Promise<Feed[]> => {
    let feeds = await Feeds.find({
        circleId,
    }).toArray();
    feeds.forEach((feed: Feed) => {
        if (feed._id) {
            feed._id = feed._id.toString();
        }
    });
    return feeds;
};

export const createDefaultFeed = async (circleId: string): Promise<Feed | null> => {
    let circle = await getCircleById(circleId);
    if (!circle) {
        return null;
    }

    // Only create a single default feed per circle
    let defaultFeed = await getFeedByHandle(circleId, "default");
    if (!defaultFeed) {
        defaultFeed = {
            name: "Circle Announcements",
            handle: "default",
            circleId,
            userGroups: ["admins", "moderators", "members", "everyone"],
            createdAt: new Date(),
        };
        defaultFeed = await createFeed(defaultFeed);
    }

    return defaultFeed;
};

export const createPost = async (post: Post): Promise<Post> => {
    const result = await Posts.insertOne(post);
    let newPost = { ...post, _id: result.insertedId.toString() } as Post;

    // upsert post
    // get post with author details
    let author = await getUserByDid(post.createdBy);
    try {
        const { sdgs: sdgIds, ...restOfNewPost } = newPost;
        const populatedSdgs = sdgIds ? sdgs.filter((s) => sdgIds.includes(s._id)) : [];
        const postForVdb = {
            ...restOfNewPost,
            sdgs: populatedSdgs,
            author: author!,
            circleType: "post" as const,
        };
        await upsertVbdPosts([postForVdb as PostDisplay]);
    } catch (e) {
        console.error("Failed to upsert post embedding", e);
    }
    return newPost;
};

export const deletePost = async (postId: string): Promise<void> => {
    await Posts.deleteOne({ _id: new ObjectId(postId) });

    // delete post
    try {
        await deleteVbdPost(postId);
    } catch (e) {
        console.error("Failed to delete post embedding", e);
    }

    // delete comments
    await Comments.deleteMany({ postId });
};

export const getPost = async (postId: string): Promise<Post | null> => {
    let post = (await Posts.findOne({ _id: new ObjectId(postId) })) as Post;
    if (post) {
        post._id = post._id.toString();
    }
    return post;
};

// Function to update the highlighted comment for a post
export const updateHighlightedComment = async (postId: string): Promise<void> => {
    const mostLikedComment = await Comments.find({ postId, parentCommentId: null })
        .sort({ "reactions.like": -1, createdAt: -1 })
        .limit(1)
        .toArray();

    const highlightedCommentId = mostLikedComment.length > 0 ? mostLikedComment[0]._id?.toString() : undefined;
    await Posts.updateOne({ _id: new ObjectId(postId) }, { $set: { highlightedCommentId } });
};

export const createComment = async (comment: Comment): Promise<Comment> => {
    try {
        const result = await Comments.insertOne(comment);
        const insertedComment = { ...comment, _id: result.insertedId.toString() };

        await Posts.updateOne({ _id: new ObjectId(comment.postId) }, { $inc: { comments: 1 } });

        if (!comment.parentCommentId) {
            await updateHighlightedComment(comment.postId);
        } else {
            // update replies
            await Comments.updateOne({ _id: new ObjectId(comment.parentCommentId) }, { $inc: { replies: 1 } });
        }

        console.log("💾 [DB] Comment created successfully:", {
            commentId: insertedComment._id,
            postId: comment.postId,
        });

        return insertedComment;
    } catch (error) {
        console.error("💾 [DB] Error creating comment:", error);
        throw error; // Important to propagate the error
    }
};

export const deleteComment = async (commentId: string): Promise<void> => {
    const comment = await Comments.findOne({ _id: new ObjectId(commentId) });
    if (!comment) return;

    if (comment.replies > 0) {
        // mark the comment as deleted and anonymize its data
        await Comments.updateOne(
            { _id: new ObjectId(commentId) },
            {
                $set: {
                    isDeleted: true,
                    content: "",
                    createdBy: "anonymous",
                    reactions: {},
                },
            },
        );
    } else {
        // If the comment has no replies, delete it
        await Comments.deleteOne({ _id: new ObjectId(commentId) });

        // Decrement comment count for the post
        await Posts.updateOne({ _id: new ObjectId(comment.postId) }, { $inc: { comments: -1 } });

        if (comment.parentCommentId) {
            // Decrement comment count for the parent comment
            await Comments.updateOne({ _id: new ObjectId(comment.parentCommentId) }, { $inc: { replies: -1 } });
        }
    }

    if (!comment.parentCommentId) {
        await updateHighlightedComment(comment.postId);
    }
};

// Function to get posts from multiple feeds
export async function getPostsFromMultipleFeeds(
    feedIds: string[],
    userDid: string | undefined,
    limit: number,
    skip: number,
    sort?: SortingOptions,
    sdgHandles?: string[],
    postType?: string,
): Promise<PostDisplay[]> {
    const matchStage: any = {
        feedId: { $in: feedIds },
    };

    if (postType) {
        matchStage.postType = postType;
    } else {
        matchStage.$or = [{ postType: { $eq: "post" } }, { postType: { $exists: false } }];
    }

    if (sdgHandles && sdgHandles.length > 0) {
        const sdgIds = sdgs.filter((s) => sdgHandles.includes(s.handle)).map((s) => s._id);
        if (sdgIds.length > 0) {
            matchStage.sdgs = { $in: sdgIds };
        }
    }

    // Get all posts from the specified feeds without user group filtering
    const posts = (await Posts.aggregate([
        {
            $match: matchStage,
        },

        // Convert `feedId` to ObjectId for lookup
        {
            $addFields: {
                feedIdObject: { $toObjectId: "$feedId" },
            },
        },

        // Lookup author details
        {
            $lookup: {
                from: "circles",
                localField: "createdBy",
                foreignField: "did",
                as: "authorDetails",
            },
        },
        { $unwind: "$authorDetails" },

        // Filter for verified or member authors, or if the post is by the current user
        {
            $match: {
                $or: [{ "authorDetails.isVerified": true }, { "authorDetails.isMember": true }, { createdBy: userDid }],
            },
        },

        // Lookup user reactions
        {
            $lookup: {
                from: "reactions",
                let: { postId: { $toString: "$_id" } },
                pipeline: [
                    {
                        $match: {
                            $expr: { $and: [{ $eq: ["$contentId", "$$postId"] }, { $eq: ["$userDid", userDid] }] },
                        },
                    },
                ],
                as: "userReaction",
            },
        },

        // Lookup feed
        {
            $lookup: {
                from: "feeds",
                localField: "feedIdObject",
                foreignField: "_id",
                as: "feed",
            },
        },
        {
            $addFields: {
                feed: { $arrayElemAt: ["$feed", 0] },
                circleIdObject: { $toObjectId: { $arrayElemAt: ["$feed.circleId", 0] } },
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
            $addFields: {
                circle: { $arrayElemAt: ["$circle", 0] },
            },
        },

        //**********************************************************

        // **Adjusted Lookup for mentions in the post**
        {
            $lookup: {
                from: "circles",
                let: {
                    mentionIds: {
                        $ifNull: [{ $map: { input: "$mentions", as: "m", in: "$$m.id" } }, []],
                    },
                },
                pipeline: [
                    {
                        $match: {
                            $expr: { $in: [{ $toString: "$_id" }, "$$mentionIds"] },
                        },
                    },
                    {
                        $project: {
                            _id: { $toString: "$_id" },
                            did: 1,
                            name: 1,
                            picture: 1,
                            location: 1,
                            description: 1,
                            cover: 1,
                            handle: 1,
                        },
                    },
                ],
                as: "mentionsDetails",
            },
        },

        // Lookup for highlighted comment
        {
            $lookup: {
                from: "comments",
                let: { highlightedCommentId: { $toObjectId: "$highlightedCommentId" } },
                pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$highlightedCommentId"] } } },
                    // Lookup for highlighted comment author
                    {
                        $lookup: {
                            from: "circles",
                            localField: "createdBy",
                            foreignField: "did",
                            as: "authorDetails",
                        },
                    },
                    { $unwind: "$authorDetails" },
                    // Lookup for reactions on highlighted comment
                    {
                        $lookup: {
                            from: "reactions",
                            let: { commentId: { $toString: "$_id" } },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$contentId", "$$commentId"] },
                                                { $eq: ["$userDid", userDid] },
                                            ],
                                        },
                                    },
                                },
                            ],
                            as: "userReaction",
                        },
                    },
                    // **Adjusted Lookup for mentions in highlighted comment**
                    {
                        $lookup: {
                            from: "circles",
                            let: {
                                mentionIds: {
                                    $ifNull: [{ $map: { input: "$mentions", as: "m", in: "$$m.id" } }, []],
                                },
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $in: [{ $toString: "$_id" }, "$$mentionIds"] },
                                    },
                                },
                                {
                                    $project: {
                                        _id: { $toString: "$_id" },
                                        did: 1,
                                        name: 1,
                                        picture: 1,
                                        location: 1,
                                        description: 1,
                                        cover: 1,
                                        handle: 1,
                                    },
                                },
                            ],
                            as: "mentionsDetails",
                        },
                    },
                ],
                as: "highlightedComment",
            },
        },
        { $unwind: { path: "$highlightedComment", preserveNullAndEmptyArrays: true } },

        //**********************************************************

        // Sorting and pagination
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },

        // Final projection
        {
            $project: {
                _id: { $toString: "$_id" },
                feedId: 1,
                title: 1,
                content: 1,
                createdAt: 1,
                reactions: 1,
                media: 1,
                createdBy: 1,
                comments: 1,
                location: 1,
                userGroups: 1,
                linkPreviewUrl: 1,
                linkPreviewTitle: 1,
                linkPreviewDescription: 1,
                linkPreviewImage: 1,
                internalPreviewUrl: 1,
                internalPreviewType: 1,
                internalPreviewId: 1,
                sdgs: 1,
                circleType: { $literal: "post" },

                highlightedCommentId: { $toString: "$highlightedCommentId" },
                mentions: 1,
                // **Adjusted mapping of mentionsDisplay**
                mentionsDisplay: {
                    $map: {
                        input: { $ifNull: ["$mentions", []] },
                        as: "mention",
                        in: {
                            type: "$$mention.type",
                            id: "$$mention.id",
                            circle: {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: { $ifNull: ["$mentionsDetails", []] },
                                            as: "circle",
                                            cond: { $eq: ["$$circle._id", "$$mention.id"] },
                                        },
                                    },
                                    0,
                                ],
                            },
                        },
                    },
                },

                author: {
                    _id: { $toString: "$authorDetails._id" },
                    did: "$authorDetails.did",
                    name: "$authorDetails.name",
                    picture: "$authorDetails.picture",
                    location: "$authorDetails.location",
                    description: "$authorDetails.description",
                    images: "$authorDetails.images",
                    handle: "$authorDetails.handle",
                    isVerified: "$authorDetails.isVerified",
                    isMember: "$authorDetails.isMember",
                },

                userReaction: { $arrayElemAt: ["$userReaction.reactionType", 0] },

                // Project highlightedComment
                highlightedComment: {
                    $cond: {
                        if: { $ifNull: ["$highlightedComment", false] },
                        then: {
                            _id: { $toString: "$highlightedComment._id" },
                            postId: "$highlightedComment.postId",
                            parentCommentId: { $toString: "$highlightedComment.parentCommentId" },
                            content: "$highlightedComment.content",
                            createdBy: "$highlightedComment.createdBy",
                            createdAt: "$highlightedComment.createdAt",
                            reactions: "$highlightedComment.reactions",
                            replies: "$highlightedComment.replies",
                            isDeleted: "$highlightedComment.isDeleted",
                            mentions: "$highlightedComment.mentions",
                            // **Adjusted mapping of mentionsDisplay in highlightedComment**
                            mentionsDisplay: {
                                $map: {
                                    input: { $ifNull: ["$highlightedComment.mentions", []] },
                                    as: "mention",
                                    in: {
                                        type: "$$mention.type",
                                        id: "$$mention.id",
                                        circle: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: { $ifNull: ["$highlightedComment.mentionsDetails", []] },
                                                        as: "circle",
                                                        cond: { $eq: ["$$circle._id", "$$mention.id"] },
                                                    },
                                                },
                                                0,
                                            ],
                                        },
                                    },
                                },
                            },
                            author: {
                                did: "$highlightedComment.authorDetails.did",
                                name: "$highlightedComment.authorDetails.name",
                                picture: "$highlightedComment.authorDetails.picture",
                                location: "$highlightedComment.authorDetails.location",
                                description: "$highlightedComment.authorDetails.description",
                                images: "$highlightedComment.authorDetails.images",
                                handle: "$highlightedComment.authorDetails.handle",
                            },
                            userReaction: { $arrayElemAt: ["$highlightedComment.userReaction.reactionType", 0] },
                        },
                        else: null,
                    },
                },

                feed: {
                    _id: { $toString: "$feed._id" },
                    name: "$feed.name",
                    handle: "$feed.handle",
                },
                circle: {
                    _id: { $toString: "$circle._id" },
                    name: "$circle.name",
                    handle: "$circle.handle",
                    picture: "$circle.picture",
                    accessRules: "$circle.accessRules",
                    userGroups: "$circle.userGroups",
                },
            },
        },
    ]).toArray()) as PostDisplay[];

    // Post-processing to filter based on user groups
    if (userDid) {
        // Get user's memberships for each circle
        const userMemberships = new Map<string, string[]>();

        // Always add "everyone" as a group the user belongs to
        userMemberships.set("everyone", ["everyone"]);

        // Get the user's memberships from the Members collection
        const memberDocs = await Members.find({ userDid }).toArray();

        for (const memberDoc of memberDocs) {
            if (memberDoc.userGroups && memberDoc.userGroups.length > 0) {
                userMemberships.set(memberDoc.circleId, memberDoc.userGroups);
            }
        }

        // Filter posts based on user groups
        const filteredPosts = posts.filter((post) => {
            // If post has no user groups or empty user groups array, it's visible to everyone
            if (!post.userGroups || post.userGroups.length === 0) {
                return true;
            }

            // Get the circle ID for this post
            const circleId = post.circle?._id;
            if (!circleId) {
                return false; // No circle info, can't determine visibility
            }

            // Check if user has membership in this circle
            const userGroupsInCircle = userMemberships.get(circleId) || [];

            // Check if any of the post's user groups match the user's groups in this circle
            // Note: "everyone" in post.userGroups means it's visible to everyone
            return (
                post.userGroups.includes("everyone") ||
                post.userGroups.some((group) => userGroupsInCircle.includes(group))
            );
        });

        // --- Fetch Internal Preview Data (Post-Processing for logged-in user) ---
        await fetchAndAttachInternalPreviewData(filteredPosts);
        // --- End Fetch Internal Preview Data ---

        return filteredPosts;
    }

    // If no user is specified, only return posts with "everyone" user group
    const publicPosts = posts.filter(
        (post) => !post.userGroups || post.userGroups.length === 0 || post.userGroups.includes("everyone"),
    );

    // --- Fetch Internal Preview Data (Post-Processing) ---
    await fetchAndAttachInternalPreviewData(publicPosts);
    // --- End Fetch Internal Preview Data ---

    return publicPosts; // Restored return statement
}

export async function getPostsFromMultipleFeedsWithMetrics(
    feedIds: string[],
    userDid: string,
    limit: number,
    skip: number,
    sort?: SortingOptions,
    sdgHandles?: string[],
    postType?: string,
): Promise<PostDisplay[]> {
    let posts = await getPostsFromMultipleFeeds(feedIds, userDid, limit, skip, sort, sdgHandles, postType);

    let user: Circle | undefined = undefined;
    if (userDid) {
        user = await getUserByDid(userDid!);
    }
    const currentDate = new Date();

    // get metrics for each post
    for (const post of posts) {
        post.metrics = await getMetrics(user, post, currentDate, sort);
    }

    // sort posts by rank
    posts.sort((a, b) => (a.metrics?.rank ?? 0) - (b.metrics?.rank ?? 0));
    return posts;
}

export const getPostsWithMetrics = async (
    feedId: string,
    userDid?: string,
    limit: number = 10,
    offset: number = 0,
    sort?: SortingOptions,
    sdgHandles?: string[],
    postType?: string,
): Promise<PostDisplay[]> => {
    let posts = await getPosts(feedId, userDid, limit, offset, sdgHandles, postType);
    let user: Circle | undefined = undefined;
    if (userDid) {
        user = await getUserByDid(userDid!);
    }
    const currentDate = new Date();

    // get metrics for each post
    for (const post of posts) {
        post.metrics = await getMetrics(user, post, currentDate, sort);
    }

    // sort posts by rank
    posts.sort((a, b) => (a.metrics?.rank ?? 0) - (b.metrics?.rank ?? 0));
    return posts;
};

export const getPosts = async (
    feedId: string,
    userDid?: string,
    limit: number = 10,
    offset: number = 0,
    sdgHandles?: string[],
    postType?: string,
): Promise<PostDisplay[]> => {
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    const matchStage: any = {
        feedId: feedId,
    };

    if (postType) {
        matchStage.postType = postType;
    } else {
        matchStage.$or = [{ postType: { $eq: "post" } }, { postType: { $exists: false } }];
    }

    if (sdgHandles && sdgHandles.length > 0) {
        const sdgIds = sdgs.filter((s) => sdgHandles.includes(s.handle)).map((s) => s._id);
        if (sdgIds.length > 0) {
            matchStage.sdgs = { $in: sdgIds };
        }
    }

    // Get posts without user group filtering initially
    const posts = (await Posts.aggregate([
        {
            $match: matchStage,
        },
        // Lookup for author details
        {
            $lookup: {
                from: "circles",
                localField: "createdBy",
                foreignField: "did",
                as: "authorDetails",
            },
        },
        { $unwind: "$authorDetails" },

        // Filter for verified or member authors, or if the post is by the current user
        {
            $match: {
                $or: [{ "authorDetails.isVerified": true }, { "authorDetails.isMember": true }, { createdBy: userDid }],
            },
        },

        // Lookup for reactions on the post
        {
            $lookup: {
                from: "reactions",
                let: { postId: { $toString: "$_id" } },
                pipeline: [
                    {
                        $match: {
                            $expr: { $and: [{ $eq: ["$contentId", "$$postId"] }, { $eq: ["$userDid", userDid] }] },
                        },
                    },
                ],
                as: "userReaction",
            },
        },

        // **Adjusted Lookup for mentions in the post**
        {
            $lookup: {
                from: "circles",
                let: {
                    mentionIds: {
                        $ifNull: [{ $map: { input: "$mentions", as: "m", in: "$$m.id" } }, []],
                    },
                },
                pipeline: [
                    {
                        $match: {
                            $expr: { $in: [{ $toString: "$_id" }, "$$mentionIds"] },
                        },
                    },
                    {
                        $project: {
                            _id: { $toString: "$_id" },
                            did: 1,
                            name: 1,
                            picture: 1,
                            location: 1,
                            description: 1,
                            cover: 1,
                            handle: 1,
                        },
                    },
                ],
                as: "mentionsDetails",
            },
        },

        // Lookup for highlighted comment
        {
            $lookup: {
                from: "comments",
                let: { highlightedCommentId: { $toObjectId: "$highlightedCommentId" } },
                pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$highlightedCommentId"] } } },
                    // Lookup for highlighted comment author
                    {
                        $lookup: {
                            from: "circles",
                            localField: "createdBy",
                            foreignField: "did",
                            as: "authorDetails",
                        },
                    },
                    { $unwind: "$authorDetails" },
                    // Lookup for reactions on highlighted comment
                    {
                        $lookup: {
                            from: "reactions",
                            let: { commentId: { $toString: "$_id" } },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$contentId", "$$commentId"] },
                                                { $eq: ["$userDid", userDid] },
                                            ],
                                        },
                                    },
                                },
                            ],
                            as: "userReaction",
                        },
                    },
                    // **Adjusted Lookup for mentions in highlighted comment**
                    {
                        $lookup: {
                            from: "circles",
                            let: {
                                mentionIds: {
                                    $ifNull: [{ $map: { input: "$mentions", as: "m", in: "$$m.id" } }, []],
                                },
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $in: [{ $toString: "$_id" }, "$$mentionIds"] },
                                    },
                                },
                                {
                                    $project: {
                                        _id: { $toString: "$_id" },
                                        did: 1,
                                        name: 1,
                                        picture: 1,
                                        location: 1,
                                        description: 1,
                                        cover: 1,
                                        handle: 1,
                                    },
                                },
                            ],
                            as: "mentionsDetails",
                        },
                    },
                ],
                as: "highlightedComment",
            },
        },
        { $unwind: { path: "$highlightedComment", preserveNullAndEmptyArrays: true } },

        // Sorting and pagination
        { $sort: { createdAt: -1 } },
        { $skip: safeOffset },
        { $limit: safeLimit },

        // Final projection
        {
            $project: {
                _id: { $toString: "$_id" },
                feedId: 1,
                title: 1,
                content: 1,
                createdAt: 1,
                reactions: 1,
                media: 1,
                createdBy: 1,
                comments: 1,
                location: 1,
                userGroups: 1,
                linkPreviewUrl: 1,
                linkPreviewTitle: 1,
                linkPreviewDescription: 1,
                linkPreviewImage: 1,
                internalPreviewUrl: 1,
                internalPreviewType: 1,
                internalPreviewId: 1,
                sdgs: 1,
                circleType: { $literal: "post" },
                highlightedCommentId: { $toString: "$highlightedCommentId" },
                mentions: 1,
                // **Adjusted mapping of mentionsDisplay**
                mentionsDisplay: {
                    $map: {
                        input: { $ifNull: ["$mentions", []] },
                        as: "mention",
                        in: {
                            type: "$$mention.type",
                            id: "$$mention.id",
                            circle: {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: { $ifNull: ["$mentionsDetails", []] },
                                            as: "circle",
                                            cond: { $eq: ["$$circle._id", "$$mention.id"] },
                                        },
                                    },
                                    0,
                                ],
                            },
                        },
                    },
                },
                author: {
                    _id: { $toString: "$authorDetails._id" },
                    did: "$authorDetails.did",
                    name: "$authorDetails.name",
                    picture: "$authorDetails.picture",
                    location: "$authorDetails.location",
                    description: "$authorDetails.description",
                    images: "$authorDetails.images",
                    handle: "$authorDetails.handle",
                    isVerified: "$authorDetails.isVerified",
                    isMember: "$authorDetails.isMember",
                },
                userReaction: { $arrayElemAt: ["$userReaction.reactionType", 0] },

                // Project highlightedComment
                highlightedComment: {
                    $cond: {
                        if: { $ifNull: ["$highlightedComment", false] },
                        then: {
                            _id: { $toString: "$highlightedComment._id" },
                            postId: "$highlightedComment.postId",
                            parentCommentId: { $toString: "$highlightedComment.parentCommentId" },
                            content: "$highlightedComment.content",
                            createdBy: "$highlightedComment.createdBy",
                            createdAt: "$highlightedComment.createdAt",
                            reactions: "$highlightedComment.reactions",
                            replies: "$highlightedComment.replies",
                            isDeleted: "$highlightedComment.isDeleted",
                            mentions: "$highlightedComment.mentions",
                            // **Adjusted mapping of mentionsDisplay in highlightedComment**
                            mentionsDisplay: {
                                $map: {
                                    input: { $ifNull: ["$highlightedComment.mentions", []] },
                                    as: "mention",
                                    in: {
                                        type: "$$mention.type",
                                        id: "$$mention.id",
                                        circle: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: { $ifNull: ["$highlightedComment.mentionsDetails", []] },
                                                        as: "circle",
                                                        cond: { $eq: ["$$circle._id", "$$mention.id"] },
                                                    },
                                                },
                                                0,
                                            ],
                                        },
                                    },
                                },
                            },
                            author: {
                                did: "$highlightedComment.authorDetails.did",
                                name: "$highlightedComment.authorDetails.name",
                                picture: "$highlightedComment.authorDetails.picture",
                                location: "$highlightedComment.authorDetails.location",
                                description: "$highlightedComment.authorDetails.description",
                                images: "$highlightedComment.authorDetails.images",
                                handle: "$highlightedComment.authorDetails.handle",
                            },
                            userReaction: { $arrayElemAt: ["$highlightedComment.userReaction.reactionType", 0] },
                        },
                        else: null,
                    },
                },
            },
        },
    ]).toArray()) as PostDisplay[];

    // Post-processing to filter based on user groups
    if (userDid) {
        // Get user's memberships for each circle
        const userMemberships = new Map<string, string[]>();

        // Always add "everyone" as a group the user belongs to
        userMemberships.set("everyone", ["everyone"]);

        // Get the user's memberships from the Members collection
        const memberDocs = await Members.find({ userDid }).toArray();

        for (const memberDoc of memberDocs) {
            if (memberDoc.userGroups && memberDoc.userGroups.length > 0) {
                userMemberships.set(memberDoc.circleId, memberDoc.userGroups);
            }
        }

        // For single feed posts, we need to get the circle ID from the feed
        const feed = await getFeed(feedId);
        const circleId = feed?.circleId;

        // Filter posts based on user groups
        const filteredPosts = posts.filter((post) => {
            // If post has no user groups or empty user groups array, it's visible to everyone
            if (!post.userGroups || post.userGroups.length === 0) {
                return true;
            }

            if (!circleId) {
                return false; // No circle info, can't determine visibility
            }

            // Check if user has membership in this circle
            const userGroupsInCircle = userMemberships.get(circleId) || [];

            // Check if any of the post's user groups match the user's groups in this circle
            // Note: "everyone" in post.userGroups means it's visible to everyone
            return (
                post.userGroups.includes("everyone") ||
                post.userGroups.some((group) => userGroupsInCircle.includes(group))
            );
        });

        // --- Fetch Internal Preview Data (Post-Processing for logged-in user) ---
        await fetchAndAttachInternalPreviewData(filteredPosts);
        // --- End Fetch Internal Preview Data ---

        return filteredPosts;
    }

    // If no user is specified, only return posts with "everyone" user group
    const publicPostsForFeed = posts.filter(
        (post) => !post.userGroups || post.userGroups.length === 0 || post.userGroups.includes("everyone"),
    );

    // --- Fetch Internal Preview Data (Post-Processing) ---
    await fetchAndAttachInternalPreviewData(publicPostsForFeed); // Fetch for the correct list
    // --- End Fetch Internal Preview Data ---

    return publicPostsForFeed; // Return the correct list
};

// Helper function to fetch and attach internal preview data
async function fetchAndAttachInternalPreviewData(posts: PostDisplay[]): Promise<void> {
    const postsWithInternalLinks = posts.filter((p) => p.internalPreviewType && p.internalPreviewId);
    if (postsWithInternalLinks.length === 0) return;

    const previewDataMap = new Map<string, Circle | PostDisplay | ProposalDisplay | IssueDisplay | TaskDisplay>(); // Added TaskDisplay

    // Group IDs by type
    const idsByType = postsWithInternalLinks.reduce(
        (acc, post) => {
            const type = post.internalPreviewType!;
            const id = post.internalPreviewId!;
            if (!acc[type]) acc[type] = new Set();
            acc[type].add(id);
            return acc;
        },
        {} as Record<string, Set<string>>,
    );

    // Fetch data for each type
    const promises = Object.entries(idsByType).map(async ([type, idsSet]) => {
        const ids = Array.from(idsSet);
        try {
            switch (type) {
                case "circle":
                    const circles = await Circles.find(
                        { handle: { $in: ids } },
                        { projection: SAFE_CIRCLE_PROJECTION }, // Fetch only necessary fields
                    ).toArray();
                    circles.forEach((c) => {
                        const circleWithStringId = { ...c, _id: c._id.toString() };
                        previewDataMap.set(`circle-${c.handle}`, circleWithStringId as Circle);
                    });
                    break;
                case "post":
                    // Optimized post fetching using find and $in operator
                    const postObjectIds = ids.map((id) => new ObjectId(id));
                    const postsCursor = Posts.find(
                        { _id: { $in: postObjectIds } },
                        {
                            projection: {
                                // Project only necessary fields for preview
                                _id: 1,
                                content: 1, // Keep content for truncation
                                createdBy: 1,
                                // Add other minimal fields if needed by preview component
                            },
                        },
                    );

                    // Fetch author details separately for efficiency if needed, or adjust projection
                    // For simplicity now, we'll fetch authors after getting posts
                    const postPreviewsData = await postsCursor.toArray();
                    const authorDids = postPreviewsData.map((p) => p.createdBy);
                    const authors = await Circles.find(
                        { did: { $in: authorDids } },
                        { projection: SAFE_CIRCLE_PROJECTION },
                    ).toArray();
                    const authorMap = new Map(authors.map((a) => [a.did, a]));

                    postPreviewsData.forEach((p) => {
                        const author = authorMap.get(p.createdBy);
                        const { sdgs: sdgIds, ...restOfP } = p as Post;
                        const populatedSdgs = sdgIds ? sdgs.filter((s) => sdgIds.includes(s._id)) : [];
                        const postDisplay: Partial<PostDisplay> = {
                            ...(restOfP as Omit<Post, "sdgs">),
                            _id: p._id.toString(),
                            author: author ? { ...author, _id: author._id.toString() } : undefined,
                            circleType: "post",
                            sdgs: populatedSdgs,
                        };
                        previewDataMap.set(`post-${p._id.toString()}`, postDisplay as PostDisplay);
                    });
                    break;
                case "proposal":
                    // Assuming getProposalById fetches necessary display data
                    const proposals = await Proposals.find(
                        { _id: { $in: ids.map((id) => new ObjectId(id)) } },
                        // Add projection if needed
                    ).toArray();
                    // TODO: Populate author/circle if needed, similar to getProposalById
                    proposals.forEach((p) => {
                        const proposalWithStringId = { ...p, _id: p._id.toString() };
                        // TODO: Also convert author/circle _id if populated here
                        previewDataMap.set(`proposal-${p._id.toString()}`, proposalWithStringId as ProposalDisplay);
                    });
                    break;
                case "issue":
                    // Assuming getIssueById fetches necessary display data
                    const issues = await Issues.find(
                        { _id: { $in: ids.map((id) => new ObjectId(id)) } },
                        // Add projection if needed
                    ).toArray();
                    // TODO: Populate author/assignee/circle if needed, similar to getIssueById
                    issues.forEach((i) => {
                        const issueWithStringId = { ...i, _id: i._id.toString() };
                        // TODO: Also convert author/assignee/circle _id if populated here
                        previewDataMap.set(`issue-${i._id.toString()}`, issueWithStringId as IssueDisplay);
                    });
                    break;
                case "task":
                    // Assuming getTaskById fetches necessary display data
                    const tasks = await Tasks.find(
                        { _id: { $in: ids.map((id) => new ObjectId(id)) } },
                        // Add projection if needed
                    ).toArray();
                    // TODO: Populate author/assignee/circle if needed, similar to getTaskById
                    tasks.forEach((t) => {
                        const taskWithStringId = { ...t, _id: t._id.toString() };
                        // TODO: Also convert author/assignee/circle _id if populated here
                        previewDataMap.set(`task-${t._id.toString()}`, taskWithStringId as TaskDisplay);
                    });
                    break;
            }
        } catch (error) {
            console.error(`Error fetching internal preview data for type ${type}:`, error);
        }
    });

    await Promise.all(promises);

    // Attach fetched data to posts
    postsWithInternalLinks.forEach((post) => {
        const key = `${post.internalPreviewType}-${post.internalPreviewId}`;
        post.internalPreviewData = previewDataMap.get(key) || null; // Set to null if not found
    });
}

export const updatePost = async (post: Partial<Post>): Promise<void> => {
    const { _id, ...postWithoutId } = post;
    let result = await Posts.updateOne({ _id: new ObjectId(_id) }, { $set: postWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Post not found");
    }
    // update post embedding
    let p = await getPost(_id);
    if (p) {
        let author = await getUserByDid(p.createdBy);
        try {
            const { sdgs: sdgIds, ...restOfP } = p;
            const populatedSdgs = sdgIds ? sdgs.filter((s) => sdgIds.includes(s._id)) : [];
            const postForVdb = { ...restOfP, sdgs: populatedSdgs, author: author!, circleType: "post" as const };
            await upsertVbdPosts([postForVdb as PostDisplay]);
        } catch (e) {
            console.error("Failed to upsert post embedding", e);
        }
    }
};

export const getAllComments = async (postId: string, userDid: string | undefined): Promise<CommentDisplay[]> => {
    const comments = (await Comments.aggregate([
        { $match: { postId: postId } },

        // Lookup for author details
        {
            $lookup: {
                from: "circles",
                localField: "createdBy",
                foreignField: "did",
                as: "authorDetails",
            },
        },
        { $unwind: "$authorDetails" },

        // Lookup for reactions on the comment
        {
            $lookup: {
                from: "reactions",
                let: { commentId: { $toString: "$_id" } },
                pipeline: [
                    {
                        $match: {
                            $expr: { $and: [{ $eq: ["$contentId", "$$commentId"] }, { $eq: ["$userDid", userDid] }] },
                        },
                    },
                ],
                as: "userReaction",
            },
        },

        // **Adjusted Lookup for mentions in the comment**
        {
            $lookup: {
                from: "circles",
                let: {
                    mentionIds: {
                        $ifNull: [{ $map: { input: "$mentions", as: "m", in: "$$m.id" } }, []],
                    },
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $in: [{ $toString: "$_id" }, "$$mentionIds"],
                            },
                        },
                    },
                    {
                        $project: {
                            _id: { $toString: "$_id" },
                            did: 1,
                            name: 1,
                            picture: 1,
                            location: 1,
                            description: 1,
                            cover: 1,
                            handle: 1,
                        },
                    },
                ],
                as: "mentionsDetails",
            },
        },

        // Final projection
        {
            $project: {
                _id: { $toString: "$_id" },
                postId: 1,
                parentCommentId: 1,
                content: 1,
                createdBy: 1,
                createdAt: 1,
                reactions: 1,
                replies: 1,
                isDeleted: 1,
                mentions: 1,
                // **Adjusted mapping of mentionsDisplay**
                mentionsDisplay: {
                    $map: {
                        input: { $ifNull: ["$mentions", []] },
                        as: "mention",
                        in: {
                            type: "$$mention.type",
                            id: "$$mention.id",
                            circle: {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: { $ifNull: ["$mentionsDetails", []] },
                                            as: "circle",
                                            cond: {
                                                $eq: ["$$circle._id", "$$mention.id"],
                                            },
                                        },
                                    },
                                    0,
                                ],
                            },
                        },
                    },
                },
                author: {
                    did: "$authorDetails.did",
                    name: "$authorDetails.name",
                    picture: "$authorDetails.picture",
                    location: "$authorDetails.location",
                    description: "$authorDetails.description",
                    images: "$authorDetails.images",
                    handle: "$authorDetails.handle",
                },
                userReaction: { $arrayElemAt: ["$userReaction.reactionType", 0] },
            },
        },
    ]).toArray()) as CommentDisplay[];

    // Compute rootParentId for each comment
    const commentMap = new Map<string, CommentDisplay>();
    comments.forEach((comment) => {
        commentMap.set(comment._id!, comment);
    });

    comments.forEach((comment) => {
        let rootParentId: string | undefined = undefined;
        let currentComment = comment;

        // If the comment is a top-level comment, rootParentId remains undefined
        if (!currentComment.parentCommentId) {
            comment.rootParentId = undefined;
        } else {
            // Walk up the parent chain to find the top-level comment
            while (currentComment.parentCommentId) {
                const parentComment = commentMap.get(currentComment.parentCommentId);
                if (parentComment) {
                    rootParentId = parentComment._id!;
                    currentComment = parentComment;
                } else {
                    // Parent comment not found, break the loop
                    break;
                }
            }
            comment.rootParentId = rootParentId;
        }
    });

    return comments;
};

export const getPostsForEmbedding = async (): Promise<PostDisplay[]> => {
    const posts = await Posts.aggregate([
        // Lookup for author details
        {
            $lookup: {
                from: "circles",
                localField: "createdBy",
                foreignField: "did",
                as: "authorDetails",
            },
        },
        { $unwind: "$authorDetails" },

        // Final projection to select only necessary fields for embedding
        {
            $project: {
                _id: { $toString: "$_id" },
                content: 1,
                createdAt: 1,
                createdBy: 1,
                location: 1,
                // Include author details
                author: {
                    name: "$authorDetails.name",
                    handle: "$authorDetails.handle",
                },
            },
        },
    ]).toArray();

    return posts as PostDisplay[];
};

export const getComment = async (commentId: string): Promise<Comment | null> => {
    let comment = (await Comments.findOne({ _id: new ObjectId(commentId) })) as Comment;
    if (comment) {
        comment._id = comment._id?.toString();
    }
    return comment;
};

export const updateComment = async (
    commentId: string,
    updatedContent: string,
    updatedMentions: Mention[],
): Promise<void> => {
    const result = await Comments.updateOne(
        { _id: new ObjectId(commentId) },
        {
            $set: {
                content: updatedContent,
                mentions: updatedMentions,
                editedAt: new Date(), // Set the edited date
            },
        },
    );

    if (result.matchedCount === 0) {
        throw new Error("Comment not found");
    }
};

export const likeContent = async (
    contentId: string,
    contentType: "post" | "comment",
    userDid: string,
    reactionType: string = "like",
): Promise<void> => {
    // make sure like doesn't already exist
    const existingReaction = await Reactions.findOne({
        contentId,
        contentType,
        userDid,
        reactionType,
    });

    if (existingReaction) {
        return;
    }

    await Reactions.insertOne({
        contentId,
        contentType,
        userDid,
        reactionType,
        createdAt: new Date(),
    });

    const collection = contentType === "post" ? Posts : Comments;
    await collection.updateOne({ _id: new ObjectId(contentId) }, { $inc: { [`reactions.${reactionType}`]: 1 } });

    if (contentType === "comment") {
        const comment = await Comments.findOne({ _id: new ObjectId(contentId) });
        if (comment && !comment.parentCommentId) {
            await updateHighlightedComment(comment.postId);
        }
    }
};

export const unlikeContent = async (
    contentId: string,
    contentType: "post" | "comment",
    userDid: string,
    reactionType: string = "like",
): Promise<void> => {
    await Reactions.deleteOne({
        contentId,
        contentType,
        userDid,
        reactionType,
    });

    const collection = contentType === "post" ? Posts : Comments;
    await collection.updateOne({ _id: new ObjectId(contentId) }, { $inc: { [`reactions.${reactionType}`]: -1 } });

    if (contentType === "comment") {
        const comment = await Comments.findOne({ _id: new ObjectId(contentId) });
        if (comment && !comment.parentCommentId) {
            await updateHighlightedComment(comment.postId);
        }
    }
};

export const getReactions = async (contentId: string, contentType: "post" | "comment"): Promise<Circle[]> => {
    const reactions = await Reactions.find({ contentId, contentType }).limit(20).toArray();
    const userDids = reactions.map((r) => r.userDid);
    const users = await Circles.find({ did: { $in: userDids } }, { projection: SAFE_CIRCLE_PROJECTION }).toArray();
    return users.map((user) => ({
        did: user.did,
        name: user.name,
        picture: user.picture,
        location: user.location,
        description: user.description,
        images: user.images,
        handle: user.handle,
    })) as Circle[];
};

export const checkIfLiked = async (
    contentId: string,
    contentType: "post" | "comment",
    userDid: string,
): Promise<boolean> => {
    const reaction = await Reactions.findOne({
        contentId,
        contentType,
        userDid,
        reactionType: "like",
    });
    return !!reaction;
};
