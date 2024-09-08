import { db } from "./db";
import { ObjectId } from "mongodb";
import { Feed, Post } from "@/models/models";

export const Feeds = db.collection<Feed>("feeds");
export const Posts = db.collection<Post>("posts");

export const createFeed = async (feed: Feed): Promise<Feed> => {
    const result = await Feeds.insertOne(feed);
    return { ...feed, _id: result.insertedId };
};

export const getFeed = async (feedId: string): Promise<Feed | null> => {
    return await Feeds.findOne({ _id: new ObjectId(feedId) });
};

export const getFeeds = async (circleId: string): Promise<Feed[]> => {
    return await Feeds.find({
        circleId,
    }).toArray();
};

export const createPost = async (post: Post): Promise<Post> => {
    const result = await Posts.insertOne(post);
    return { ...post, _id: result.insertedId };
};

export const getPosts = async (feedId: string, limit: number = 10, offset: number = 0): Promise<Post[]> => {
    return await Posts.find({ feedId }).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray();
};

export const addReaction = async (postId: string, reactionType: string): Promise<void> => {
    await Posts.updateOne({ _id: new ObjectId(postId) }, { $inc: { [`reactions.${reactionType}`]: 1 } });
};

export const removeReaction = async (postId: string, reactionType: string): Promise<void> => {
    await Posts.updateOne({ _id: new ObjectId(postId) }, { $inc: { [`reactions.${reactionType}`]: -1 } });
};
