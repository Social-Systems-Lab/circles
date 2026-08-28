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
    getPosts,
    updateComment,
    deleteComment,
    extractMentions,
    getPostsWithMetrics,
    getPostsFromMultipleFeeds,
    getAccessibleFeedIdsForUser,
    getPostsFromMultipleFeedsWithMetrics,
    getPublicFeeds,
    createFeed,
    createDefaultFeed,
    getShareablePostPreview,
    getFullPost,
    getAllComments,
} from "@/lib/data/feed";
import { deleteFile, saveFile, isFile } from "@/lib/data/storage";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import {
    features,
    getFeedViewFeature,
    getPostCommentFeature,
    getPostCreateFeature,
    getPostModerateFeature,
    getPostReactionFeature,
    getPostViewFeature,
} from "@/lib/data/constants";
import { sdgs } from "@/lib/data/sdgs";
import { getProposalById } from "@/lib/data/proposal";
import { getIssueById } from "@/lib/data/issue";
import { getFundingAskById } from "@/lib/data/funding";
import {
    Media,
    ProposalDisplay,
    IssueDisplay,
    FundingAskDisplay,
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
import { getCircleById, getCirclePath, getCircleByHandle } from "@/lib/data/circle"; // Added getCircleByHandle
import { getLinkPreview } from "link-preview-js"; // Removed LinkPreview import
import { getUserByDid, getUserById, getUserPrivate, getVerificationStatus } from "@/lib/data/user";
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
import { canParticipate, getParticipationRequiredMessage } from "@/lib/profile-completion";
import { getMentionableUserIdsForUserDid, searchMentionableUsersForUserDid } from "@/lib/data/chat";
import { validateCreatePostTargetPolicy } from "@/lib/data/post-creation-policy";
import { canDeletePost, canEditOwnPost, resolvePostRevalidationRoute } from "@/lib/data/post-action-policy";
import { cleanupUploadedFiles } from "@/lib/data/post-upload-rollback";
import { getPostTitleUpdate, validatePostUpdateContent } from "@/lib/data/post-content-policy";
import type { PostUpdateResult } from "@/lib/data/post-list-state";
import { normalizePostId } from "@/lib/data/post-update-identity";
import {
    getReadablePostComments,
    resolveFeedActionViewerDid,
    resolvePublicUserFeed,
    resolveReadablePostContext,
} from "@/lib/data/post-access-policy";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { sanitizeCommentMentions } from "@/lib/data/comment-mention-policy";
import {
    resolveInternalPreviewAction,
    sanitizePostNestedContent,
    type InternalPreviewActionResult,
} from "@/lib/data/post-nested-content-policy";
import { orchestrateMainPostCreate, orchestrateMainPostUpdate } from "@/lib/data/post-write-policy";

// Global posts: posts from all public feeds
export async function getGlobalPostsAction(
    claimedUserDid: string | undefined,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
    sdgHandles?: string[],
): Promise<PostDisplay[]> {
    const userDid = await resolveFeedActionViewerDid(claimedUserDid);
    // Get all public feeds
    const publicFeeds = await getPublicFeeds(userDid);
    if (publicFeeds.length === 0) return [];

    // Map the public feeds to their IDs
    const publicFeedIds = publicFeeds.map((feed) => feed._id.toString());

    // Use your existing function to get posts across multiple feeds with metrics
    if (userDid) {
        return getPostsFromMultipleFeedsWithMetrics(publicFeedIds, userDid, limit, skip, sortingOptions, sdgHandles);
    }
    return getPostsFromMultipleFeeds(publicFeedIds, undefined, limit, skip, sortingOptions, sdgHandles);
}

export async function getAggregatePostsAction(
    claimedUserDid: string | undefined,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
    sdgHandles?: string[],
    circleHandle?: string,
    postType?: string,
): Promise<PostDisplay[]> {
    const userDid = await resolveFeedActionViewerDid(claimedUserDid);
    if (!userDid) {
        return getGlobalPostsAction(userDid, limit, skip, sortingOptions, sdgHandles);
    }

    const accessibleFeeds = await getAccessibleFeedIdsForUser(userDid, circleHandle);

    if (accessibleFeeds.length === 0) {
        return [];
    }

    // Get posts from all accessible feeds
    const posts = await getPostsFromMultipleFeedsWithMetrics(
        accessibleFeeds,
        userDid,
        limit,
        skip,
        sortingOptions,
        sdgHandles,
        postType,
    );
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

const mentionPermissionErrorMessage = "You can only mention people you can message.";

const validateMentionPermissions = async (userDid: string, mentions?: Array<{ id: string }>): Promise<void> => {
    if (!mentions?.length) {
        return;
    }

    const mentionableUserIds = await getMentionableUserIdsForUserDid(userDid);
    const hasBlockedMention = mentions.some((mention) => !mentionableUserIds.has(mention.id));
    if (hasBlockedMention) {
        throw new Error(mentionPermissionErrorMessage);
    }
};

const isPostModuleEnabled = async (post: Post, feed: Feed): Promise<boolean> => {
    if (post.postType === "community") {
        const circle = await getCircleById(feed.circleId);
        return !!circle?.enabledModules?.includes("community");
    }
    if (post.postType === "discussion") {
        const circle = await getCircleById(feed.circleId);
        return !!circle?.enabledModules?.includes("discussions");
    }
    if (!getPostViewFeature(post.postType)) {
        return false;
    }
    return true;
};

const getPostAndFeedForContent = async (
    contentId: string,
    contentType: "post" | "comment",
): Promise<{ post: Post; feed: Feed; comment: Comment | null } | null> => {
    let postId = contentId;
    let comment: Comment | null = null;
    if (contentType === "comment") {
        comment = await getComment(contentId);
        if (!comment) {
            return null;
        }
        postId = comment.postId;
    }

    const post = await getPost(postId);
    if (!post) {
        return null;
    }

    const feed = await getFeed(post.feedId);
    if (!feed || !(await isPostModuleEnabled(post, feed))) {
        return null;
    }

    return { post, feed, comment };
};

const canViewPostForAction = async (post: Post, feed: Feed, userDid?: string): Promise<boolean> => {
    const viewFeature = getPostViewFeature(post.postType);
    if (!viewFeature) {
        return false;
    }

    return isAuthorized(userDid, feed.circleId, viewFeature);
};

const canReactToPostForAction = async (post: Post, feed: Feed, userDid?: string): Promise<boolean> => {
    const reactionFeature = getPostReactionFeature(post.postType);
    if (!reactionFeature) {
        return false;
    }

    return isAuthorized(userDid, feed.circleId, reactionFeature);
};

const getCommunityParticipationDeniedMessage = async (
    userDid: string,
    postType: Post["postType"] | undefined,
    action: string,
): Promise<string | null> => {
    if (postType !== "community") {
        return null;
    }

    const user = await getUserPrivate(userDid);
    return canParticipate(user) ? null : getParticipationRequiredMessage(action, user);
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
                "User-Agent": "KamooniBot/1.0 (+https://kamooni.org/bot)", // Identify the bot
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

export type InternalLinkPreviewResult = InternalPreviewActionResult;

export async function getInternalLinkPreviewData(url: string): Promise<InternalLinkPreviewResult> {
    return resolveInternalPreviewAction(url, { getViewerDid: getAuthenticatedUserDid });
}
// --- End Internal Link Preview Action ---

export async function getPostsAction(
    feedId: string,
    circleId: string,
    limit: number,
    skip: number,
    sortingOptions?: SortingOptions,
    sdgHandles?: string[],
    postType?: Post["postType"],
): Promise<PostDisplay[]> {
    const userDid = await resolveFeedActionViewerDid();
    const feed = await getFeed(feedId);
    if (!feed) {
        redirect("/not-found");
    }

    if (feed.circleId !== circleId) {
        redirect("/not-found");
    }

    const circle = await getCircleById(circleId);
    if (!circle || !(await canReadCircle(userDid, circle))) {
        redirect("/not-found");
    }

    if (feed.handle === "community") {
        if (!circle?.enabledModules?.includes("community")) {
            redirect("/not-found");
        }
    }

    const feedViewFeature = getFeedViewFeature(feed.handle);
    if (!feedViewFeature) {
        redirect("/not-found");
    }

    const authorized = await isAuthorized(userDid, circleId, feedViewFeature);
    if (!authorized) {
        redirect("/unauthorized");
    }

    // get posts for feed
    const posts = await getPostsWithMetrics(feedId, userDid, limit, skip, sortingOptions, sdgHandles, postType);
    return posts;
}

export async function createPostAction(
    formData: FormData,
): Promise<{ success: boolean; message?: string; post?: Post }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to create a post" };
    }
    const currentUser = await getUserPrivate(userDid);
    if (!canParticipate(currentUser)) {
        return { success: false, message: getParticipationRequiredMessage("create posts", currentUser) };
    }

    try {
        const content = formData.get("content") as string;
        const title = (formData.get("title") as string) || "";
        const circleId = formData.get("circleId") as string;
        const requestedFeedId = (formData.get("feedId") as string) || undefined;
        const sharedPostId = (formData.get("sharedPostId") as string) || undefined;
        const locationStr = formData.get("location") as string;
        const postType = (formData.get("postType") as string) || undefined;
        const location = locationStr ? JSON.parse(locationStr) : undefined;
        const isCommunityPost = postType === "community";
        const images = formData.getAll("media") as File[];
        const validImageCount = images.filter((image) => isFile(image)).length;

        // Get user groups from form data
        const userGroups = formData.getAll("userGroups") as string[];

        // Title is required for normal posts, but shares can be comment-only.
        if (!isCommunityPost && !sharedPostId && (!title || !title.trim())) {
            return { success: false, message: "Title is required" };
        }

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
        const sdgsStr = formData.get("sdgs") as string;
        const sdgs = sdgsStr ? JSON.parse(sdgsStr) : undefined;

        const targetCircle = await getCircleById(circleId);
        if (!targetCircle) {
            return { success: false, message: "Target circle not found" };
        }

        const postCreateFeature = getPostCreateFeature(postType) || features.feed.post;

        const isOwnProfileFeed = targetCircle.circleType === "user" && targetCircle._id === currentUser._id;
        if (!isCommunityPost && targetCircle.circleType === "user" && !isOwnProfileFeed) {
            return { success: false, message: "You are not authorized to create posts on this profile" };
        }

        const requestedFeed = requestedFeedId ? await getFeed(requestedFeedId) : null;
        const targetPolicyPostType =
            postType === "post" || postType === "community" || postType === "discussion" ? postType : undefined;
        const targetPolicy = validateCreatePostTargetPolicy({
            postType: targetPolicyPostType,
            circleId,
            enabledModules: targetCircle.enabledModules,
            requestedFeed,
            content,
            mediaCount: validImageCount,
        });
        let targetAuthorizationFailure: string | undefined;
        let feed: Feed | null = null;
        let post: Post;
        const savedCommunityFiles: Array<{ url: string }> = [];
        const result = await orchestrateMainPostCreate({
            postType,
            content,
            writerDid: userDid,
            authorizeTarget: async () => {
                if (!targetPolicy.ok) {
                    targetAuthorizationFailure = targetPolicy.message;
                    return false;
                }
                const authorized =
                    !isCommunityPost && isOwnProfileFeed
                        ? true
                        : await isAuthorized(userDid, circleId, postCreateFeature);
                if (!authorized) targetAuthorizationFailure = "You are not authorized to create posts here";
                return authorized;
            },
            validateShare: sharedPostId
                ? async () => Boolean(await getShareablePostPreview(sharedPostId, userDid))
                : undefined,
            buildDocument: async (canonicalWrite) => {
                if (isCommunityPost) {
                    feed = requestedFeed;
                } else {
                    feed = await getFeedByHandle(circleId, "default");
                }
                if (!feed && !isCommunityPost) {
                    console.log(`Default feed not found for circle ${circleId}, creating one.`);
                    feed = await createDefaultFeed(circleId);
                    if (!feed) throw new Error("Failed to create default feed for this circle");
                }
                if (!feed) throw new Error("Feed not found");

                console.log("Creating post in feed", feed._id, "for circle", circleId, "by user", userDid);
                post = {
                    title: title.trim() || undefined,
                    content: canonicalWrite.content,
                    feedId: feed._id.toString(),
                    createdBy: userDid,
                    createdAt: new Date(),
                    reactions: {},
                    comments: 0,
                    location,
                    sharedPostId,
                    userGroups: userGroups.length > 0 ? userGroups : ["everyone"],
                    linkPreviewUrl: linkPreviewUrl || undefined,
                    linkPreviewTitle: linkPreviewTitle || undefined,
                    linkPreviewDescription: linkPreviewDescription || undefined,
                    linkPreviewImage: linkPreviewImageUrl ? { url: linkPreviewImageUrl } : undefined,
                    internalPreviewType: internalPreviewType || undefined,
                    internalPreviewId: internalPreviewId || undefined,
                    internalPreviewUrl: internalPreviewUrl || undefined,
                    sdgs: sdgs || undefined,
                };
                if (postType) post.postType = postType as Post["postType"];
                await postSchema.parseAsync(post);
                return post;
            },
            persistAndPublishVector: (document) => createPost(document),
            upload: async (createdPost) => {
                try {
                    const savedMedia: Media[] = [];
                    let imageIndex = 0;
                    for (const image of images) {
                        if (isFile(image)) {
                            const savedImage = await saveFile(
                                image,
                                `feeds/${feed!._id}/${createdPost._id}/post-image-${imageIndex}`,
                                circleId,
                                true,
                            );
                            savedMedia.push({ name: image.name, type: image.type, fileInfo: savedImage });
                            if (isCommunityPost) {
                                savedCommunityFiles.push({ url: savedImage.url });
                            }
                        }
                        ++imageIndex;
                    }

                    if (savedMedia.length > 0) {
                        createdPost.media = savedMedia;
                        await updatePost(createdPost);
                    }
                } catch (error) {
                    if (isCommunityPost) {
                        console.error("Failed to save Community post images", error);
                        const cleanupResult = await cleanupUploadedFiles(savedCommunityFiles, deleteFile);
                        for (const cleanupFailure of cleanupResult.failedDeletes) {
                            console.error("Failed to clean up Community post image after rollback", {
                                postId: createdPost._id,
                                url: cleanupFailure.url,
                                error: cleanupFailure.error,
                            });
                        }
                        try {
                            await deletePost(createdPost._id);
                        } catch (rollbackError) {
                            console.error("Failed to roll back Community post after image upload failure", {
                                postId: createdPost._id,
                                error: rollbackError,
                            });
                        }
                        throw new Error("Failed to save Community post images");
                    }
                    console.log("Failed to save post media", error);
                }
            },
            notify: async (createdPost, mentions) => {
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
                            await notifyPostMentions(createdPost, user, validMentionedCircles);
                        }
                    }
                } catch (notificationError) {
                    console.error("Failed to send mention notifications:", notificationError);
                }
            },
        });
        if (!result.ok) {
            const message =
                result.reason === "target"
                    ? targetAuthorizationFailure || "You are not authorized to create posts here"
                    : result.error;
            return { success: false, message };
        }
        const newPost = result.value;

        const circle = await getCircleById(feed!.circleId);
        if (circle) {
            const circlePath = await getCirclePath(circle);
            const revalidationRoute = resolvePostRevalidationRoute(circlePath, post!.postType);
            if (revalidationRoute) {
                revalidatePath(revalidationRoute);
            }
        }

        // Ensure 'feed' module is enabled if posting to user's own circle
        try {
            if (isOwnProfileFeed) {
                await ensureModuleIsEnabledOnCircle(circleId, "feed", userDid);
            }
        } catch (moduleEnableError) {
            console.error("Failed to ensure feed module is enabled on user circle:", moduleEnableError);
            // Non-critical, so don't fail the post creation
        }

        const [sanitizedPost] = await sanitizePostNestedContent(
            [
                {
                    ...newPost,
                    author: currentUser,
                    circle: targetCircle,
                    feed: feed!,
                    circleType: "post",
                } as PostDisplay,
            ],
            userDid,
        );
        return { success: true, message: "Post created successfully", post: sanitizedPost as unknown as Post };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to create post." };
    }
}

