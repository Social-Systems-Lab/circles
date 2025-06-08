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
    getPublicUserFeed, // Added getPublicUserFeed
    createFeed,
    createDefaultFeed,
} from "@/lib/data/feed";
import { saveFile, isFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getProposalById } from "@/lib/data/proposal";
import { getIssueById } from "@/lib/data/issue";
import {
    Media,
    ProposalDisplay,
    IssueDisplay,
    Post,
    postSchema,
    Comment,
    commentSchema,
    Circle,
    PostDisplay,
    CommentDisplay,
    SortingOptions,
    Feed,
    FileInfo, // Added FileInfo
} from "@/models/models";
import { revalidatePath } from "next/cache";
import { getCircleById, getCirclePath, getCirclesBySearchQuery, getCircleByHandle } from "@/lib/data/circle"; // Added getCircleByHandle
import { getLinkPreview } from "link-preview-js"; // Removed LinkPreview import
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
import { ensureModuleIsEnabledOnCircle } from "@/lib/data/circle"; // Added

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

// --- Add Link Preview Action ---
// Define a more specific type for the expected preview data
type ExpectedPreview = {
    url: string;
    title?: string;
    description?: string;
    image?: string; // We'll extract the first image
    mediaType?: string;
    contentType?: string;
    favicons?: string[];
};

export async function getLinkPreviewAction(url: string): Promise<{
    success: boolean;
    preview?: ExpectedPreview; // Use the refined type
    error?: string;
}> {
    try {
        // Basic URL validation before fetching
        new URL(url); // Throws if invalid

        const previewDataResponse = await getLinkPreview(url, {
            timeout: 5000, // Set a timeout (e.g., 5 seconds)
            headers: {
                "User-Agent": "MakeCirclesBot/1.0 (+https://makecircles.com/bot)", // Identify the bot
                "Accept-Language": "en-US,en;q=0.9", // Prefer English content
            },
            followRedirects: `follow`, // Follow redirects
            handleRedirects: (baseURL: string, forwardedURL: string): boolean => {
                // Optional: Add logic to control which redirects to follow
                // console.log(`Redirecting from ${baseURL} to ${forwardedURL}`);
                return true; // Follow all redirects by default
            },
        });

        // Cast to 'any' to bypass strict type checking for this library
        const previewData: any = previewDataResponse;

        // Check if previewData is valid and has a URL
        if (previewData?.url) {
            let image = previewData.images?.[0]; // Take the first image

            // Ensure image URL is absolute
            if (image && !image.startsWith("http")) {
                try {
                    const baseUrl = new URL(previewData.url);
                    image = new URL(image, baseUrl.origin).toString();
                } catch (e) {
                    console.warn("Could not resolve relative image URL:", image);
                    image = undefined; // Remove invalid relative image
                }
            }

            // Construct the result object safely checking each property
            const resultPreview: ExpectedPreview = {
                url: previewData.url,
                title: typeof previewData.title === "string" ? previewData.title : undefined,
                description: typeof previewData.description === "string" ? previewData.description : undefined,
                image: image, // Use the potentially resolved absolute image URL
                mediaType: typeof previewData.mediaType === "string" ? previewData.mediaType : undefined,
                contentType: typeof previewData.contentType === "string" ? previewData.contentType : undefined,
                favicons: Array.isArray(previewData.favicons) ? previewData.favicons : undefined,
            };

            // Ensure at least one core piece of metadata exists besides the URL
            if (resultPreview.title || resultPreview.description || resultPreview.image) {
                return { success: true, preview: resultPreview };
            } else {
                console.warn("Link preview incomplete (missing title, description, and image):", url, previewData);
                return { success: false, error: "Could not fetch a valid link preview (missing metadata)." };
            }
        } else {
            console.warn("Link preview incomplete or failed (missing URL):", url, previewData);
            return { success: false, error: "Could not fetch a valid link preview (missing URL)." };
        }
    } catch (error: any) {
        console.error("Error fetching link preview for:", url, error);
        // Check for specific error types if needed
        if (error.message?.includes("Invalid URL")) {
            return { success: false, error: "Invalid URL provided." };
        }
        if (error.message?.includes("timeout")) {
            return { success: false, error: "Fetching preview timed out." };
        }
        return { success: false, error: "Failed to fetch link preview." };
    }
}
// --- End Link Preview Action ---

