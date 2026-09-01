"use server";

import {
    createDiscussion,
    getDiscussionWithComments,
    addCommentToDiscussion,
    pinDiscussion,
    closeDiscussion,
} from "@/lib/data/discussion";
import { Post, PostDisplay, Comment } from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getUserByDid } from "@/lib/data/user";
import { canInteract, getInteractionRequiredMessage } from "@/lib/auth/verification";
import { createDefaultFeed, getFeedByHandle } from "@/lib/data/feed";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import {
    canPerformCanonicalDiscussionAction,
    listReadableDiscussions,
    resolveReadablePostContext,
} from "@/lib/data/post-access-policy";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";
import { sanitizePostNestedContent } from "@/lib/data/post-nested-content-policy";
import { sanitizeCommentMentions } from "@/lib/data/comment-mention-policy";
import {
    addReadableAlternateDiscussionComment,
    getReadableAlternateDiscussion,
} from "@/lib/data/discussion-alternate-policy";
import { orchestrateAlternateDiscussionCreate } from "@/lib/data/post-write-policy";
import { orchestrateDiscussionModeration } from "@/lib/data/discussion-moderation-access-policy";

/**
 * Create a new discussion in a circle
 */
export async function createDiscussionAction(handle: string, data: Partial<Post> | FormData) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const user = await getUserByDid(userDid);
    if (!user) throw new Error("User not found");
    if (!canInteract(user)) {
        throw new Error(getInteractionRequiredMessage("create discussions"));
    }

    let rawPayload: Partial<Post> = {};
    if (data instanceof FormData) {
        rawPayload.title = data.get("title") as string;
        rawPayload.content = data.get("content") as string;
        const loc = data.get("location") as string | null;
        if (loc) {
            try {
                rawPayload.location = JSON.parse(loc);
            } catch {
                rawPayload.location = undefined;
            }
        }
    } else {
        rawPayload = data;
    }

    const result = await orchestrateAlternateDiscussionCreate({
        raw: rawPayload,
        writerDid: userDid,
        resolveTarget: () => getCircleByHandle(handle),
        canReadTarget: (circle) => canReadCircle(userDid, circle),
        authorizeFeature: (circle) => isAuthorized(userDid, circle._id as string, features.feed.post),
        upload: async (authored) => {
            if (data instanceof FormData) {
                const mediaFiles = data.getAll("media") as File[];
                if (mediaFiles && mediaFiles.length > 0) {
                    authored.media = [];
                    for (const file of mediaFiles) {
                        if (file instanceof File) {
                            const arrayBuffer = await file.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            const filename = `${Date.now()}-${file.name}`;
                            const fs = await import("fs");
                            const path = await import("path");
                            const uploadDir = path.join(process.cwd(), "public", "uploads");
                            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                            fs.writeFileSync(path.join(uploadDir, filename), buffer);
                            (authored.media as any[]).push(`/uploads/${filename}`);
                        }
                    }
                }
            }
        },
        resolveDestination: async (circle) => {
            let feed = await getFeedByHandle(circle._id.toString(), "default");
            if (!feed) feed = await createDefaultFeed(circle._id.toString());
            if (!feed?._id) return null;
            return { feedId: feed._id.toString(), circleId: circle._id.toString() };
        },
        persistAndPublishVector: createDiscussion,
    });
    if (!result.ok) throw new Error(result.error);
    const discussion = result.value;
    const [sanitizedDiscussion] = await sanitizePostNestedContent([discussion as PostDisplay], userDid);
    return sanitizedDiscussion;
}

/**
 * List discussions for a circle
 */
export async function listDiscussionsAction(handle: string) {
    const viewerDid = await resolveAuthenticatedViewerDid(getAuthenticatedUserDid);
    const discussions = await listReadableDiscussions(handle, viewerDid);
    return sanitizePostNestedContent(discussions as PostDisplay[], viewerDid);
}

/**
 * Get a discussion with comments
 */
export async function getDiscussionAction(id: string) {
    const viewerDid = await resolveAuthenticatedViewerDid(getAuthenticatedUserDid);
    return getReadableAlternateDiscussion(id, viewerDid, {
        resolveContext: resolveReadablePostContext,
        loadDiscussion: getDiscussionWithComments,
        sanitizeComments: sanitizeCommentMentions,
        sanitizePost: sanitizePostNestedContent,
    });
}

/**
 * Add a comment to a discussion
 */
export async function addCommentAction(
    discussionId: string,
    data: { content: string; parentCommentId?: string | null },
) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const user = await getUserByDid(userDid);
    if (!user) throw new Error("User not found");

    return addReadableAlternateDiscussionComment(discussionId, data, userDid, {
        resolveContext: resolveReadablePostContext,
        authorizeComment: (context, viewerDid) =>
            canPerformCanonicalDiscussionAction(
                { ...context.post, feed: context.feed },
                viewerDid,
                features.feed.comment,
            ),
        addComment: addCommentToDiscussion,
        sanitizeComments: sanitizeCommentMentions,
    });
}

/**
 * Pin a discussion (admin only)
 */
export async function pinDiscussionAction(id: string, pinned: boolean) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const result = await orchestrateDiscussionModeration({
        postId: id,
        actorDid: userDid,
        persist: (normalizedPostId) => pinDiscussion(normalizedPostId, pinned),
    });
    if (!result.ok) throw new Error(result.message);
    return result.value;
}

/**
 * Close a discussion (admin only)
 */
export async function closeDiscussionAction(id: string) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const result = await orchestrateDiscussionModeration({
        postId: id,
        actorDid: userDid,
        persist: (normalizedPostId) => closeDiscussion(normalizedPostId),
    });
    if (!result.ok) throw new Error(result.message);
    return result.value;
}