export async function updatePostAction(
    formData: FormData,
): Promise<PostUpdateResult> {
    const userDid = await getAuthenticatedUserDid();

    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit a post" };
    }

    try {
        const postId = normalizePostId(formData.get("postId"));
        if (!postId) {
            return { success: false, message: "Post not found" };
        }
        const content = formData.get("content") as string;
        const title = formData.get("title") as string | null;
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
        const sdgsStr = formData.get("sdgs") as string;
        const sdgs = sdgsStr ? JSON.parse(sdgsStr) : undefined;

        const post = await getPost(postId);
        if (!post) {
            return { success: false, message: "Post not found" };
        }
        const feed = await getFeed(post.feedId);
        if (!feed || !(await isPostModuleEnabled(post, feed)) || !getPostCreateFeature(post.postType)) {
            return { success: false, message: "Post not found" };
        }
        if (circleId && feed.circleId !== circleId) {
            return { success: false, message: "Post not found" };
        }

        const isCommunityPost = post.postType === "community";
        const isCreateAuthorized = isCommunityPost
            ? await isAuthorized(userDid, feed.circleId, getPostCreateFeature(post.postType)!)
            : true;
        const editAccess = canEditOwnPost({
            postType: post.postType,
            isAuthor: post.createdBy === userDid,
            isCreateAuthorized,
        });
        if (!editAccess.ok) {
            return { success: false, message: editAccess.message };
        }

        const existingMedia: Media[] = [];
        const mediaStr = formData.getAll("existingMedia") as string[];
        for (const media of mediaStr) {
            existingMedia.push(JSON.parse(media));
        }
        const images = formData.getAll("media") as File[];
        const validImageCount = images.filter((image) => isFile(image)).length;
        const contentPolicy = validatePostUpdateContent({
            postType: post.postType,
            title,
            existingTitle: post.title,
            content,
            mediaCount: existingMedia.length + validImageCount,
        });
        if (!contentPolicy.ok) {
            return { success: false, message: contentPolicy.message };
        }

        const baseUpdate: Partial<Post> = {
            _id: postId,
            ...getPostTitleUpdate(post.postType, title),
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
            sdgs: sdgs || undefined,
        };
        const writeResult = await orchestrateMainPostUpdate({
            content,
            storedContent: post.content,
            storedMentions: post.mentions || [],
            writerDid: userDid,
            baseUpdate,
            upload: async () => {
                const newMedia: Media[] = [];
                let imageIndex = existingMedia.length;
                for (const image of images) {
                    if (isFile(image)) {
                        const savedImage = await saveFile(
                            image,
                            `feeds/${post.feedId}/${postId}/post-image-${imageIndex}`,
                            feed.circleId,
                            true,
                        );
                        newMedia.push({ name: image.name, type: image.type, fileInfo: savedImage });
                        imageIndex++;
                    }
                }
                return [...existingMedia, ...newMedia];
            },
            applyUpload: (document, media) => {
                document.media = media;
            },
            persistAndPublishVector: async (document) => updatePost(document),
            notify: async (_value, updatedPost, mentions) => {
                try {
                    if (mentions.length > 0) {
                        const user = await getUserByDid(userDid);
                        const previousMentions = post.mentions?.map((mention) => mention.id) || [];
                        const newMentions = mentions.filter((mention) => !previousMentions.includes(mention.id));
                        if (newMentions.length > 0) {
                            const mentionedCircles = await Promise.all(
                                newMentions.map(async (mention) => await getCircleById(mention.id)),
                            );
                            const validMentionedCircles = mentionedCircles.filter((circle) => circle !== null);
                            if (validMentionedCircles.length > 0) {
                                await notifyPostMentions({ ...post, ...updatedPost }, user, validMentionedCircles);
                            }
                        }
                    }
                } catch (notificationError) {
                    console.error("Failed to send mention notifications:", notificationError);
                }
            },
        });
        if (!writeResult.ok) {
            return { success: false, message: writeResult.error };
        }

        const circle = await getCircleById(feed.circleId);
        if (circle) {
            const circlePath = await getCirclePath(circle);
            const revalidationRoute = resolvePostRevalidationRoute(circlePath, post.postType);
            if (revalidationRoute) {
                revalidatePath(revalidationRoute);
            }
        }

        const updatedPostDisplay = await getFullPost(postId, userDid);
        if (!updatedPostDisplay) {
            throw new Error("Failed to load updated post");
        }

        return { success: true, message: "Post updated successfully", post: updatedPostDisplay };
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
        if (!feed) {
            return { success: false, message: "Noticeboard not found" };
        }
        if (!(await isPostModuleEnabled(post, feed))) {
            return { success: false, message: "Post not found" };
        }

        const createFeature = getPostCreateFeature(post.postType);
        const moderateFeature = getPostModerateFeature(post.postType);
        if (!createFeature || !moderateFeature) {
            return { success: false, message: "Post not found" };
        }

        const isCommunityPost = post.postType === "community";
        const isCreateAuthorized = isCommunityPost ? await isAuthorized(userDid, feed.circleId, createFeature) : true;
        const isModerateAuthorized =
            post.createdBy === userDid ? false : await isAuthorized(userDid, feed.circleId, moderateFeature);

        const deleteAccess = canDeletePost({
            postType: post.postType,
            isAuthor: post.createdBy === userDid,
            isCreateAuthorized,
            isModerateAuthorized,
        });
        if (!deleteAccess.ok) {
            return { success: false, message: deleteAccess.message };
        }

        await deletePost(postId);

        const circle = await getCircleById(feed.circleId);
        if (circle) {
            const circlePath = await getCirclePath(circle);
            const revalidationRoute = resolvePostRevalidationRoute(circlePath, post.postType);
            if (revalidationRoute) {
                revalidatePath(revalidationRoute);
            }
        }
        revalidatePath("/explore");

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
        if (!(await isPostModuleEnabled(post, feed))) {
            return { success: false, message: "Post not found" };
        }

        const commentFeature = getPostCommentFeature(post.postType);
        if (!commentFeature) {
            return { success: false, message: "Post not found" };
        }

        const authorized = await isAuthorized(userDid, feed.circleId, commentFeature);
        if (!authorized) {
            const participationMessage = await getCommunityParticipationDeniedMessage(userDid, post.postType, "comment");
            if (participationMessage) {
                return { success: false, message: participationMessage };
            }
            console.log("🐞 [ACTION] User not authorized:", { userDid });
            return { success: false, message: "You are not authorized to comment on the noticeboard" };
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
        await validateMentionPermissions(userDid, mentions);
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

        const [sanitizedComment] = await sanitizeCommentMentions([comment], userDid);
        return { success: true, message: "Comment created successfully", comment: sanitizedComment };
    } catch (error) {
        console.error("🐞 [ACTION] Unhandled error in createCommentAction:", error);
        return { success: false, message: error instanceof Error ? error.message : "Failed to create comment." };
    }
}

