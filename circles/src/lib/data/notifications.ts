// src/lib/data/notifications.ts - Functions to send and group notifications
import { Circle, Comment, Post, NotificationType } from "@/models/models";
import { sendNotifications } from "./matrix";
import { getUser, getUserPrivate } from "./user";
import { getFeed, getPost } from "./feed";
import { getCircleById, findProjectByShadowPostId, getCirclesByDids } from "./circle";
import { getMembers } from "./member";

/**
 * Checks if a post is a shadow post for a project and returns the project if it is
 * @param post The post to check
 * @returns The project circle if the post is a shadow post, or null if not
 */
export async function getProjectForShadowPost(post: Post): Promise<Circle | null> {
    if (!post || !post._id) return null;

    // Fast check using the postType field
    if (post.postType !== "project") {
        return null;
    }

    try {
        console.log("🔍 [NOTIFY] Post is a project shadow post, fetching project:", {
            postId: post._id.toString(),
        });

        // Since we know it's a project post, find the associated project
        const projectCircle = await findProjectByShadowPostId(post._id.toString());

        console.log("🔔 [NOTIFY] getProjectForShadowPost results:", {
            postId: post._id.toString(),
            foundProject: projectCircle ? "Yes" : "No",
            projectId: projectCircle?._id,
            projectName: projectCircle?.name,
        });

        return projectCircle;
    } catch (error) {
        console.error("Error fetching project for shadow post:", error);
        return null;
    }
}

/**
 * Send a notification when someone comments on a user's post or project
 */
export async function notifyPostComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    console.log("🔔 [NOTIFY] notifyPostComment called:", {
        postId: post._id,
        commentId: comment._id,
        postAuthorDid: post.createdBy,
        commenterDid: comment.createdBy,
        commenterName: commenter?.name,
        postType: post.postType || "post"
    });

    try {
        // Check if this is a shadow post for a project
        const isProjectComment = post.postType === "project";
        
        if (isProjectComment) {
            // For project comments, notify all project followers
            await notifyProjectComment(post, comment, commenter);
        } else {
            // For regular posts, only notify the post author
            await notifyRegularPostComment(post, comment, commenter);
        }
        
        console.log("🔔 [NOTIFY] Notification sent successfully");
    } catch (error) {
        console.error("🔔 [NOTIFY] Error sending post comment notification:", error);
        // We don't re-throw the error because notification failures shouldn't break comment creation
    }
}

/**
 * Notifies project followers when someone comments on a project
 */
async function notifyProjectComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    // If it's a project post, get the project details
    const project = await findProjectByShadowPostId(post._id!.toString());
    if (!project) {
        console.log("🔔 [NOTIFY] Project not found for shadow post, skipping notification");
        return;
    }
    
    console.log("🔔 [NOTIFY] Project info:", {
        projectId: project._id,
        projectName: project.name,
    });

    // Get post circle (parent circle)
    let feed = await getFeed(post.feedId);
    if (!feed) {
        console.log("🔔 [NOTIFY] Feed not found, skipping notification");
        return;
    }

    let circle = await getCircleById(feed.circleId!);
    if (!circle) {
        console.log("🔔 [NOTIFY] Circle not found, using default values");
        circle = { name: "Unknown Circle" } as Circle;
    }
    
    // Get all project followers
    const members = await getMembers(project._id!);
    console.log(`🔔 [NOTIFY] Found ${members.length} project followers to notify`);
    
    if (members.length === 0) {
        console.log("🔔 [NOTIFY] No followers to notify");
        return;
    }
    
    // Filter out the commenter to avoid self-notification
    const otherMemberIds = members
        .filter(member => member.userDid !== comment.createdBy)
        .map(member => member.userDid);
    
    if (otherMemberIds.length === 0) {
        console.log("🔔 [NOTIFY] Only the commenter follows this project, no notifications needed");
        return;
    }
    
    // Get the actual user objects for followers
    const recipients = await getCirclesByDids(otherMemberIds);
    
    console.log(`🔔 [NOTIFY] Sending project_comment notification to ${recipients.length} followers`);
    
    // Send notification to all followers (except commenter)
    await sendNotifications("project_comment", recipients, {
        circle,
        user: commenter,
        post,
        comment,
        postId: post._id?.toString(),
        project: project,
        projectId: project._id?.toString(),
    });
}

/**
 * Notifies the post author when someone comments on their post
 */
