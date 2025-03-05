// src/lib/data/notifications.ts - Functions to send and group notifications
import { Circle, Comment, Post, NotificationType } from "@/models/models";
import { sendNotifications } from "./matrix";
import { getUser } from "./user";
import { getFeed, getPost } from "./feed";
import { getCircleById } from "./circle";

/**
 * Send a notification when someone comments on a user's post
 */
export async function notifyPostComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    console.log("🔔 [NOTIFY] notifyPostComment called:", {
        postId: post._id,
        commentId: comment._id,
        postAuthorDid: post.createdBy,
        commenterDid: comment.createdBy,
        commenterName: commenter?.name
    });

    // Don't notify if commenter is the post author
    if (post.createdBy === comment.createdBy) {
        console.log("🔔 [NOTIFY] Skipping notification - commenter is post author");
        return;
    }

    try {
        // Get post author
        console.log("🔔 [NOTIFY] Getting post author:", post.createdBy);
        const postAuthor = await getUser(post.createdBy);
        
        if (!postAuthor) {
            console.log("🔔 [NOTIFY] Post author not found, skipping notification");
            return;
        }
        console.log("🔔 [NOTIFY] Post author found:", { 
            name: postAuthor.name, 
            notificationsRoomId: postAuthor.matrixNotificationsRoomId ? 'exists' : 'missing' 
        });

        // Get post circle
        console.log("🔔 [NOTIFY] Getting feed:", post.feedId);
        let feed = await getFeed(post.feedId);
        if (!feed) {
            console.log("🔔 [NOTIFY] Feed not found, skipping notification");
            return;
        }
        
        console.log("🔔 [NOTIFY] Getting circle:", feed.circleId);
        let circle = await getCircleById(feed.circleId!);
        if (!circle) {
            console.log("🔔 [NOTIFY] Circle not found, using default values");
            circle = { name: "Unknown Circle" } as Circle;
        }

        // Send notification
        console.log("🔔 [NOTIFY] Sending post_comment notification to:", postAuthor.name);
        await sendNotifications("post_comment", [postAuthor], {
            circle,
            user: commenter,
            post,
            comment,
            postId: post._id?.toString(),
        });
        console.log("🔔 [NOTIFY] Notification sent successfully");
    } catch (error) {
        console.error("🔔 [NOTIFY] Error sending post comment notification:", error);
    }
}

/**
 * Send a notification when someone replies to a user's comment
 */
export async function notifyCommentReply(
    post: Post,
    parentComment: Comment,
    reply: Comment,
    replier: Circle,
): Promise<void> {
    // Don't notify if replier is the comment author
    if (parentComment.createdBy === reply.createdBy) return;

    // Get parent comment author
    const commentAuthor = await getUser(parentComment.createdBy);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    await sendNotifications("comment_reply", [commentAuthor], {
        circle,
        user: replier,
        post,
        comment: reply,
        postId: post._id?.toString(),
        commentId: parentComment._id?.toString(),
    });
}

/**
 * Send a notification when someone likes/reacts to a user's post
 */
export async function notifyPostLike(postId: string, reactor: Circle, reactionType: string = "like"): Promise<void> {
    // Get post
    const post = await getPost(postId);
    if (!post) return;

    // Don't notify if reactor is the post author
    if (post.createdBy === reactor.did) return;

    // Get post author
    const postAuthor = await getUser(post.createdBy);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    await sendNotifications("post_like", [postAuthor], {
        circle,
        user: reactor,
        post,
        reaction: reactionType,
        postId: post._id?.toString(),
    });
}

/**
 * Send a notification when someone likes/reacts to a user's comment
 */
export async function notifyCommentLike(
    comment: Comment,
    post: Post,
    reactor: Circle,
    reactionType: string = "like",
): Promise<void> {
    // Don't notify if reactor is the comment author
    if (comment.createdBy === reactor.did) return;

    // Get comment author
    const commentAuthor = await getUser(comment.createdBy);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    await sendNotifications("comment_like", [commentAuthor], {
        circle,
        user: reactor,
        post,
        comment,
        reaction: reactionType,
        postId: post._id?.toString(),
        commentId: comment._id?.toString(),
    });
}

/**
 * Send notifications when someone is mentioned in a post
 */
export async function notifyPostMentions(post: Post, author: Circle, mentionedCircles: Circle[]): Promise<void> {
    // Filter out self-mentions
    const mentionedUsers = mentionedCircles.filter((circle) => circle.did && circle.did !== author.did);

    if (mentionedUsers.length === 0) return;

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notifications to all mentioned users
    await sendNotifications("post_mention", mentionedUsers, {
        circle,
        user: author,
        post,
        postId: post._id?.toString(),
    });
}

/**
 * Send notifications when someone is mentioned in a comment
 */
export async function notifyCommentMentions(
    comment: Comment,
    post: Post,
    author: Circle,
    mentionedCircles: Circle[],
): Promise<void> {
    // Filter out self-mentions
    const mentionedUsers = mentionedCircles.filter((circle) => circle.did && circle.did !== author.did);

    if (mentionedUsers.length === 0) return;

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notifications to all mentioned users
    await sendNotifications("comment_mention", mentionedUsers, {
        circle,
        user: author,
        post,
        comment,
        postId: post._id?.toString(),
        commentId: comment._id?.toString(),
    });
}