export async function getAllCommentsAction(
    postId: string,
): Promise<{ success: boolean; comments?: CommentDisplay[]; message?: string }> {
    const userDid = await resolveFeedActionViewerDid();
    return getReadablePostComments(postId, userDid);
}

export async function editCommentAction(
    commentId: string,
    updatedContent: string,
): Promise<{ success: boolean; message?: string; comment?: CommentDisplay }> {
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

        const context = await getPostAndFeedForContent(commentId, "comment");
        const commentFeature = context ? getPostCommentFeature(context.post.postType) : null;
        if (!context || !commentFeature) {
            return { success: false, message: "Comment not found" };
        }

        const authorized = await isAuthorized(userDid, context.feed.circleId, commentFeature);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit this comment" };
        }

        const updatedMentions = extractMentions(updatedContent);
        await validateMentionPermissions(userDid, updatedMentions);
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

        const updatedComments = await getAllComments(comment.postId, userDid);
        const updatedComment = updatedComments.find((candidate) => candidate._id === commentId);
        if (!updatedComment) {
            return { success: false, message: "Comment not found" };
        }
        const [sanitizedComment] = await sanitizeCommentMentions([updatedComment], userDid);
        return { success: true, message: "Comment edited successfully", comment: sanitizedComment };
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
            return { success: false, message: "Noticeboard not found" };
        }
        if (!(await isPostModuleEnabled(post, feed))) {
            return { success: false, message: "Post not found" };
        }

        const commentFeature = getPostCommentFeature(post.postType);
        const moderateFeature = getPostModerateFeature(post.postType);
        if (!commentFeature || !moderateFeature) {
            return { success: false, message: "Post not found" };
        }

        const canDeleteOwn =
            comment.createdBy === userDid && (await isAuthorized(userDid, feed.circleId, commentFeature));
        const canModerate = await isAuthorized(userDid, feed.circleId, moderateFeature);

        if (!canDeleteOwn && !canModerate) {
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
        if (!feed || !(await isPostModuleEnabled(post, feed))) {
            return { success: false, message: "Post not found" };
        }

        const canReact = await canReactToPostForAction(post, feed, userDid);
        if (!canReact) {
            const participationMessage = await getCommunityParticipationDeniedMessage(userDid, post.postType, "react");
            if (participationMessage) {
                return { success: false, message: participationMessage };
            }
            return { success: false, message: "You are not authorized to like content on the noticeboard" };
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
        const context = await getPostAndFeedForContent(contentId, contentType);
        if (!context) {
            return { success: false, message: "Content not found" };
        }

        const canReact = await canReactToPostForAction(context.post, context.feed, userDid);
        if (!canReact) {
            const participationMessage = await getCommunityParticipationDeniedMessage(
                userDid,
                context.post.postType,
                "react",
            );
            if (participationMessage) {
                return { success: false, message: participationMessage };
            }
            return { success: false, message: "You are not authorized to unlike content on the noticeboard" };
        }

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
        const userDid = await getAuthenticatedUserDid();
        const context = await getPostAndFeedForContent(contentId, contentType);
        if (!context) {
            return { success: false, message: "Content not found" };
        }

        const authorized = await canViewPostForAction(context.post, context.feed, userDid);
        if (!authorized) {
            return { success: false, message: "You are not authorized to view reactions" };
        }

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
        const context = await getPostAndFeedForContent(contentId, contentType);
        if (!context) {
            return { success: false, message: "Content not found" };
        }

        const authorized = await canViewPostForAction(context.post, context.feed, userDid);
        if (!authorized) {
            return { success: false, message: "You are not authorized to view reactions" };
        }

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
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: true, circles: [] };
        }

        const circles = await searchMentionableUsersForUserDid(userDid, decodeURIComponent(query), 10);
        return { success: true, circles };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Failed to search circles." };
    }
}

