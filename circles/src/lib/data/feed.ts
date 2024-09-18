import { Feeds, Posts, Comments, Reactions, Circles } from "./db";
import { ObjectId } from "mongodb";
import { Feed, Post, PostDisplay, Comment, CommentDisplay, Circle } from "@/models/models";
import { getCircleById, updateCircle } from "./circle";
import { addFeedsAccessRules } from "../utils";

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

export const createDefaultFeeds = async (circleId: string): Promise<Feed[] | null> => {
    let circle = await getCircleById(circleId);
    if (!circle) {
        return null;
    }

    let feeds: Feed[] = [];
    let publicFeed = await getFeedByHandle(circleId, "default");
    if (!publicFeed) {
        publicFeed = {
            name: "Public Feed",
            handle: "default",
            circleId,
            userGroups: ["admins", "moderators", "members", "everyone"],
            createdAt: new Date(),
        };
        publicFeed = await createFeed(publicFeed);
    }
    feeds.push(publicFeed);

    let membersFeed = await getFeedByHandle(circleId, "members");
    if (!membersFeed) {
        membersFeed = {
            name: circle.circleType === "user" ? "Friends Only" : "Members Only",
            handle: "members",
            circleId,
            userGroups: ["admins", "moderators", "members"],
            createdAt: new Date(),
        };
        membersFeed = await createFeed(membersFeed);
    }
    feeds.push(membersFeed);

    // get all feeds
    let existingFeeds = await getFeeds(circleId);

    // make sure access rules exist for all feeds
    const finalAccessRules = addFeedsAccessRules(existingFeeds, circle.accessRules ?? {});
    circle.accessRules = finalAccessRules;

    // update the circle
    await updateCircle(circle);
    return existingFeeds;
};

export const createPost = async (post: Post): Promise<Post> => {
    const result = await Posts.insertOne(post);
    return { ...post, _id: result.insertedId.toString() };
};

export const deletePost = async (postId: string): Promise<void> => {
    await Posts.deleteOne({ _id: new ObjectId(postId) });

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

export const createComment = async (comment: Comment): Promise<Comment> => {
    const result = await Comments.insertOne(comment);
    const insertedComment = { ...comment, _id: result.insertedId.toString() };
    await Posts.updateOne({ _id: new ObjectId(comment.postId) }, { $inc: { comments: 1 } });

    if (!comment.parentCommentId) {
        await updateHighlightedComment(comment.postId);
    }

    return insertedComment;
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
                    createdBy: undefined,
                    reactions: {},
                },
                $unset: { createdBy: "", author: "" },
            },
        );
    } else {
        // If the comment has no replies, delete it
        await Comments.deleteOne({ _id: new ObjectId(commentId) });

        // Decrement comment count for the post
        await Posts.updateOne({ _id: new ObjectId(comment.postId) }, { $inc: { comments: -1 } });

        if (comment.parentCommentId) {
            // Decrement comment count for the parent comment
            await Comments.updateOne({ _id: new ObjectId(comment.parentCommentId) }, { $inc: { comments: -1 } });
        }
    }

    if (!comment.parentCommentId) {
        await updateHighlightedComment(comment.postId);
    }
};

