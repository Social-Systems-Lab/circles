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
    deletePost,
    getComment,
    getAllComments,
    getPosts,
    updateComment,
    deleteComment,
    extractMentions,
    getPostsWithMetrics,
} from "@/lib/data/feed";
import { saveFile, isFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { feedFeaturePrefix } from "@/lib/data/constants";
import {
    Media,
    Post,
    postSchema,
    Comment,
    commentSchema,
    Circle,
    Page,
    PostDisplay,
    CommentDisplay,
    SortingOptions,
} from "@/models/models";
import { revalidatePath } from "next/cache";
import { getCircleById, getCirclePath, getCirclesBySearchQuery } from "@/lib/data/circle";
import { getUserByDid, getUserById } from "@/lib/data/user";
import { redirect } from "next/navigation";

export async function getPostsAction(
    feedId: string,
    circleId: string,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
): Promise<PostDisplay[]> {
    let userDid = undefined;
    try {
        userDid = await getAuthenticatedUserDid();
    } catch (error) {}

    const feed = await getFeed(feedId);
    if (!feed) {
        redirect("/not-found");
    }

    const feature = feedFeaturePrefix + feed.handle + "_view";
    const authorized = await isAuthorized(userDid, circleId, feature);
    if (!authorized) {
        redirect("/not-authorized");
    }

    // get posts for feed
    const posts = await getPostsWithMetrics(feedId, userDid, limit, skip, sortingOptions);
    return posts;
}

export async function createPostAction(
    formData: FormData,
    page: Page,
    subpage?: string,
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
        const authorized = await isAuthorized(userDid, circleId, feature);
        if (!authorized) {
            return { success: false, message: "You are not authorized to post in this feed" };
        }

        let post: Post = {
            content,
            feedId,
            createdBy: userDid,
            createdAt: new Date(),
            reactions: {},
            comments: 0,
        };

        await postSchema.parseAsync(post);

        // parse mentions in the comment content
        const mentions = extractMentions(post.content);
        post.mentions = mentions;

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

        let circlePath = await getCirclePath({ _id: circleId } as Circle);
        revalidatePath(`${circlePath}${page?.handle ?? ""}${subpage ? `/${subpage}` : ""}`);

        return { success: true, message: "Post created successfully", post: newPost };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to create post." };
    }
}

export async function updatePostAction(
    formData: FormData,
    page: Page,
    subpage?: string,
): Promise<{ success: boolean; message?: string; post?: Post }> {
    try {
        const postId = formData.get("postId") as string;
        const content = formData.get("content") as string;
        const circleId = formData.get("circleId") as string;

        const userDid = await getAuthenticatedUserDid();
        const post = await getPost(postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }
        if (post.createdBy !== userDid) {
            return { success: false, message: "You are not authorized to edit this post" };
        }

        let feedId = post.feedId;
        const updatedPost: Partial<Post> = {
            _id: postId,
            content,
            editedAt: new Date(),
        };

        updatedPost.mentions = extractMentions(content);

        let existingMedia: Media[] = [];
        let mediaStr = formData.getAll("existingMedia") as string[];
        if (mediaStr) {
            for (const media of mediaStr) {
                existingMedia.push(JSON.parse(media));
            }
        }
        const newMedia: Media[] = [];
        const images = formData.getAll("media") as File[];
        let imageIndex = existingMedia.length;
        for (const image of images) {
            if (isFile(image)) {
                const savedImage = await saveFile(
                    image,
                    `feeds/${feedId}/${postId}/post-image-${imageIndex}`,
                    circleId,
                    true,
                );
                newMedia.push({ name: image.name, type: image.type, fileInfo: savedImage });
                imageIndex++;
            }
        }

        updatedPost.media = [...existingMedia, ...newMedia];

        await updatePost(updatedPost);

        let circlePath = await getCirclePath({ _id: circleId } as Circle);
        revalidatePath(`${circlePath}${page.handle ?? ""}${subpage ? `/${subpage}` : ""}`);

        return { success: true, message: "Post updated successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to update post." };
    }
}

export async function deletePostAction(
    postId: string,
    page: Page,
    subpage?: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        const post = await getPost(postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }

        const feed = await getFeed(post.feedId);
        let canModerate = false;
        if (feed) {
            const feature = feedFeaturePrefix + feed.handle + "_moderate";
            canModerate = await isAuthorized(userDid, feed.circleId, feature);
        }

        // check if user can moderate feed or is creator of the post
        if (post.createdBy !== userDid && !canModerate) {
            return { success: false, message: "You are not authorized to delete this post" };
        }

        // delete post
        await deletePost(postId);

        // revalidate the page to reflect the changes
        revalidatePath(`/${page.handle}${subpage ? `/${subpage}` : ""}`);

        return { success: true, message: "Post deleted successfully" };
    } catch (error) {
        console.error("Error deleting post:", error);
        return { success: false, message: "An error occurred while deleting the post" };
    }
}