/**
 * Get a post by ID
 */
export async function getPostAction(postId: string): Promise<Post | null> {
    const userDid = await resolveFeedActionViewerDid();

    try {
        const context = await resolveReadablePostContext(postId, userDid);
        if (!context) return null;
        const author = await getUserByDid(context.post.createdBy);
        if (!author) return null;
        const [sanitizedPost] = await sanitizePostNestedContent(
            [
                {
                    ...context.post,
                    author,
                    circle: context.circle,
                    feed: context.feed,
                    circleType: "post",
                } as PostDisplay,
            ],
            userDid,
        );
        return sanitizedPost as unknown as Post;
    } catch (error) {
        console.error("Error getting post:", error);
        return null;
    }
}

/**
 * Get a feed by handle and circle ID
 */
export async function getFeedByHandleAction(circleId: string, feedHandle: string): Promise<Feed | null> {
    const userDid = await resolveFeedActionViewerDid();

    try {
        const feed = await getFeedByHandle(circleId, feedHandle);
        if (!feed) return null;

        const circle = await getCircleById(circleId);
        if (!circle || !(await canReadCircle(userDid, circle))) return null;

        if (feed.handle === "community") {
            if (!circle?.enabledModules?.includes("community")) return null;
        }

        // Check if user has permission to view the feed
        const feedViewFeature = getFeedViewFeature(feed.handle);
        if (!feedViewFeature) return null;

        const authorized = await isAuthorized(userDid, circleId, feedViewFeature);
        if (!authorized) return null;

        return feed;
    } catch (error) {
        console.error("Error getting feed by handle:", error);
        return null;
    }
}

export async function getPublicUserFeedAction(targetDid: string): Promise<Feed | null> {
    const viewerDid = await resolveFeedActionViewerDid();
    return resolvePublicUserFeed(targetDid, viewerDid);
}

export async function getVerificationStatusAction(): Promise<"verified" | "pending" | "unverified"> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        // Return "unverified" for guests or unauthenticated users
        return "unverified";
    }
    // getVerificationStatus is already available from user.ts and handles the logic
    return await getVerificationStatus(userDid);
}
