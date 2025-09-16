"use server";

import {
    createDiscussion,
    listDiscussionsByCircle,
    getDiscussionWithComments,
    addCommentToDiscussion,
    pinDiscussion,
    closeDiscussion,
} from "@/lib/data/discussion";
import { Post, Comment } from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getUserByDid } from "@/lib/data/user";

/**
 * Create a new discussion in a circle
 */
export async function createDiscussionAction(handle: string, data: Partial<Post>) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const user = await getUserByDid(userDid);
    if (!user) throw new Error("User not found");

    const circle = await getCircleByHandle(handle);
    if (!circle) throw new Error("Circle not found");

    // For now, allow creation if user is authorized for posts in feeds (reuse feed.post permission)
    const canCreate = await isAuthorized(userDid, circle._id as string, features.feed.post);
    if (!canCreate) throw new Error("Not authorized to create discussions");

    return createDiscussion({
        ...data,
        feedId: circle._id.toString(), // reuse circleId as feedId for now
        createdBy: userDid,
    });
}

/**
 * List discussions for a circle
 */
export async function listDiscussionsAction(handle: string) {
    const circle = await getCircleByHandle(handle);
    if (!circle) throw new Error("Circle not found");

    return listDiscussionsByCircle(circle._id.toString());
}

/**
 * Get a discussion with comments
 */
export async function getDiscussionAction(id: string) {
    return getDiscussionWithComments(id);
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
    if (!discussion) throw new Error("Discussion not found");

    const canComment = await isAuthorized(userDid, discussion.feedId, features.feed.comment);
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
    if (!discussion) throw new Error("Discussion not found");

    const canModerate = await isAuthorized(userDid, discussion.feedId, features.feed.moderate);
    if (!canModerate) throw new Error("Not authorized to pin discussions");

    return pinDiscussion(id, pinned);
}

/**
 * Close a discussion (admin only)
 */
export async function closeDiscussionAction(id: string) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const discussion = await getDiscussionWithComments(id);
    if (!discussion) throw new Error("Discussion not found");

    const canModerate = await isAuthorized(userDid, discussion.feedId, features.feed.moderate);
    if (!canModerate) throw new Error("Not authorized to close discussions");

    return closeDiscussion(id);
}