// --- Internal Link Preview Action ---

export type InternalLinkPreviewResult =
    | { type: "circle"; data: Circle }
    | { type: "post"; data: PostDisplay }
    | { type: "proposal"; data: ProposalDisplay }
    | { type: "issue"; data: IssueDisplay }
    | { error: string }; // For not found, unauthorized, or other errors

export async function getInternalLinkPreviewData(url: string): Promise<InternalLinkPreviewResult> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { error: "Unauthorized" };
    }

    try {
        const parsedUrl = new URL(url, "http://dummybase"); // Use a dummy base for relative URLs
        const pathname = parsedUrl.pathname;

        // Regex patterns for internal links
        const postRegex = /^\/circles\/([a-zA-Z0-9\-]+)\/post\/([a-zA-Z0-9]+)$/;
        const proposalRegex = /^\/circles\/([a-zA-Z0-9\-]+)\/proposals\/([a-zA-Z0-9]+)$/;
        const issueRegex = /^\/circles\/([a-zA-Z0-9\-]+)\/issues\/([a-zA-Z0-9]+)$/;
        const circleRegex = /^\/circles\/([a-zA-Z0-9\-]+)(?:\/.*)?$/; // Matches base circle URL and subpaths

        const postMatch = pathname.match(postRegex);
        const proposalMatch = pathname.match(proposalRegex);
        const issueMatch = pathname.match(issueRegex);
        const circleMatch = pathname.match(circleRegex);

        if (postMatch) {
            const [, handle, postId] = postMatch;
            const circle = await getCircleByHandle(handle);
            if (!circle) return { error: "Circle not found" };
            const authorized = await isAuthorized(userDid, circle._id.toString(), features.feed.view);
            if (!authorized) return { error: "Unauthorized" };
            const post = await getPost(postId); // Assuming getPost fetches PostDisplay or similar
            if (!post) return { error: "Post not found" };
            // Ensure getPost returns PostDisplay or adapt as needed
            // This might require a new function like getPostDisplay(postId, userDid)
            // For now, assuming getPost is sufficient and we manually add author etc. if needed
            const author = await getUserByDid(post.createdBy);
            const feed = await getFeed(post.feedId);
            const postDisplay: PostDisplay = {
                ...post,
                author: author!, // Assuming author is found
                circleType: "post",
                circle: circle,
                feed: feed!, // Assuming feed is found
            };
            return { type: "post", data: postDisplay };
        } else if (proposalMatch) {
            const [, handle, proposalId] = proposalMatch;
            const circle = await getCircleByHandle(handle);
            if (!circle) return { error: "Circle not found" };
            // Assuming proposals module has a 'view' feature
            const authorized = await isAuthorized(
                userDid,
                circle._id.toString(),
                features.proposals.view, // Use correct feature path
            );
            if (!authorized) return { error: "Unauthorized" };
            const proposal = await getProposalById(proposalId); // Correct function call
            if (!proposal) return { error: "Proposal not found" };
            // Add author/circle if getProposalById doesn't return ProposalDisplay (it should based on the file content)
            // if (!proposal.author) proposal.author = (await getUserByDid(proposal.createdBy))!; // Likely not needed anymore
            if (!proposal.circle) proposal.circle = circle;
            return { type: "proposal", data: proposal };
        } else if (issueMatch) {
            const [, handle, issueId] = issueMatch;
            const circle = await getCircleByHandle(handle);
            if (!circle) return { error: "Circle not found" };
            // Assuming issues module has a 'view' feature
            const authorized = await isAuthorized(
                userDid,
                circle._id.toString(),
                features.issues.view, // Use correct feature path
            );
            if (!authorized) return { error: "Unauthorized" };
            const issue = await getIssueById(issueId); // Correct function call
            if (!issue) return { error: "Issue not found" };
            // Add author/assignee/circle if getIssueById doesn't return IssueDisplay (it should based on the file content)
            // if (!issue.author) issue.author = (await getUserByDid(issue.createdBy))!; // Likely not needed anymore
            // if (issue.assignedTo && !issue.assignee) issue.assignee = await getUserByDid(issue.assignedTo); // Likely not needed anymore
            if (!issue.circle) issue.circle = circle;
            return { type: "issue", data: issue };
        } else if (circleMatch) {
            const [, handle] = circleMatch;
            const circle = await getCircleByHandle(handle);
            if (!circle) return { error: "Circle not found" };
            // Basic authorization check for viewing a circle profile
            const authorized = await isAuthorized(userDid, circle._id.toString(), features.communities.view); // Corrected feature path
            if (!authorized && !circle.isPublic) return { error: "Unauthorized" }; // Allow public circles
            return { type: "circle", data: circle };
        } else {
            return { error: "Invalid internal link" };
        }
    } catch (error: any) {
        console.error("Error fetching internal link preview data:", url, error);
        return { error: "Failed to fetch preview data" };
    }
}
// --- End Internal Link Preview Action ---

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

    const authorized = await isAuthorized(userDid, circleId, features.feed.view);
    if (!authorized) {
        redirect("/unauthorized");
    }

    // get posts for feed
    const posts = await getPostsWithMetrics(feedId, userDid, limit, skip, sortingOptions);
    return posts;
}

