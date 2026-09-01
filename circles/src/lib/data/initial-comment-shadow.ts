import { ObjectId } from "mongodb";
import type { Feed, Post } from "@/models/models";

type InitialCommentShadowInput = Omit<Post, "_id" | "feedId">;

export type InitialCommentShadowDependencies = {
    findFeed: (query: { circleId: string; handle: "default" }) => Promise<Feed | null>;
    createShadow: (post: Omit<Post, "_id">) => Promise<Post>;
};

const defaultDependencies: InitialCommentShadowDependencies = {
    findFeed: async (query) => {
        const { Feeds } = await import("./db");
        return Feeds.findOne(query);
    },
    createShadow: async (post) => {
        const { createPost } = await import("./feed");
        return createPost(post);
    },
};

const normalizeId = (value: unknown): string | null => {
    if (!(typeof value === "string" || value instanceof ObjectId) || !ObjectId.isValid(String(value))) return null;
    return new ObjectId(String(value)).toHexString();
};

export async function createInitialCommentShadow(
    circleId: string,
    input: InitialCommentShadowInput,
    dependencies: InitialCommentShadowDependencies = defaultDependencies,
): Promise<Post | null> {
    const canonicalCircleId = normalizeId(circleId);
    if (!canonicalCircleId) return null;
    const feed = await dependencies.findFeed({ circleId: canonicalCircleId, handle: "default" });
    const feedId = normalizeId(feed?._id);
    if (!feed || !feedId || feed.handle !== "default" || normalizeId(feed.circleId) !== canonicalCircleId) return null;
    return dependencies.createShadow({ ...input, feedId });
}
