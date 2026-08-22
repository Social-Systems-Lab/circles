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
import { extractMentions } from "@/lib/data/feed";
import { getMentionableUserIdsForUserDid } from "@/lib/data/chat";
import { createDefaultFeed, getFeedByHandle } from "@/lib/data/feed";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import {
    canPerformCanonicalDiscussionAction,
    listReadableDiscussions,
    resolveReadablePostContext,
} from "@/lib/data/post-access-policy";
import { resolveAuthenticatedViewerDid } from "@/lib/auth/authenticated-viewer";
import { sanitizePostNestedContent } from "@/lib/data/post-nested-content-policy";

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

    const circle = await getCircleByHandle(handle);
    if (!circle) throw new Error("Circle not found");
    if (!(await canReadCircle(userDid, circle))) throw new Error("Circle not found");

    // For now, allow creation if user is authorized for posts in feeds (reuse feed.post permission)
    const canCreate = await isAuthorized(userDid, circle._id as string, features.feed.post);
    if (!canCreate) throw new Error("Not authorized to create forum posts");

    let payload: any = {};
    if (data instanceof FormData) {
        payload.title = data.get("title") as string;
        payload.content = data.get("content") as string;
        const loc = data.get("location") as string | null;
        if (loc) {
            try {
                payload.location = JSON.parse(loc);
            } catch {
                payload.location = null;
            }
        }
        const mediaFiles = data.getAll("media") as File[];
        if (mediaFiles && mediaFiles.length > 0) {
            payload.media = [];
            for (const file of mediaFiles) {
                if (file instanceof File) {
                    const arrayBuffer = await file.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    // Save file to storage (local/public/uploads or S3 depending on setup)
                    const filename = `${Date.now()}-${file.name}`;
                    const fs = await import("fs");
                    const path = await import("path");
                    const uploadDir = path.join(process.cwd(), "public", "uploads");
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    const filePath = path.join(uploadDir, filename);
                    fs.writeFileSync(filePath, buffer);
                    payload.media.push(`/uploads/${filename}`);
                }
            }
        }
    } else {
        payload = data;
    }

    // Extract mentions from content
    const mentions = payload.content ? extractMentions(payload.content) : [];
    if (mentions.length > 0) {
        const mentionableUserIds = await getMentionableUserIdsForUserDid(userDid);
        const hasBlockedMention = mentions.some((mention) => !mentionableUserIds.has(mention.id));
        if (hasBlockedMention) {
            throw new Error("You can only mention people you can message.");
        }
    }

    let feed = await getFeedByHandle(circle._id.toString(), "default");
    if (!feed) feed = await createDefaultFeed(circle._id.toString());
    if (!feed?._id) throw new Error("Circle not found");

    const discussion = await createDiscussion({
        ...payload,
        mentions,
        feedId: feed._id.toString(),
        createdBy: userDid,
        circleId: circle._id.toString(),
    });
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
    const context = await resolveReadablePostContext(id, viewerDid);
    if (!context || context.post.postType !== "discussion") return null;
    const discussion = await getDiscussionWithComments(id, context.post.feedId);
    if (!discussion) return null;
    const [sanitizedDiscussion] = await sanitizePostNestedContent([discussion as PostDisplay], viewerDid);
    return sanitizedDiscussion;
}

/**
 * Add a comment to a discussion
 */
export async function addCommentAction(discussionId: string, data: Partial<Comment>) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const user = await getUserByDid(userDid);
    if (!user) throw new Error("User not found");

    const discussion = await getDiscussionWithComments(discussionId);
    if (!discussion) throw new Error("Forum post not found");
    const canComment = await canPerformCanonicalDiscussionAction(discussion, userDid, features.feed.comment);
    if (!canComment) throw new Error("Not authorized to comment");

    return addCommentToDiscussion(discussionId, {
        ...data,
        createdBy: userDid,
    });
}

/**
 * Pin a discussion (admin only)
 */
export async function pinDiscussionAction(id: string, pinned: boolean) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const discussion = await getDiscussionWithComments(id);
    if (!discussion) throw new Error("Forum post not found");
    const canModerate = await canPerformCanonicalDiscussionAction(discussion, userDid, features.feed.moderate);
    if (!canModerate) throw new Error("Not authorized to pin forum posts");

    return pinDiscussion(id, pinned);
}

/**
 * Close a discussion (admin only)
 */
export async function closeDiscussionAction(id: string) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const discussion = await getDiscussionWithComments(id);
    if (!discussion) throw new Error("Forum post not found");
    const canModerate = await canPerformCanonicalDiscussionAction(discussion, userDid, features.feed.moderate);
    if (!canModerate) throw new Error("Not authorized to close forum posts");

    return closeDiscussion(id);
}