export async function createPostAction(
    formData: FormData,
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

        // --- Add Link Preview Data Extraction ---
        const linkPreviewUrl = formData.get("linkPreviewUrl") as string | undefined;
        const linkPreviewTitle = formData.get("linkPreviewTitle") as string | undefined;
        const linkPreviewDescription = formData.get("linkPreviewDescription") as string | undefined;
        const linkPreviewImageUrl = formData.get("linkPreviewImageUrl") as string | undefined;
        // --- End Link Preview Data Extraction ---
        // +++ Internal Link Preview Data Extraction +++
        const internalPreviewType = formData.get("internalPreviewType") as
            | "circle"
            | "post"
            | "proposal"
            | "issue"
            | "task" // Added task type
            | undefined;
        const internalPreviewId = formData.get("internalPreviewId") as string | undefined;
        const internalPreviewUrl = formData.get("internalPreviewUrl") as string | undefined;
        // +++ End Internal Link Preview Data Extraction +++

        // Get the default feed for this circle
        let feed = await getFeedByHandle(circleId, "default"); // Changed to let

        if (!feed) {
            // Create a default feed if it doesn't exist
            console.log(`Default feed not found for circle ${circleId}, creating one.`);
            feed = await createDefaultFeed(circleId);
            if (!feed) {
                return { success: false, message: "Failed to create default feed for this circle" };
            }
        }

        console.log("Creating post in feed", feed._id, "for circle", circleId, "by user", userDid);

        const feedId = feed._id.toString();
        const authorized = await isAuthorized(userDid, circleId, features.feed.post);
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
            // --- Add Link Preview Fields ---
            linkPreviewUrl: linkPreviewUrl || undefined,
            linkPreviewTitle: linkPreviewTitle || undefined,
            linkPreviewDescription: linkPreviewDescription || undefined,
            linkPreviewImage: linkPreviewImageUrl ? { url: linkPreviewImageUrl } : undefined,
            // --- End Link Preview Fields ---
            // +++ Add Internal Link Preview Fields +++
            internalPreviewType: internalPreviewType || undefined,
            internalPreviewId: internalPreviewId || undefined,
            internalPreviewUrl: internalPreviewUrl || undefined,
            // +++ End Internal Link Preview Fields +++
        };

        // console.log("creating post", JSON.stringify(post.location)); // Reduced logging
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
        revalidatePath(`${circlePath}feed`);

        // Ensure 'feed' module is enabled if posting to user's own circle
        try {
            const targetCircle = await getCircleById(circleId);
            if (targetCircle && targetCircle.circleType === "user" && targetCircle.did === userDid) {
                await ensureModuleIsEnabledOnCircle(circleId, "feed", userDid);
            }
        } catch (moduleEnableError) {
            console.error("Failed to ensure feed module is enabled on user circle:", moduleEnableError);
            // Non-critical, so don't fail the post creation
        }

        return { success: true, message: "Post created successfully", post: newPost };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to create post." };
    }
}