export async function createCommentAction(
    postId: string,
    parentCommentId: string | null,
    content: string,
): Promise<{ success: boolean; message?: string; comment?: CommentDisplay }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        const post = await getPost(postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }

        // check if user is authorized to comment
        const feed = await getFeed(post.feedId);
        if (!feed) {
            return { success: false, message: "Feed not found" };
        }

        const feature = feedFeaturePrefix + feed.handle + "_comment";
        const authorized = await isAuthorized(userDid, feed.circleId, feature);
        if (!authorized) {
            return { success: false, message: "You are not authorized to comment in this feed" };
        }

        const user = await getUserByDid(userDid);

        let comment: CommentDisplay = {
            postId: postId,
            parentCommentId: parentCommentId,
            content: content,
            createdBy: userDid,
            createdAt: new Date(),
            reactions: {},
            replies: 0,
            author: user,
        };

        console.log("Creating comment", comment.content);

        // parse mentions in the comment content
        const mentions = extractMentions(comment.content);
        comment.mentions = mentions;

        await commentSchema.parseAsync(comment);

        let newComment = await createComment(comment);
        comment._id = newComment._id;

        return { success: true, message: "Comment created successfully", comment };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to create comment." };
    }
}

export async function getAllCommentsAction(
    postId: string,
): Promise<{ success: boolean; comments?: CommentDisplay[]; message?: string }> {
    try {
        let post = await getPost(postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }

        let userDid = undefined;
        try {
            userDid = await getAuthenticatedUserDid();
        } catch (error) {}

        const feed = await getFeed(post.feedId);
        if (!feed) {
            return { success: false, message: "Feed not found" };
        }

        const feature = feedFeaturePrefix + feed.handle + "_view";
        const authorized = await isAuthorized(userDid, feed.circleId, feature);
        if (!authorized) {
            return { success: false, message: "You are not authorized to view comments in this feed" };
        }

        const comments = await getAllComments(postId, userDid);
        return { success: true, comments };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to get comments." };
    }
}

export async function editCommentAction(
    commentId: string,
    updatedContent: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        const comment = await getComment(commentId);

        if (!comment) {
            return { success: false, message: "Comment not found" };
        }

        if (comment.createdBy !== userDid) {
            return { success: false, message: "You are not authorized to edit this comment" };
        }

        let updatedMentions = extractMentions(updatedContent);
        await updateComment(commentId, updatedContent, updatedMentions);

        // TODO get updated comment with mentions and update it in UI

        return { success: true, message: "Comment edited successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to edit comment." };
    }
}

export async function deleteCommentAction(commentId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        const comment = await getComment(commentId);

        if (!comment) {
            return { success: false, message: "Comment not found" };
        }

        const post = await getPost(comment.postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }

        const feed = await getFeed(post.feedId);
        if (!feed) {
            return { success: false, message: "Feed not found" };
        }

        const canModerate = await isAuthorized(userDid, feed.circleId, feedFeaturePrefix + feed.handle + "_moderate");

        if (comment.createdBy !== userDid && !canModerate) {
            return { success: false, message: "You are not authorized to delete this comment" };
        }

        await deleteComment(commentId);

        return { success: true, message: "Comment deleted successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to delete comment." };
    }
}

export async function likeContentAction(
    contentId: string,
    contentType: "post" | "comment",
    reactionType: string = "like",
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();

        let postId: string | undefined = contentId;
        if (contentType === "comment") {
            let comment = await getComment(contentId);
            if (!comment) {
                return { success: false, message: "Comment not found" };
            }
            postId = comment.postId;
        }

        const post = await getPost(postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }

        const feed = await getFeed(post.feedId);
        if (feed) {
            const feature = feedFeaturePrefix + feed.handle + "_view";
            let canReact = await isAuthorized(userDid, feed.circleId, feature);
            if (!canReact) {
                return { success: false, message: "You are not authorized to like content in this feed" };
            }
        }

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

export async function searchCirclesAction(
    query: string,
): Promise<{ success: boolean; circles?: Circle[]; message?: string }> {
    try {
        const circles = await getCirclesBySearchQuery(query, 10);
        return { success: true, circles };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to search circles." };
    }
}
