// \feeds\actions.ts - server actions for feed related operations
"use server";

import {
    createPost,
    createComment,
    likeContent,
    unlikeContent,
    getReactions,
    checkIfLiked,
    getFeed,
    getFeedByHandle,
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
    getPostsFromMultipleFeeds,
    getFeedsByCircleId,
    getPostsFromMultipleFeedsWithMetrics,
    getPublicFeeds,
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
    Feed,
} from "@/models/models";
import { revalidatePath } from "next/cache";
import { getCircleById, getCirclePath, getCirclesBySearchQuery } from "@/lib/data/circle";
import { getUserByDid, getUserById, getUserPrivate } from "@/lib/data/user";
import { redirect } from "next/navigation";
import {
    notifyPostComment,
    notifyCommentReply,
    notifyCommentLike,
    notifyPostLike,
    notifyPostMentions,
    notifyCommentMentions,
} from "@/lib/data/notifications";

// Global posts: posts from all public feeds
export async function getGlobalPostsAction(
    userDid: string,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
): Promise<PostDisplay[]> {
    // Get all public feeds
    const publicFeeds = await getPublicFeeds();
    if (publicFeeds.length === 0) return [];

    // Map the public feeds to their IDs
    const publicFeedIds = publicFeeds.map((feed) => feed._id.toString());

    // Use your existing function to get posts across multiple feeds with metrics
    const posts = await getPostsFromMultipleFeedsWithMetrics(publicFeedIds, userDid, limit, skip, sortingOptions);
    return posts;
}

export async function getAggregatePostsAction(
    userDid: string,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
): Promise<PostDisplay[]> {
    // Get all circles the user is a member of
    const user = await getUserPrivate(userDid);

    // Collect all feeds the user has access to
    const accessibleFeeds: string[] = [];

    for (const membership of user.memberships) {
        // ignore the default circle
        if (membership.circle.handle === "default") {
            continue;
        }

        const { circleId, userGroups } = membership;

        // Get all feeds in the circle
        const feeds = await getFeedsByCircleId(circleId);
        for (const feed of feeds) {
            // Check if user has read access to the feed
            if (feed.userGroups.some((group) => userGroups.includes(group))) {
                accessibleFeeds.push(feed._id?.toString());
            }
        }
    }

    if (accessibleFeeds.length === 0) {
        return [];
    }

    // Get posts from all accessible feeds
    const posts = await getPostsFromMultipleFeedsWithMetrics(accessibleFeeds, userDid, limit, skip, sortingOptions);
    return posts;
}

export async function getPostsAction(
    feedId: string,
    circleId: string,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
): Promise<PostDisplay[]> {
    let userDid = await getAuthenticatedUserDid();
    const feed = await getFeed(feedId);
    if (!feed) {
        redirect("/not-found");
    }

    const feature = feedFeaturePrefix + feed.handle + "_view";
    const authorized = await isAuthorized(userDid, circleId, feature);
    if (!authorized) {
        redirect("/unauthorized");
    }

    // get posts for feed
    const posts = await getPostsWithMetrics(feedId, userDid, limit, skip, sortingOptions);
    return posts;
}

