// \feeds\actions.ts - server actions for feed related operations
"use server";

import {
    createPost,
    createComment,
    incrementCommentReplies,
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
    getPostsWithMetrics,
    getPostsFromMultipleFeeds,
    getAccessibleFeedIdsForUser,
    getPostsFromMultipleFeedsWithMetrics,
    getPublicFeeds,
    createFeed,
    createDefaultFeed,
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
import { searchMentionableUsersForUserDid } from "@/lib/data/chat";
import { validateCreatePostTargetPolicy } from "@/lib/data/post-creation-policy";
import { canDeletePost, canEditOwnPost, resolvePostRevalidationRoute } from "@/lib/data/post-action-policy";
import { cleanupUploadedFiles } from "@/lib/data/post-upload-rollback";
import { validatePostUpdateContent } from "@/lib/data/post-content-policy";
import type { PostUpdateResult } from "@/lib/data/post-list-state";
import { normalizePostId } from "@/lib/data/post-update-identity";
import {
    getReadablePostComments,
    POST_UNAVAILABLE_MESSAGE,
    resolveFeedActionViewerDid,
    resolvePublicUserFeed,
    resolveReadablePostContext,
} from "@/lib/data/post-access-policy";
import { orchestrateOrdinaryPostEdit } from "@/lib/data/post-mutation-access-policy";
import { orchestrateOrdinaryPostDelete } from "@/lib/data/post-delete-access-policy";
import { orchestratePostReaction } from "@/lib/data/post-reaction-access-policy";
import { orchestrateCommentReaction } from "@/lib/data/comment-reaction-access-policy";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { sanitizeCommentMentions } from "@/lib/data/comment-mention-policy";
import {
    resolveInternalPreviewAction,
    getShareablePostPreview,
    sanitizePostNestedContent,
    type InternalPreviewActionResult,
} from "@/lib/data/post-nested-content-policy";
import {
    buildMainPostUpdateBaseDocument,
    orchestrateMainPostCreate,
    orchestrateMainPostUpdate,
} from "@/lib/data/post-write-policy";
import { resolveSharedOriginalForWrite } from "@/lib/data/shared-original-write-policy";
import {
    resolveInternalPreviewForWrite,
    resolveInternalPreviewUpdateForWrite,
} from "@/lib/data/internal-preview-write-policy";
import { orchestrateAuthoredCommentCreate, prepareAuthoredComment } from "@/lib/data/comment-write-policy";
import {
    COMMENT_CREATE_UNAVAILABLE_MESSAGE,
    orchestrateCommentCreate,
    type CommentCreateContext,
} from "@/lib/data/comment-create-access-policy";
import { addCommentToDiscussion } from "@/lib/data/discussion";
import {
    addEventCommentWithDependencies,
    assertEventHostCirclesWritable,
} from "@/lib/data/event-alternate-comment-policy";
import { createCommentForAuthorizedPost } from "@/lib/data/discussion-comment-create";
import { Comments } from "@/lib/data/db";
import { toCommentDeleteActionSuccess, toCommentDto } from "@/lib/data/comment-dto";
import { getEventById } from "@/lib/data/event";
import { canonicalizeCircleMentionsForWrite } from "@/lib/data/circle-mention-write-policy";
import { COMMENT_EDIT_UNAVAILABLE_MESSAGE, orchestrateCommentEdit } from "@/lib/data/comment-edit-access-policy";
import {
    COMMENT_DELETE_UNAVAILABLE_MESSAGE,
    mongoCommentDeletePersistence,
    orchestrateCommentDelete,
    type CommentDeleteDisposition,
} from "@/lib/data/comment-delete-access-policy";
import { canReadEventOwners } from "@/lib/data/post-source-access-policy";

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
            | "task"
            | "event"
            | "goal"
            | "funding"
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
            resolveShare: sharedPostId
                ? () => resolveSharedOriginalForWrite(sharedPostId, userDid, getShareablePostPreview)
                : undefined,
            resolvePreview: () =>
                resolveInternalPreviewForWrite(
                    { type: internalPreviewType, id: internalPreviewId, url: internalPreviewUrl },
                    userDid,
                ),
            buildDocument: async (canonicalWrite, canonicalPreview, canonicalSharedPostId) => {
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
                    sharedPostId: canonicalSharedPostId,
                    userGroups: userGroups.length > 0 ? userGroups : ["everyone"],
                    linkPreviewUrl: linkPreviewUrl || undefined,
                    linkPreviewTitle: linkPreviewTitle || undefined,
                    linkPreviewDescription: linkPreviewDescription || undefined,
                    linkPreviewImage: linkPreviewImageUrl ? { url: linkPreviewImageUrl } : undefined,
                    ...(canonicalPreview || {}),
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

export async function updatePostAction(formData: FormData): Promise<PostUpdateResult> {
    const userDid = await getAuthenticatedUserDid();

    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit a post" };
    }

    try {
        const submittedPostId = normalizePostId(formData.get("postId"));
        if (!submittedPostId) {
            return { success: false, message: POST_UNAVAILABLE_MESSAGE };
        }
        const content = formData.get("content") as string;
        const title = formData.get("title") as string | null;
        const circleId = formData.get("circleId") as string;
        // +++ Internal Link Preview Data Extraction +++
        const internalPreviewType = formData.get("internalPreviewType") as
            | "circle"
            | "post"
            | "proposal"
            | "issue"
            | "task"
            | "event"
            | "goal"
            | "funding"
            | undefined;
        const internalPreviewId = formData.get("internalPreviewId") as string | undefined;
        const internalPreviewUrl = formData.get("internalPreviewUrl") as string | undefined;
        const internalPreviewRequestPresence = {
            type: formData.has("internalPreviewType"),
            id: formData.has("internalPreviewId"),
            url: formData.has("internalPreviewUrl"),
        };
        // +++ End Internal Link Preview Data Extraction +++
        const editResult = await orchestrateOrdinaryPostEdit({
            postId: submittedPostId,
            actorDid: userDid,
            submittedCircleId: circleId,
            authorize: async ({ post, feed }) => {
                if (!(await isPostModuleEnabled(post, feed)) || !getPostCreateFeature(post.postType)) {
                    return { ok: false, message: POST_UNAVAILABLE_MESSAGE };
                }
                const isCommunityPost = post.postType === "community";
                const isCreateAuthorized = isCommunityPost
                    ? await isAuthorized(userDid, feed.circleId, getPostCreateFeature(post.postType)!)
                    : true;
                return canEditOwnPost({
                    postType: post.postType,
                    isAuthor: post.createdBy === userDid,
                    isCreateAuthorized,
                });
            },
            execute: async ({ post, feed, normalizedPostId: postId }) => {
                const existingMedia: Media[] = [];
                const mediaStr = formData.getAll("existingMedia") as string[];
                for (const media of mediaStr) existingMedia.push(JSON.parse(media));
                const images = formData.getAll("media") as File[];
                const validImageCount = images.filter((image) => isFile(image)).length;
                const contentPolicy = validatePostUpdateContent({
                    postType: post.postType,
                    title,
                    existingTitle: post.title,
                    content,
                    mediaCount: existingMedia.length + validImageCount,
                });
                if (!contentPolicy.ok) return { success: false as const, message: contentPolicy.message };

                const baseUpdate = buildMainPostUpdateBaseDocument(formData, { _id: postId, postType: post.postType });
                const writeResult = await orchestrateMainPostUpdate({
                    content,
                    storedContent: post.content,
                    storedMentions: post.mentions || [],
                    writerDid: userDid,
                    baseUpdate,
                    resolvePreview: () =>
                        resolveInternalPreviewUpdateForWrite({
                            request: { type: internalPreviewType, id: internalPreviewId, url: internalPreviewUrl },
                            presence: internalPreviewRequestPresence,
                            stored: {
                                internalPreviewType: post.internalPreviewType,
                                internalPreviewId: post.internalPreviewId,
                                internalPreviewUrl: post.internalPreviewUrl,
                            },
                            writerDid: userDid,
                        }),
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
                                const newMentions = mentions.filter(
                                    (mention) => !previousMentions.includes(mention.id),
                                );
                                if (newMentions.length > 0) {
                                    const mentionedCircles = await Promise.all(
                                        newMentions.map(async (mention) => await getCircleById(mention.id)),
                                    );
                                    const validMentionedCircles = mentionedCircles.filter((circle) => circle !== null);
                                    if (validMentionedCircles.length > 0) {
                                        await notifyPostMentions(
                                            { ...post, ...updatedPost },
                                            user,
                                            validMentionedCircles,
                                        );
                                    }
                                }
                            }
                        } catch (notificationError) {
                            console.error("Failed to send mention notifications:", notificationError);
                        }
                    },
                });
                return writeResult.ok
                    ? { success: true as const, post, feed, postId }
                    : { success: false as const, message: writeResult.error };
            },
        });
        if (!editResult.ok) return { success: false, message: editResult.message };
        if (!editResult.value.success) return editResult.value;
        const { post, feed, postId } = editResult.value;

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
        const result = await orchestrateOrdinaryPostDelete({
            postId,
            actorDid: userDid,
            authorize: async ({ post, feed }) => {
                if (!(await isPostModuleEnabled(post, feed))) return { ok: false };
                const createFeature = getPostCreateFeature(post.postType);
                const moderateFeature = getPostModerateFeature(post.postType);
                if (!createFeature || !moderateFeature) return { ok: false };
                const isCommunityPost = post.postType === "community";
                const isCreateAuthorized = isCommunityPost
                    ? await isAuthorized(userDid, feed.circleId, createFeature)
                    : true;
                const isModerateAuthorized =
                    post.createdBy === userDid ? false : await isAuthorized(userDid, feed.circleId, moderateFeature);
                return canDeletePost({
                    postType: post.postType,
                    isAuthor: post.createdBy === userDid,
                    isCreateAuthorized,
                    isModerateAuthorized,
                });
            },
            executeDelete: async ({ normalizedPostId }) => deletePost(normalizedPostId),
            revalidate: async ({ post, circle }) => {
                const circlePath = await getCirclePath(circle);
                const revalidationRoute = resolvePostRevalidationRoute(circlePath, post.postType);
                if (revalidationRoute) revalidatePath(revalidationRoute);
                revalidatePath("/explore");
            },
        });
        if (!result.ok) return { success: false, message: result.message };

        return { success: true, message: "Post deleted successfully" };
    } catch {
        return { success: false, message: POST_UNAVAILABLE_MESSAGE };
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
        const user = await getUserByDid(userDid);
        if (!user) return { success: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE };

        const executeGeneric = async (context: CommentCreateContext) => {
            let validatedParent: Comment | null = null;
            const { inserted } = await orchestrateAuthoredCommentCreate({
                postId: context.normalizedPostId,
                parentCommentId,
                content,
                writerDid: userDid,
                dependencies: {
                    findParentComment: async (id) => {
                        validatedParent = await getComment(id.toString());
                        return validatedParent;
                    },
                    insert: async (prepared, targetPostId) => {
                        const comment: Comment = {
                            postId: targetPostId,
                            parentCommentId: prepared.parentCommentId,
                            content: prepared.content,
                            mentions: prepared.mentions,
                            createdBy: userDid,
                            createdAt: new Date(),
                            reactions: {},
                            replies: 0,
                        };
                        await commentSchema.parseAsync(comment);
                        return createComment(comment);
                    },
                    incrementParentReplies: incrementCommentReplies,
                    notify: async (created, prepared) => {
                        try {
                            if (!prepared.parentCommentId) await notifyPostComment(context.post, created, user);
                            else if (validatedParent)
                                await notifyCommentReply(context.post, validatedParent, created, user);
                            if (prepared.mentions.length) {
                                const circles = (
                                    await Promise.all(prepared.mentions.map(({ id }) => getCircleById(id)))
                                ).filter((circle): circle is Circle => circle !== null);
                                if (circles.length) await notifyCommentMentions(created, context.post, user, circles);
                            }
                        } catch (notificationError) {
                            console.error("🐞 [ACTION] Failed to send notifications:", notificationError);
                        }
                    },
                },
            });
            return { ...inserted, author: user } as CommentDisplay;
        };

        const result = await orchestrateCommentCreate({
            postId,
            actorDid: userDid,
            executeGeneric,
            executeDiscussion: async (context) =>
                (await addCommentToDiscussion(context.normalizedPostId, {
                    content,
                    parentCommentId,
                    createdBy: userDid,
                })) as CommentDisplay,
            executeEvent: async (context, event) =>
                addEventCommentWithDependencies(String(event._id), { content, parentCommentId }, userDid, {
                    findEvent: getEventById,
                    resolvePost: resolveReadablePostContext,
                    assertHostsWritable: assertEventHostCirclesWritable,
                    authorizeComment: (did, circleId) => isAuthorized(did, circleId, features.feed.comment),
                    createComment: createCommentForAuthorizedPost,
                    createDependencies: {
                        insertComment: (comment) => Comments.insertOne(comment),
                        incrementParentReplies: async (id) => {
                            await Comments.updateOne({ _id: id }, { $inc: { replies: 1 } });
                        },
                        now: () => new Date(),
                    },
                    prepareComment: prepareAuthoredComment,
                    findParentComment: async (id) => Comments.findOne({ _id: id }, { projection: { postId: 1 } }),
                    toCommentDto,
                    sanitizeComments: sanitizeCommentMentions,
                }),
        });
        if (!result.ok) return { success: false, message: result.message };
        const [sanitizedComment] = await sanitizeCommentMentions([result.value], userDid);
        return { success: true, message: "Comment created successfully", comment: sanitizedComment };
    } catch (error) {
        console.error("🐞 [ACTION] Unhandled error in createCommentAction:", error);
        return { success: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE };
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
        const result = await orchestrateCommentEdit({
            commentId,
            actorDid: userDid,
            content: updatedContent,
            authorizationDependencies: {
                authorizeFeature: (did, circleId, feature) => isAuthorized(did, circleId, feature),
                findCurrentEvent: getEventById,
                canReadCurrentEventHosts: canReadEventOwners,
                assertEventHostsWritable: assertEventHostCirclesWritable,
            },
            canonicalize: canonicalizeCircleMentionsForWrite,
            update: async (context, canonicalContent, mentions) => {
                await updateComment(context.normalizedCommentId, canonicalContent, mentions);
                return { ...context.comment, content: canonicalContent, mentions, editedAt: new Date() };
            },
            notify: async (updatedComment, context, mentions) => {
                try {
                    const previous = new Set(context.comment.mentions?.map(({ id }) => id) ?? []);
                    const newMentions = mentions.filter(({ id }) => !previous.has(id));
                    if (!newMentions.length) return;
                    const user = await getUserByDid(userDid);
                    if (!user) return;
                    const circles = (await Promise.all(newMentions.map(({ id }) => getCircleById(id)))).filter(
                        (circle): circle is Circle => circle !== null,
                    );
                    if (circles.length) await notifyCommentMentions(updatedComment, context.post, user, circles);
                } catch (notificationError) {
                    console.error("Failed to send mention notifications:", notificationError);
                }
            },
        });
        if (!result.ok) return { success: false, message: result.message };

        const updatedComments = await getAllComments(result.context.normalizedPostId, userDid);
        const updatedComment = updatedComments.find(
            (candidate) => candidate._id === result.context.normalizedCommentId,
        );
        if (!updatedComment) {
            return { success: false, message: COMMENT_EDIT_UNAVAILABLE_MESSAGE };
        }
        const [sanitizedComment] = await sanitizeCommentMentions([updatedComment], userDid);
        return { success: true, message: "Comment edited successfully", comment: sanitizedComment };
    } catch (error) {
        return { success: false, message: COMMENT_EDIT_UNAVAILABLE_MESSAGE };
    }
}