export const getPosts = async (
    feedId: string,
    userDid?: string,
    limit: number = 10,
    offset: number = 0,
): Promise<PostDisplay[]> => {
    const safeLimit = Math.max(1, limit);
    const safeOffset = Math.max(0, offset);

    const posts = (await Posts.aggregate([
        { $match: { feedId: feedId } },
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
                from: "comments",
                let: { highlightedCommentId: { $toObjectId: "$highlightedCommentId" } },
                pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$highlightedCommentId"] } } }, { $limit: 1 }],
                as: "highlightedComment",
            },
        },
        { $unwind: { path: "$highlightedComment", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "circles",
                localField: "highlightedComment.createdBy",
                foreignField: "did",
                as: "highlightedCommentAuthor",
            },
        },
        { $unwind: { path: "$highlightedCommentAuthor", preserveNullAndEmptyArrays: true } },
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
        {
            $lookup: {
                from: "reactions",
                let: { commentId: { $toString: "$highlightedComment._id" } },
                pipeline: [
                    {
                        $match: {
                            $expr: { $and: [{ $eq: ["$contentId", "$$commentId"] }, { $eq: ["$userDid", userDid] }] },
                        },
                    },
                ],
                as: "highlightedCommentUserReaction",
            },
        },
        {
            $group: {
                _id: "$_id",
                feedId: { $first: "$feedId" },
                content: { $first: "$content" },
                createdAt: { $first: "$createdAt" },
                reactions: { $first: "$reactions" },
                media: { $first: "$media" },
                createdBy: { $first: "$createdBy" },
                highlightedCommentId: { $first: "$highlightedCommentId" },
                authorDetails: { $first: "$authorDetails" },
                highlightedComment: { $first: "$highlightedComment" },
                highlightedCommentAuthor: { $first: "$highlightedCommentAuthor" },
                userReaction: { $first: "$userReaction" },
                highlightedCommentUserReaction: { $first: "$highlightedCommentUserReaction" },
            },
        },
        { $sort: { createdAt: -1 } },
        { $skip: safeOffset },
        { $limit: safeLimit },
        {
            $project: {
                _id: { $toString: "$_id" },
                feedId: 1,
                content: 1,
                createdAt: 1,
                reactions: 1,
                media: 1,
                createdBy: 1,
                comments: 1,
                circleType: { $literal: "post" },
                highlightedCommentId: { $toString: "$highlightedCommentId" },
                author: {
                    did: "$authorDetails.did",
                    name: "$authorDetails.name",
                    picture: "$authorDetails.picture",
                    location: "$authorDetails.location",
                    description: "$authorDetails.description",
                    cover: "$authorDetails.cover",
                    handle: "$authorDetails.handle",
                },
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
                            author: {
                                did: "$highlightedCommentAuthor.did",
                                name: "$highlightedCommentAuthor.name",
                                picture: "$highlightedCommentAuthor.picture",
                                location: "$highlightedCommentAuthor.location",
                                description: "$highlightedCommentAuthor.description",
                                cover: "$highlightedCommentAuthor.cover",
                                handle: "$highlightedCommentAuthor.handle",
                            },
                            userReaction: { $arrayElemAt: ["$highlightedCommentUserReaction.reactionType", 0] },
                        },
                        else: null,
                    },
                },
                userReaction: { $arrayElemAt: ["$userReaction.reactionType", 0] },
            },
        },
    ]).toArray()) as PostDisplay[];

    return posts;
};
export const updatePost = async (post: Partial<Post>): Promise<void> => {
    const { _id, ...postWithoutId } = post;
    let result = await Posts.updateOne({ _id: new ObjectId(_id) }, { $set: postWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Post not found");
    }
};

export const getComments = async (postId: string, parentCommentId: string | null = null): Promise<CommentDisplay[]> => {
    const comments = (await Comments.aggregate([
        { $match: { postId: postId, parentCommentId: parentCommentId } },
        { $sort: { createdAt: 1 } },
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
            $project: {
                _id: { $toString: "$_id" },
                postId: 1,
                parentCommentId: 1,
                content: 1,
                createdBy: 1,
                createdAt: 1,
                reactions: 1,
                author: {
                    did: "$authorDetails.did",
                    name: "$authorDetails.name",
                    picture: "$authorDetails.picture",
                    location: "$authorDetails.location",
                    description: "$authorDetails.description",
                    cover: "$authorDetails.cover",
                    handle: "$authorDetails.handle",
                },
            },
        },
    ]).toArray()) as CommentDisplay[];

    comments.forEach((comment: CommentDisplay) => {
        if (comment._id) {
            comment._id = comment._id.toString();
        }
    });

    return comments;
};

export const getComment = async (commentId: string): Promise<Comment | null> => {
    let comment = (await Comments.findOne({ _id: new ObjectId(commentId) })) as Comment;
    if (comment) {
        comment._id = comment._id?.toString();
    }
    return comment;
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
    const users = await Circles.find({ did: { $in: userDids } }).toArray();
    return users.map((user) => ({
        did: user.did,
        name: user.name,
        picture: user.picture,
        location: user.location,
        description: user.description,
        cover: user.cover,
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

export const updateHighlightedComment = async (postId: string): Promise<void> => {
    const mostLikedComment = await Comments.find({ postId, parentCommentId: null })
        .sort({ "reactions.like": -1, createdAt: -1 })
        .limit(1)
        .toArray();

    const highlightedCommentId = mostLikedComment.length > 0 ? mostLikedComment[0]._id : undefined;
    await Posts.updateOne({ _id: new ObjectId(postId) }, { $set: { highlightedCommentId } });
};
