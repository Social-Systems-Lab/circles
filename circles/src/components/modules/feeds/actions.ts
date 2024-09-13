"use server";

import {
    createPost,
    createComment,
    likeContent,
    unlikeContent,
    getReactions,
    checkIfLiked,
    getFeed,
    updatePost,
    getPost,
} from "@/lib/data/feed";
import { saveFile, isFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { feedFeaturePrefix } from "@/lib/data/constants";
import { Media, Post, postSchema, Comment, commentSchema } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getCircleById } from "@/lib/data/circle";

export async function createPostAction(
    formData: FormData,
    isUser: boolean,
): Promise<{ success: boolean; message?: string; post?: Post }> {
    try {
        const content = formData.get("content") as string;
        const circleId = formData.get("circleId") as string;
        const feedId = formData.get("feedId") as string;

        const userDid = await getAuthenticatedUserDid();
        const feed = await getFeed(feedId);
        if (!feed) {
            return { success: false, message: "Feed not found" };
        }

        const feature = feedFeaturePrefix + feed.handle + "_post";
        const authorized = await isAuthorized(userDid, circleId, feature, isUser);
        if (!authorized) {
            return { success: false, message: "You are not authorized to post in this feed" };
        }

        let post: Post = {
            content,
            feedId,
            createdBy: userDid,
            createdAt: new Date(),
            reactions: {},
        };

        await postSchema.parseAsync(post);

        let newPost = await createPost(post);

        try {
            const savedMedia: Media[] = [];
            const images = formData.getAll("media") as File[];
            let imageIndex = 0;
            for (const image of images) {
                if (isFile(image)) {
                    const savedImage = await saveFile(
                        image,
                        `feeds/${feed._id}/${newPost._id}/post-image-${imageIndex}`,
                        circleId,
                        true,
                    );
                    savedMedia.push({ name: image.name, type: image.type, fileInfo: savedImage });
                }
                ++imageIndex;
            }

            if (savedMedia.length > 0) {
                newPost.media = savedMedia;
                await updatePost(newPost);
            }
        } catch (error) {
            console.log("Failed to save post media", error);
        }

        return { success: true, message: "Post created successfully", post: newPost };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to create post." };
    }
}

export async function createCommentAction(commentData: {
    postId: string;
    parentCommentId: string | null;
    content: string;
}): Promise<{ success: boolean; message?: string; comment?: Comment }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        const post = await getPost(commentData.postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }

        // check if user is authorized to comment
        const feed = await getFeed(post.feedId);
        if (!feed) {
            return { success: false, message: "Feed not found" };
        }

        const circle = await getCircleById(feed.circleId);
        const feature = feedFeaturePrefix + feed.handle + "_comment";
        const authorized = await isAuthorized(userDid, circle._id, feature, circle.circleType === "user");
        if (!authorized) {
            return { success: false, message: "You are not authorized to post in this feed" };
        }

        const comment: Comment = {
            postId: commentData.postId,
            parentCommentId: commentData.parentCommentId,
            content: commentData.content,
            createdBy: userDid,
            createdAt: new Date(),
            reactions: {},
        };

        await commentSchema.parseAsync(comment);

        let newComment = await createComment(comment);

        revalidatePath(`/posts/${comment.postId}`); // TODO fix correct revalidate path

        return { success: true, message: "Comment created successfully", comment: newComment };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to create comment." };
    }
}

export async function likeContentAction(
    contentId: string,
    contentType: "post" | "comment",
    reactionType: string = "like",
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

        await likeContent(contentId, contentType, userDid, reactionType);

        return { success: true, message: "Content liked successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to like content." };
    }
}

export async function unlikeContentAction(
    contentId: string,
    contentType: "post" | "comment",
    reactionType: string = "like",
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

        await unlikeContent(contentId, contentType, userDid, reactionType);

        return { success: true, message: "Content unliked successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to unlike content." };
    }
}

export async function getReactionsAction(
    contentId: string,
    contentType: "post" | "comment",
): Promise<{ success: boolean; reactions?: any[]; message?: string }> {
    try {
        const reactions = await getReactions(contentId, contentType);

        return { success: true, reactions };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to get reactions." };
    }
}

export async function checkIfLikedAction(
    contentId: string,
    contentType: "post" | "comment",
): Promise<{ success: boolean; isLiked?: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

        const isLiked = await checkIfLiked(contentId, contentType, userDid);

        return { success: true, isLiked };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to check if liked." };
    }
}