export async function deleteCommentAction(commentId: string): Promise<{
    success: boolean;
    message?: string;
    disposition?: CommentDeleteDisposition;
    comment?: CommentDisplay;
}> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to delete a comment" };
    }

    try {
        const result = await orchestrateCommentDelete({
            commentId,
            actorDid: userDid,
            authorizationDependencies: {
                authorizeFeature: (did, circleId, feature) => isAuthorized(did, circleId, feature),
                findCurrentEvent: getEventById,
                canReadCurrentEventHosts: canReadEventOwners,
                assertEventHostsWritable: assertEventHostCirclesWritable,
            },
            persistence: mongoCommentDeletePersistence,
        });
        if (!result.ok) return { success: false, message: result.message };
        if (result.disposition === "hard-delete") {
            return { success: true, message: "Comment deleted successfully", disposition: result.disposition };
        }
        const payload = toCommentDeleteActionSuccess(result.disposition, result.comment!);
        return { ...payload, comment: payload.comment as unknown as CommentDisplay };
    } catch (error) {
        return { success: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE };
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
        if (contentType === "post") {
            const result = await orchestratePostReaction({
                postId: contentId,
                actorDid: userDid,
                mutate: (context) => likeContent(context.normalizedPostId, "post", userDid, reactionType),
                afterMutation: async (context) => {
                    try {
                        const reactor = await getUserByDid(userDid);
                        await notifyPostLike(context.normalizedPostId, reactor, reactionType);
                    } catch (notificationError) {
                        console.error("Failed to send like notification:", notificationError);
                    }
                },
            });
            if (!result.ok) return { success: false, message: result.message };
            return { success: true, message: "Content liked successfully" };
        }

        const result = await orchestrateCommentReaction({
            commentId: contentId,
            actorDid: userDid,
            mutate: (context) => likeContent(context.normalizedCommentId, "comment", userDid, reactionType),
            afterMutation: async (context) => {
                try {
                    const reactor = await getUserByDid(userDid);
                    await notifyCommentLike(context.comment, context.post, reactor, reactionType);
                } catch (notificationError) {
                    console.error("Failed to send like notification:", notificationError);
                }
            },
        });
        if (!result.ok) return { success: false, message: result.message };
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
        if (contentType === "post") {
            const result = await orchestratePostReaction({
                postId: contentId,
                actorDid: userDid,
                mutate: (context) => unlikeContent(context.normalizedPostId, "post", userDid, reactionType),
            });
            if (!result.ok) return { success: false, message: result.message };
            return { success: true, message: "Content unliked successfully" };
        }

        const result = await orchestrateCommentReaction({
            commentId: contentId,
            actorDid: userDid,
            mutate: (context) => unlikeContent(context.normalizedCommentId, "comment", userDid, reactionType),
        });
        if (!result.ok) return { success: false, message: result.message };
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