async function notifyRegularPostComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    // Don't notify if commenter is the post author
    if (post.createdBy === comment.createdBy) {
        console.log("🔔 [NOTIFY] Skipping notification - commenter is post author");
        return;
    }

    // Get post author with more detailed error handling
    console.log("🔔 [NOTIFY] Getting post author:", post.createdBy);
    const postAuthor = await getUser(post.createdBy);
    if (!postAuthor) {
        console.log("🔔 [NOTIFY] Post author not found, skipping notification");
        return;
    }

    const postAuthorPrivate = await getUserPrivate(postAuthor.did!);
    console.log("🔔 [NOTIFY] Post author found:", {
        name: postAuthor.name,
        did: postAuthor.did,
        notificationsRoomId: postAuthorPrivate.matrixNotificationsRoomId ? "exists" : "missing",
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
    await sendNotifications("post_comment", [postAuthorPrivate], {
        circle,
        user: commenter,
        post,
        comment,
        postId: post._id?.toString(),
    });
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
    // Check if this is a shadow post for a project using the postType field
    const isProjectComment = post.postType === "project";
    
    if (isProjectComment) {
        // For project comments, notify all project followers
        await notifyProjectCommentReply(post, parentComment, reply, replier);
    } else {
        // For regular comments, only notify the comment author
        await notifyRegularCommentReply(post, parentComment, reply, replier);
    }
}

/**
 * Notifies all project followers when someone replies to a comment on a project
 */
async function notifyProjectCommentReply(
    post: Post,
    parentComment: Comment,
    reply: Comment, 
    replier: Circle
): Promise<void> {
    // Get the project details
    const project = await findProjectByShadowPostId(post._id!.toString());
    if (!project) {
        console.log("🔔 [NOTIFY] Project not found for shadow post, skipping notification");
        return;
    }
    
    console.log("🔔 [NOTIFY] Project comment reply info:", {
        projectId: project._id,
        projectName: project.name,
        parentCommentId: parentComment._id,
        replyId: reply._id
    });

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);
    
    // Also notify the parent comment author
    let recipients: Circle[] = [];
    if (parentComment.createdBy !== reply.createdBy) {
        // Get parent comment author
        const commentAuthor = await getUser(parentComment.createdBy);
        if (commentAuthor) {
            recipients.push(commentAuthor);
        }
    }
    
    // Get all project followers
    const members = await getMembers(project._id!);
    
    // Filter out the replier and the parent comment author (already added) to avoid duplicates
    const otherMemberIds = members
        .filter(member => 
            member.userDid !== reply.createdBy && 
            member.userDid !== parentComment.createdBy)
        .map(member => member.userDid);
    
    if (otherMemberIds.length > 0) {
        // Get the actual user objects for other followers
        const otherRecipients = await getCirclesByDids(otherMemberIds);
        recipients = [...recipients, ...otherRecipients];
    }
    
    if (recipients.length === 0) {
        console.log("🔔 [NOTIFY] No recipients for project comment reply notification");
        return;
    }
    
    console.log(`🔔 [NOTIFY] Sending project_comment_reply notification to ${recipients.length} recipients`);
    
    // Send notification to all relevant recipients
    await sendNotifications("project_comment_reply", recipients, {
        circle,
        user: replier,
        post,
        comment: reply,
        postId: post._id?.toString(),
        commentId: parentComment._id?.toString(),
        project: project,
        projectId: project._id?.toString(),
    });
}

/**
 * Notifies just the comment author when someone replies to their comment
 */
async function notifyRegularCommentReply(
    post: Post,
    parentComment: Comment,
    reply: Comment,
    replier: Circle
): Promise<void> {
    // Don't notify if replier is the comment author
    if (parentComment.createdBy === reply.createdBy) return;

    // Get parent comment author
    const commentAuthor = await getUser(parentComment.createdBy);
    if (!commentAuthor) {
        console.log("🔔 [NOTIFY] Comment author not found, skipping notification");
        return;
    }
    
    const commentAuthorPrivate = await getUserPrivate(commentAuthor.did!);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    console.log("🔔 [NOTIFY] Sending comment_reply notification to:", commentAuthor.name);
    await sendNotifications("comment_reply", [commentAuthorPrivate], {
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
    const postAuthorPrivate = await getUserPrivate(postAuthor.did!);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    await sendNotifications("post_like", [postAuthorPrivate], {
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
    const commentAuthorPrivate = await getUserPrivate(commentAuthor.did!);

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notification
    await sendNotifications("comment_like", [commentAuthorPrivate], {
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

    // Check if this is a shadow post for a project using the postType field
    const isProjectComment = post.postType === "project";
    // If it's a project post, get the project details
    const project = isProjectComment ? await findProjectByShadowPostId(post._id!.toString()) : null;

    console.log("🔔 [NOTIFY] Comment mention is for project:", isProjectComment ? "Yes" : "No");
    if (isProjectComment) {
        console.log("🔔 [NOTIFY] Project info:", {
            projectId: project?._id,
            projectName: project?.name,
        });
    }

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notifications to all mentioned users
    await sendNotifications(isProjectComment ? "project_mention" : "comment_mention", mentionedUsers, {
        circle,
        user: author,
        post,
        comment,
        postId: post._id?.toString(),
        commentId: comment._id?.toString(),
        project: isProjectComment ? project! : undefined,
        projectId: isProjectComment ? project?._id?.toString() : undefined,
    });
}