export async function createPostAction(
    formData: FormData,
    page?: Page,
    subpage?: string,
): Promise<{ success: boolean; message?: string; post?: Post }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to create a post" };
    }

    try {
        const content = formData.get("content") as string;
        const circleId = formData.get("circleId") as string;
        const locationStr = formData.get("location") as string;
        const location = locationStr ? JSON.parse(locationStr) : undefined;

        // Get user groups from form data
        const userGroups = formData.getAll("userGroups") as string[];

        // Get the default feed for this circle
        const feed = await getFeedByHandle(circleId, "default");
        if (!feed) {
            return { success: false, message: "Default feed not found for this circle" };
        }

        const feedId = feed._id.toString();

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
            location,
            userGroups: userGroups.length > 0 ? userGroups : ["everyone"], // Use provided user groups or default to everyone
        };

        console.log("creating post", JSON.stringify(post.location));
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

        // Send notifications for mentions
        try {
            if (mentions && mentions.length > 0) {
                const user = await getUserByDid(userDid);

                // Get the Circle objects for all mentioned circles
                const mentionedCircles = await Promise.all(
                    mentions.map(async (mention) => {
                        return await getCircleById(mention.id);
                    }),
                );

                // Filter out any null results
                const validMentionedCircles = mentionedCircles.filter((circle) => circle !== null);
                if (validMentionedCircles.length > 0) {
                    await notifyPostMentions(newPost, user, validMentionedCircles);
                }
            }
        } catch (notificationError) {
            console.error("Failed to send mention notifications:", notificationError);
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
    const userDid = await getAuthenticatedUserDid();

    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit a post" };
    }

    try {
        const postId = formData.get("postId") as string;
        const content = formData.get("content") as string;
        const circleId = formData.get("circleId") as string;
        const locationStr = formData.get("location") as string;
        const location = locationStr ? JSON.parse(locationStr) : undefined;
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
            location,
        };

        console.log("Updating post", JSON.stringify(updatedPost.location));
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

        // Send notifications for new mentions
        try {
            if (updatedPost.mentions && updatedPost.mentions.length > 0) {
                const user = await getUserByDid(userDid);

                // Get previous mentions to avoid duplicate notifications
                const previousMentions = post.mentions?.map((m) => m.id) || [];

                // Filter to only new mentions
                const newMentions = updatedPost.mentions.filter((mention) => !previousMentions.includes(mention.id));
                if (newMentions.length > 0) {
                    // Get the Circle objects for all newly mentioned circles
                    const mentionedCircles = await Promise.all(
                        newMentions.map(async (mention) => {
                            return await getCircleById(mention.id);
                        }),
                    );

                    // Filter out any null results
                    const validMentionedCircles = mentionedCircles.filter((circle) => circle !== null);

                    if (validMentionedCircles.length > 0) {
                        // Use the existing post with updated mentions
                        const mergedPost = { ...post, ...updatedPost };
                        await notifyPostMentions(mergedPost, user, validMentionedCircles);
                    }
                }
            }
        } catch (notificationError) {
            console.error("Failed to send mention notifications:", notificationError);
        }

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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete a post" };
    }

    try {
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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to create a comment" };
    }

    try {
        console.log("🐞 [ACTION] Creating comment action start:", {
            postId,
            contentPreview: content.substring(0, 30),
        });

        const post = await getPost(postId);
        if (!post) {
            console.log("🐞 [ACTION] Post not found:", postId);
            return { success: false, message: "Post not found" };
        }

        // check if user is authorized to comment
        const feed = await getFeed(post.feedId);
        if (!feed) {
            console.log("🐞 [ACTION] Feed not found:", post.feedId);
            return { success: false, message: "Feed not found" };
        }

        const feature = feedFeaturePrefix + feed.handle + "_comment";
        const authorized = await isAuthorized(userDid, feed.circleId, feature);
        if (!authorized) {
            console.log("🐞 [ACTION] User not authorized:", { userDid, feature });
            return { success: false, message: "You are not authorized to comment in this feed" };
        }

        const user = await getUserByDid(userDid);
        if (!user) {
            console.log("🐞 [ACTION] User not found:", userDid);
            return { success: false, message: "User not found" };
        }

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

        console.log("🐞 [ACTION] Creating comment:", {
            postId,
            parentCommentId,
            contentPreview: content.substring(0, 50) + (content.length > 50 ? "..." : ""),
            authorDid: userDid,
            authorName: user?.name,
            feedId: post.feedId,
            feedHandle: feed.handle,
            postAuthorDid: post.createdBy,
        });

        // parse mentions in the comment content
        const mentions = extractMentions(comment.content);
        comment.mentions = mentions;

        try {
            await commentSchema.parseAsync(comment);
        } catch (validationError) {
            console.error("🐞 [ACTION] Comment validation failed:", validationError);
            return { success: false, message: "Invalid comment data" };
        }

        // Create the comment in the database
        let newComment;
        try {
            newComment = await createComment(comment);
            comment._id = newComment._id;
            console.log("🐞 [ACTION] Comment created successfully:", newComment._id);
        } catch (dbError) {
            console.error("🐞 [ACTION] Database error creating comment:", dbError);
            return { success: false, message: "Database error creating comment" };
        }

        // Send notifications directly without setTimeout, but still don't block on them
        try {
            console.log("🐞 [ACTION] Sending notifications for comment:", newComment._id);

            // 1. If it's a direct comment on a post, notify the post author
            if (!parentCommentId) {
                // Use Promise.resolve to avoid blocking, but still within current process
                console.log("🐞 [ACTION] Post comment notification sent to author:", post.createdBy);
                await notifyPostComment(post, newComment, user);
            }

            // 2. If it's a reply to another comment, notify the parent comment author
            else {
                const parentComment = await getComment(parentCommentId);
                if (parentComment) {
                    await notifyCommentReply(post, parentComment, newComment, user);
                    console.log("🐞 [ACTION] Comment reply notification sent to:", parentComment.createdBy);
                }
            }

            // 3. If the comment has mentions, notify mentioned users
            if (mentions && mentions.length > 0) {
                // Get the Circle objects for all mentioned circles
                const mentionedCircles = await Promise.all(
                    mentions.map(async (mention) => {
                        return await getCircleById(mention.id);
                    }),
                );

                // Filter out any null results
                const validMentionedCircles = mentionedCircles.filter((circle) => circle !== null);

                if (validMentionedCircles.length > 0) {
                    await notifyCommentMentions(newComment, post, user, validMentionedCircles);
                    console.log(
                        "🐞 [ACTION] Mention notifications sent to:",
                        validMentionedCircles.map((c) => c.name).join(", "),
                    );
                }
            }

            console.log("🐞 [ACTION] Notifications sent successfully for comment:", newComment._id);
        } catch (notificationError) {
            // Log but don't fail the comment creation if notifications fail
            console.error("🐞 [ACTION] Failed to send notifications:", notificationError);
        }

        return { success: true, message: "Comment created successfully", comment };
    } catch (error) {
        console.error("🐞 [ACTION] Unhandled error in createCommentAction:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to create comment." };
    }
}

