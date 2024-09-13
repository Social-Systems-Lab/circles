import { Feeds, Posts, Comments, Reactions, Users, Circles } from "./db";
import { ObjectId } from "mongodb";
import { Feed, Post, PostDisplay, Comment, CommentDisplay, Reaction, MemberDisplay, Circle } from "@/models/models";
import { getUserById, updateUser } from "./user";
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

    if (!comment.parentCommentId) {
        await updateHighlightedComment(comment.postId);
    }

    return insertedComment;
};

export const getPosts = async (feedId: string, limit: number = 10, offset: number = 0): Promise<PostDisplay[]> => {
    const posts = await Posts.aggregate([
        { $match: { feedId: feedId } },
        { $sort: { createdAt: -1 } },
        { $skip: offset },
        { $limit: limit },
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
                localField: "highlightedCommentId",
                foreignField: "_id",
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
            $project: {
                _id: { $toString: "$_id" },
                feedId: 1,
                content: 1,
                createdAt: 1,
                reactions: 1,
                media: 1,
                createdBy: 1,
                highlightedCommentId: 1,
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
                    _id: { $toString: "$highlightedComment._id" },
                    postId: "$highlightedComment.postId",
                    parentCommentId: "$highlightedComment.parentCommentId",
                    content: "$highlightedComment.content",
                    createdBy: "$highlightedComment.createdBy",
                    createdAt: "$highlightedComment.createdAt",
                    reactions: "$highlightedComment.reactions",
                    author: {
                        did: "$highlightedCommentAuthor.did",
                        name: "$highlightedCommentAuthor.name",
                        picture: "$highlightedCommentAuthor.picture",
                        location: "$highlightedCommentAuthor.location",
                        description: "$highlightedCommentAuthor.description",
                        cover: "$highlightedCommentAuthor.cover",
                        handle: "$highlightedCommentAuthor.handle",
                    },
                },
            },
        },
    ]).toArray();

    return posts as PostDisplay[];
};

export const updatePost = async (post: Partial<Post>): Promise<void> => {
    const { _id, ...postWithoutId } = post;
    let result = await Posts.updateOne({ _id: new ObjectId(_id) }, { $set: postWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Post not found");
    }
};

export const getComments = async (postId: string, parentCommentId: string | null = null): Promise<CommentDisplay[]> => {
    const comments = await Comments.aggregate([
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
    ]).toArray();

    return comments as CommentDisplay[];
};

export const likeContent = async (
    contentId: string,
    contentType: "post" | "comment",
    userDid: string,
    reactionType: string = "like",
): Promise<void> => {
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