export async function updatePostAction(
    formData: FormData,
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

        // --- Add Link Preview Data Extraction ---
        const linkPreviewUrl = formData.get("linkPreviewUrl") as string | undefined;
        const linkPreviewTitle = formData.get("linkPreviewTitle") as string | undefined;
        const linkPreviewDescription = formData.get("linkPreviewDescription") as string | undefined;
        const linkPreviewImageUrl = formData.get("linkPreviewImageUrl") as string | undefined;
        // --- End Link Preview Data Extraction ---
        // +++ Internal Link Preview Data Extraction +++
        const internalPreviewType = formData.get("internalPreviewType") as
            | "circle"
            | "post"
            | "proposal"
            | "issue"
            | "task" // Added task type
            | undefined;
        const internalPreviewId = formData.get("internalPreviewId") as string | undefined;
        const internalPreviewUrl = formData.get("internalPreviewUrl") as string | undefined;
        // +++ End Internal Link Preview Data Extraction +++

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
            // --- Add Link Preview Fields ---
            linkPreviewUrl: linkPreviewUrl || undefined,
            linkPreviewTitle: linkPreviewTitle || undefined,
            linkPreviewDescription: linkPreviewDescription || undefined,
            linkPreviewImage: linkPreviewImageUrl ? { url: linkPreviewImageUrl } : undefined,
            // --- End Link Preview Fields ---
            // +++ Add Internal Link Preview Fields +++
            internalPreviewType: internalPreviewType || undefined,
            internalPreviewId: internalPreviewId || undefined,
            internalPreviewUrl: internalPreviewUrl || undefined,
            // +++ End Internal Link Preview Fields +++
        };

        // console.log("Updating post", JSON.stringify(updatedPost.location)); // Reduced logging
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
        revalidatePath(`${circlePath}feed`);

        return { success: true, message: "Post updated successfully" };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to update post." };
    }
}

export async function deletePostAction(postId: string): Promise<{ success: boolean; message?: string }> {
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
            canModerate = await isAuthorized(userDid, feed.circleId, features.feed.moderate);
        }

        // check if user can moderate feed or is creator of the post
        if (post.createdBy !== userDid && !canModerate) {
            return { success: false, message: "You are not authorized to delete this post" };
        }

        // delete post
        await deletePost(postId);

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

        const authorized = await isAuthorized(userDid, feed.circleId, features.feed.comment);
        if (!authorized) {
            console.log("🐞 [ACTION] User not authorized:", { userDid });
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

        const authorized = await isAuthorized(userDid, feed.circleId, features.feed.view);
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

        const canModerate = await isAuthorized(userDid, feed.circleId, features.feed.moderate);

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
            let canReact = await isAuthorized(userDid, feed.circleId, features.feed.view);
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
        const authorized = await isAuthorized(userDid, feed.circleId, features.feed.view);
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
        const authorized = await isAuthorized(userDid, circleId, features.feed.view);
        if (!authorized) return null;

        return feed;
    } catch (error) {
        console.error("Error getting feed by handle:", error);
        return null;
    }
}

export async function getPublicUserFeedAction(userDid: string): Promise<Feed | null> {
    try {
        const feed = await getPublicUserFeed(userDid);
        return feed;
    } catch (error) {
        console.error("Error in getPublicUserFeedAction:", error);
        return null;
    }
}