export async function getAllCommentsAction(
    postId: string,
): Promise<{ success: boolean; comments?: CommentDisplay[]; message?: string }> {
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to view comments" };
    }

    try {
        let post = await getPost(postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }

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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit a comment" };
    }

    try {
        const comment = await getComment(commentId);

        if (!comment) {
            return { success: false, message: "Comment not found" };
        }

        if (comment.createdBy !== userDid) {
            return { success: false, message: "You are not authorized to edit this comment" };
        }

        const updatedMentions = extractMentions(updatedContent);
        await updateComment(commentId, updatedContent, updatedMentions);

        // Send notifications for new mentions

        try {
            const post = await getPost(comment.postId);
            if (post && updatedMentions && updatedMentions.length > 0) {
                const user = await getUserByDid(userDid);
                // Get previous mentions to avoid duplicate notifications
                const previousMentions = comment.mentions?.map((m) => m.id) || [];
                // Filter to only new mentions
                const newMentions = updatedMentions.filter((mention) => !previousMentions.includes(mention.id));

                if (newMentions.length > 0) {
                    // Get the Circle objects for all newly mentioned circles
                    const mentionedCircles = await Promise.all(
                        newMentions.map(async (mention) => {
                            return await getCircleById(mention.id);
                        }),
                    );

                    // Filter out any null results
                    const validMentionedCircles = mentionedCircles.filter((circle) => circle !== null);
                    if (validMentionedCircles.length > 0) {
                        // Use the updated comment
                        const updatedCommentObj = {
                            ...comment,
                            content: updatedContent,
                            mentions: updatedMentions,
                        };

                        await notifyCommentMentions(updatedCommentObj, post, user, validMentionedCircles);
                    }
                }
            }
        } catch (notificationError) {
            console.error("Failed to send mention notifications:", notificationError);
        }

        return { success: true, message: "Comment edited successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to edit comment." };
    }
}

export async function deleteCommentAction(commentId: string): Promise<{ success: boolean; message?: string }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete a comment" };
    }

    try {
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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to like content" };
    }

    try {
        let postId: string | undefined = contentId;
        let comment: Comment | null = null;
        if (contentType === "comment") {
            comment = await getComment(contentId);
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

        // Send notification
        try {
            const reactor = await getUserByDid(userDid);

            if (contentType === "post") {
                await notifyPostLike(contentId, reactor, reactionType);
            } else if (comment) {
                await notifyCommentLike(comment, post, reactor, reactionType);
            }
        } catch (notificationError) {
            console.error("Failed to send like notification:", notificationError);
        }

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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to unlike content" };
    }

    try {
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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to check if liked" };
    }

    try {
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

/**
 * Get a post by ID
 */
export async function getPostAction(postId: string): Promise<Post | null> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return null;

    try {
        const post = await getPost(postId);
        if (!post) return null;

        const feed = await getFeed(post.feedId);
        if (!feed) return null;

        // Check if user has permission to view the feed
        const feature = feedFeaturePrefix + feed.handle + "_view";
        const authorized = await isAuthorized(userDid, feed.circleId, feature);
        if (!authorized) return null;

        return post;
    } catch (error) {
        console.error("Error getting post:", error);
        return null;
    }
}

/**
 * Get a feed by handle and circle ID
 */
export async function getFeedByHandleAction(circleId: string, feedHandle: string): Promise<Feed | null> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) return null;

    try {
        const feed = await getFeed(feedHandle);
        if (!feed) return null;

        // Check if user has permission to view the feed
        const feature = feedFeaturePrefix + feed.handle + "_view";
        const authorized = await isAuthorized(userDid, circleId, feature);
        if (!authorized) return null;

        return feed;
    } catch (error) {
        console.error("Error getting feed by handle:", error);
        return null;
    }
}
