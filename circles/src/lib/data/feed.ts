import { db } from "./db";
import { ObjectId } from "mongodb";
import { Feed, Post, PostDisplay } from "@/models/models";
import { getCircleById, updateCircle } from "./circle";
import { getUser, getUserById, updateUser } from "./user";
import { addFeedsAccessRules } from "../utils";

export const Feeds = db.collection<Feed>("feeds");
export const Posts = db.collection<Post>("posts");

export const createFeed = async (feed: Feed): Promise<Feed> => {
    const result = await Feeds.insertOne(feed);
    return { ...feed, _id: result.insertedId };
};

export const getFeed = async (feedId: string): Promise<Feed | null> => {
    let feed = (await Feeds.findOne({ _id: new ObjectId(feedId) })) as Feed;
    if (feed?._id) {
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

export const createPost = async (post: Post): Promise<Post> => {
    const result = await Posts.insertOne(post);
    return { ...post, _id: result.insertedId.toString() };
};

export const getPosts = async (feedId: string, limit: number = 10, offset: number = 0): Promise<PostDisplay[]> => {
    const posts = await Posts.aggregate([
        { $match: { feedId: feedId } },
        { $sort: { createdAt: -1 } }, // sort by creation date in descending order
        { $skip: offset }, // skip to the specified offset for pagination
        { $limit: limit }, // limit the number of results to the specified limit
        {
            $lookup: {
                from: "users", // look up the user (author) details from the Users collection
                localField: "createdBy", // field in Posts collection that holds the user DID
                foreignField: "did", // field in Users collection to match against
                as: "authorDetails", // store the result in this field
            },
        },
        { $unwind: "$authorDetails" }, // unwind the array of matched user details (since we expect only one author per post)
        {
            $project: {
                _id: { $toString: "$_id" }, // convert ObjectId to string
                feedId: 1,
                content: 1,
                createdAt: 1,
                reactions: 1,
                media: 1,
                createdBy: 1, // keep original field
                author: {
                    _id: { $toString: "$authorDetails._id" },
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

    return posts as PostDisplay[];
};

export const updatePost = async (post: Partial<Post>): Promise<void> => {
    const { _id, ...postWithoutId } = post;
    let result = await Posts.updateOne({ _id: new ObjectId(_id) }, { $set: postWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("Post not found");
    }
};

export const addReaction = async (postId: string, reactionType: string): Promise<void> => {
    await Posts.updateOne({ _id: new ObjectId(postId) }, { $inc: { [`reactions.${reactionType}`]: 1 } });
};

export const removeReaction = async (postId: string, reactionType: string): Promise<void> => {
    await Posts.updateOne({ _id: new ObjectId(postId) }, { $inc: { [`reactions.${reactionType}`]: -1 } });
};

export const createDefaultFeeds = async (circleId: string, isUser: boolean): Promise<Feed[] | null> => {
    let circle = null;
    if (isUser) {
        circle = await getUserById(circleId);
    } else {
        circle = await getCircleById(circleId);
    }
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
            name: circle.circleType === "user" ? "Inner Circle" : "Member Discussion",
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
    if (isUser) {
        await updateUser(circle);
    } else {
        await updateCircle(circle);
    }

    return existingFeeds;
};
