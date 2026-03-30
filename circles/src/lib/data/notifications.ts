// src/lib/data/notifications.ts - Functions to send and group notifications
import {
    Circle,
    Comment,
    Post,
    NotificationType,
    SummaryNotificationType,
    summaryNotificationTypeDetails,
    Proposal,
    ProposalDisplay,
    ProposalStage,
    ProposalOutcome,
    UserPrivate,
    IssueDisplay,
    IssueStage,
    TaskDisplay,
    TaskStage,
    GoalDisplay,
    GoalStage,
    Event,
} from "@/models/models";
import { DefaultNotificationSettings, Notifications, UserNotificationSettings } from "./db";
import { sanitizeObjectForJSON } from "../utils/sanitize";
import { getUser, getUserPrivate } from "./user";
import { getFeed, getPost } from "./feed";
import { getCircleById, findProjectByShadowPostId, getCirclesByDids } from "./circle";
import { getMembers } from "./member";
import { getProposalById, getProposalReactions } from "./proposal"; // Use getProposalReactions
import { getIssueById } from "./issue"; // Import getIssueById
import { getTaskById } from "./task"; // Import getTaskById
import { getGoalById } from "./goal"; // Import getGoalById
import { getEventById } from "./event";
import { features } from "./constants";
import { getAuthorizedMembers } from "../auth/auth"; // Import the function to get authorized members

Notifications?.createIndex({ userId: 1, isRead: 1, createdAt: -1 });
Notifications?.createIndex({ userId: 1, type: 1, "content.roomId": 1, isRead: 1, createdAt: -1 });

const getSummaryNotificationType = (type: string): SummaryNotificationType | null => {
    const directMatch = Object.keys(summaryNotificationTypeDetails).find((summaryType) => summaryType === type);
    if (directMatch) {
        return directMatch as SummaryNotificationType;
    }

    const summaryMatch = Object.entries(summaryNotificationTypeDetails).find(([, detail]) =>
        detail.mapsTo?.includes(type as NotificationType),
    );
    return summaryMatch ? (summaryMatch[0] as SummaryNotificationType) : null;
};

const getNotificationPreferenceContext = (
    type: string,
    payload: any,
    recipientDid: string,
): { entityType: "CIRCLE" | "USER"; entityId: string; summaryType: SummaryNotificationType } | null => {
    const summaryType = getSummaryNotificationType(type);
    if (!summaryType) {
        return null;
    }

    if (summaryType === "ACCOUNT_ALL") {
        return { entityType: "USER", entityId: recipientDid, summaryType };
    }

    const circleId =
        payload?.circle?._id?.toString?.() ||
        payload?.circle?._id ||
        payload?.project?._id?.toString?.() ||
        payload?.project?._id;

    if (!circleId) {
        return null;
    }

    return { entityType: "CIRCLE", entityId: String(circleId), summaryType };
};

const buildNotificationBody = (type: string, payload: any): string => {
    const actorName = payload?.user?.name || payload?.author?.name || "Someone";
    const circleName = payload?.circle?.name || payload?.project?.name || "a circle";
    const proposalName = payload?.proposalName || payload?.proposal?.name || "a proposal";
    const issueTitle = payload?.issueTitle || payload?.issue?.title || "an issue";
    const taskTitle = payload?.taskTitle || payload?.task?.title || "a task";
    const goalTitle = payload?.goalTitle || payload?.goal?.title || "a goal";
    const eventName = payload?.eventName || payload?.eventTitle || "an event";

    switch (type) {
        case "follow_request":
            return `${actorName} requested to follow ${circleName}`;
        case "new_follower":
            return `${actorName} is now following ${circleName}`;
        case "follow_accepted":
        case "new_following":
        case "new_member":
            return `Your access to ${circleName} was approved`;
        case "post_comment":
            return `${actorName} commented on your post`;
        case "comment_reply":
            return `${actorName} replied to your comment`;
        case "post_like":
            return `${actorName} liked your post`;
        case "comment_like":
            return `${actorName} liked your comment`;
        case "post_mention":
            return `${actorName} mentioned you in a post`;
        case "comment_mention":
            return `${actorName} mentioned you in a comment`;
        case "proposal_submitted_for_review":
            return `${actorName} submitted ${proposalName} for review`;
        case "proposal_moved_to_voting":
            return `${proposalName} moved to voting`;
        case "proposal_approved_for_voting":
            return `${proposalName} was approved for voting`;
        case "proposal_resolved":
        case "proposal_resolved_voter":
            return `${proposalName} was resolved`;
        case "proposal_vote":
            return `${actorName} voted on your proposal`;
        case "issue_submitted_for_review":
            return `${actorName} submitted ${issueTitle} for review`;
        case "issue_approved":
            return `${issueTitle} was approved`;
        case "issue_assigned":
            return `${actorName} assigned you to ${issueTitle}`;
        case "issue_status_changed":
            return `${actorName} updated ${issueTitle}`;
        case "task_submitted_for_review":
            return `${actorName} submitted ${taskTitle} for review`;
        case "task_approved":
            return `${taskTitle} was approved`;
        case "task_assigned":
            return `${actorName} assigned you to ${taskTitle}`;
        case "task_status_changed":
            return `${actorName} updated ${taskTitle}`;
        case "goal_submitted_for_review":
            return `${actorName} submitted ${goalTitle} for review`;
        case "goal_approved":
            return `${goalTitle} was approved`;
        case "goal_status_changed":
            return `${actorName} updated ${goalTitle}`;
        case "goal_completed":
            return `${goalTitle} was completed`;
        case "proposal_to_goal":
            return `${proposalName} became a goal`;
        case "event_submitted_for_review":
            return `${actorName} submitted ${eventName} for review`;
        case "event_approved":
            return `${eventName} was approved`;
        case "event_status_changed":
            return `${actorName} updated ${eventName}`;
        case "event_invitation":
            return `${actorName} invited you to ${eventName}`;
        case "ranking_stale_reminder":
            return "Your ranking needs attention";
        case "ranking_grace_period_ended":
            return "Your ranking grace period ended";
        case "user_verified":
            return "Your account has been verified";
        case "user_verification_request":
            return payload?.messageBody || `${actorName} requested account verification`;
        case "user_verification_rejected":
            return "Your account verification request was rejected";
        case "user_becomes_member":
            return "You are now a founding member";
        case "pm_received":
            if (payload?.contactType === "ask_question") {
                return `${actorName} asked for help in ${circleName}`;
            }
            if (payload?.contactType === "offer_help") {
                return `${actorName} offered help in ${circleName}`;
            }
            return `${actorName} sent you a direct message`;
        case "contact_request_received":
            return `${actorName} sent you a contact request`;
        default:
            return payload?.messageBody || "New notification";
    }
};

const isNotificationEnabledForRecipient = async (type: string, recipientDid: string, payload: any): Promise<boolean> => {
    const context = getNotificationPreferenceContext(type, payload, recipientDid);
    if (!context) {
        return true;
    }

    const userSetting = await UserNotificationSettings.findOne({
        userId: recipientDid,
        entityType: context.entityType,
        entityId: context.entityId,
        notificationType: context.summaryType,
    });
    if (typeof userSetting?.isEnabled === "boolean") {
        return userSetting.isEnabled;
    }

    const defaultSetting = await DefaultNotificationSettings.findOne({
        entityType: context.entityType,
        notificationType: context.summaryType,
    });

    return typeof defaultSetting?.defaultIsEnabled === "boolean" ? defaultSetting.defaultIsEnabled : true;
};

export async function sendNotifications(type: string, recipients: any[], payload: any) {
    const uniqueRecipients = Array.from(
        new Map(
            (recipients || [])
                .filter((recipient) => typeof recipient?.did === "string" && recipient.did.length > 0)
                .map((recipient) => [recipient.did, recipient]),
        ).values(),
    );

    if (uniqueRecipients.length === 0) {
        return;
    }

    const createdAt = new Date();
    const notificationContent = sanitizeObjectForJSON({
        ...(payload || {}),
        body: payload?.body || payload?.messageBody || buildNotificationBody(type, payload),
    });

    const docs = [];
    for (const recipient of uniqueRecipients) {
        if (!(await isNotificationEnabledForRecipient(type, recipient.did, payload))) {
            continue;
        }

        docs.push({
            userId: recipient.did,
            type,
            content: notificationContent,
            isRead: false,
            createdAt,
        });
    }

    if (!docs.length) {
        return;
    }

    await Notifications.insertMany(docs as any[]);
}

type NotificationQueryOptions = {
    excludeTypes?: string[];
};

const buildNotificationQuery = (userDid: string, options?: NotificationQueryOptions) => {
    const query: Record<string, any> = { userId: userDid };
    if (options?.excludeTypes?.length) {
        query.type = { $nin: options.excludeTypes };
    }
    return query;
};

export async function listNotificationsForUser(
    userDid: string,
    limit: number = 50,
    options?: NotificationQueryOptions,
) {
    return await Notifications.find(buildNotificationQuery(userDid, options))
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
}

export async function getUnreadNotificationCountForUser(userDid: string, options?: NotificationQueryOptions) {
    return await Notifications.countDocuments({ ...buildNotificationQuery(userDid, options), isRead: false });
}

export async function markAllNotificationsReadForUser(userDid: string) {
    return await Notifications.updateMany({ userId: userDid, isRead: false }, { $set: { isRead: true } });
}
export async function notifyNewMember(userDid: string, circle: Circle, followRequest: boolean = false): Promise<void> {
    try {
        const recipient = await getUserPrivate(userDid);
        if (!recipient) return;

        await sendNotifications(
            followRequest ? "new_following" : "new_member",
            [recipient],
            sanitizeObjectForJSON({
                circle,
                userDid,
                followRequest,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyNewMember:", error);
    }
}

export async function sendVerificationRequestNotification(user: Circle, admins: UserPrivate[]): Promise<void> {
    try {
        console.log(`🔔 [NOTIFY] Sending user_verification_request to ${admins.length} admins`);
        await sendNotifications(
            "user_verification_request",
            admins,
            sanitizeObjectForJSON({
                user,
                messageBody: `User ${user.name} (@${user.handle}) has requested account verification.`,
                url: `/admin?tab=verification-requests`,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in sendVerificationRequestNotification:", error);
    }
}

// fix
export async function sendUserVerifiedNotification(user: UserPrivate): Promise<void> {
    try {
        console.log(`🔔 [NOTIFY] Sending user_verified notification to ${user.name}`);
        await sendNotifications(
            "user_verified",
            [user],
            sanitizeObjectForJSON({
                user,
                messageBody: "Congratulations! Your account has been verified.",
                url: `/`,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in sendUserVerifiedNotification:", error);
    }
}

export async function sendUserBecomesMemberNotification(user: UserPrivate): Promise<void> {
    try {
        console.log(`🔔 [NOTIFY] Sending user_becomes_member notification to ${user.name}`);
        await sendNotifications(
            "user_becomes_member",
            [user],
            sanitizeObjectForJSON({
                user,
                messageBody: "Congratulations! You are now a founding member.",
                url: `/`,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in sendUserBecomesMemberNotification:", error);
    }
}

export async function sendUserVerificationRejectedNotification(user: UserPrivate): Promise<void> {
    try {
        console.log(`🔔 [NOTIFY] Sending user_verification_rejected notification to ${user.name}`);
        await sendNotifications(
            "user_verification_rejected",
            [user],
            sanitizeObjectForJSON({
                user,
                messageBody: "Your account verification request has been rejected.",
                url: `/`,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in sendUserVerificationRejectedNotification:", error);
    }
}

/**
 * Send a notification when someone comments on a user's post, goal, task, etc.
 */
export async function notifyPostComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    console.log("🔔 [NOTIFY] notifyPostComment called:", {
        postId: post._id,
        commentId: comment._id,
        postAuthorDid: post.createdBy,
        commenterDid: comment.createdBy,
        commenterName: commenter?.name,
        postType: post.postType || "post",
    });

    try {
        // Check postType to determine notification logic
        switch (post.postType) {
            case "goal":
            case "task":
            case "issue":
            case "proposal":
                await notifyParentItemComment(post, comment, commenter);
                break;
            default: // Regular post or other types (including project for now)
                await notifyRegularPostComment(post, comment, commenter);
        }
        console.log("🔔 [NOTIFY] Notification sent successfully for post type:", post.postType || "post");
    } catch (error) {
        console.error("🔔 [NOTIFY] Error sending post comment notification:", error);
        // We don't re-throw the error because notification failures shouldn't break comment creation
    }
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
    await sendNotifications(
        "post_comment",
        [postAuthorPrivate],
        sanitizeObjectForJSON({
            circle,
            user: commenter,
            post,
            comment,
            postId: post._id?.toString(),
        }),
    );
}

/**
 * Send a notification when someone replies to a user's comment on a post, goal, task, etc.
 */
export async function notifyCommentReply(
    post: Post, // This is the shadow post
    parentComment: Comment,
    reply: Comment,
    replier: Circle,
): Promise<void> {
    try {
        // Check postType to determine notification logic
        switch (post.postType) {
            case "goal":
            case "task":
            case "issue":
            case "proposal":
                await notifyParentItemCommentReply(post, parentComment, reply, replier);
                break;
            default: // Regular post or other types (including project for now)
                await notifyRegularCommentReply(post, parentComment, reply, replier);
        }
        console.log("🔔 [NOTIFY] Comment reply notification sent successfully for post type:", post.postType || "post");
    } catch (error) {
        console.error("🔔 [NOTIFY] Error sending comment reply notification:", error);
    }
}

/**
 * Notifies just the comment author when someone replies to their comment
 */
async function notifyRegularCommentReply(
    post: Post,
    parentComment: Comment,
    reply: Comment,
    replier: Circle,
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
    await sendNotifications(
        "comment_reply",
        [commentAuthorPrivate],
        sanitizeObjectForJSON({
            circle,
            user: replier,
            post,
            comment: reply,
            postId: post._id?.toString(),
            commentId: parentComment._id?.toString(),
        }),
    );
}

/**
 * Notifies relevant users (author, assignee) when someone comments on a Goal, Task, Issue, or Proposal shadow post.
 */
async function notifyParentItemComment(post: Post, comment: Comment, commenter: Circle): Promise<void> {
    // Don't notify if commenter is the original item's author (fetched below)
    if (!post.parentItemId || !post.parentItemType) {
        console.error("🔔 [NOTIFY] Shadow post missing parent item info:", post._id);
        return; // Cannot proceed without parent info
    }

    let parentItem: GoalDisplay | TaskDisplay | IssueDisplay | ProposalDisplay | null = null;
    let itemAuthorDid: string | undefined = undefined;
    let itemAssigneeDid: string | undefined = undefined;
    let itemType = post.parentItemType; // e.g., "goal"
    let itemId = post.parentItemId;

    // Fetch the parent item based on type
    try {
        switch (itemType) {
            case "goal":
                parentItem = await getGoalById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                break;
            case "task":
                parentItem = await getTaskById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                itemAssigneeDid = (parentItem as TaskDisplay)?.assignedTo;
                break;
            case "issue":
                parentItem = await getIssueById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                itemAssigneeDid = (parentItem as IssueDisplay)?.assignedTo;
                break;
            case "proposal":
                parentItem = await getProposalById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                break;
            default:
                console.error("🔔 [NOTIFY] Unknown parent item type:", itemType);
                return;
        }
    } catch (fetchError) {
        console.error(`🔔 [NOTIFY] Error fetching parent ${itemType} (${itemId}):`, fetchError);
        return; // Stop if parent item cannot be fetched
    }

    if (!parentItem) {
        console.error(`🔔 [NOTIFY] Parent ${itemType} not found: ${itemId}`);
        return;
    }

    // No longer needed: Logic to skip author notification if they are the commenter
    // is handled in the "Add Item Author" block below.

    const recipients: UserPrivate[] = [];
    const recipientDids = new Set<string>();

    // 1. Add Item Author (if not the commenter)
    if (itemAuthorDid && itemAuthorDid !== comment.createdBy) {
        const author = await getUserPrivate(itemAuthorDid);
        if (author) {
            recipients.push(author);
            recipientDids.add(author.did!);
        } else {
            console.warn(`🔔 [NOTIFY] Author not found for ${itemType} ${itemId}`);
        }
    }

    // 2. Add Assignee (for Tasks/Issues, if different from author and commenter)
    if (itemAssigneeDid) {
        // Check if assignee DID exists first
        console.log(`🔔 [NOTIFY] Found Assignee DID for ${itemType} ${itemId}: ${itemAssigneeDid}`);
        if (itemAssigneeDid !== comment.createdBy && !recipientDids.has(itemAssigneeDid)) {
            console.log(`🔔 [NOTIFY] Attempting to fetch assignee: ${itemAssigneeDid}`);
            const assignee = await getUserPrivate(itemAssigneeDid);
            if (assignee) {
                console.log(`🔔 [NOTIFY] Assignee found and added to recipients: ${assignee.name} (${assignee.did})`);
                recipients.push(assignee);
                recipientDids.add(assignee.did!);
            } else {
                // Existing warning is good
                console.warn(
                    `🔔 [NOTIFY] Assignee user private data not found for DID: ${itemAssigneeDid} on ${itemType} ${itemId}`,
                );
            }
        } else {
            if (itemAssigneeDid === comment.createdBy) {
                console.log(
                    `🔔 [NOTIFY] Skipping assignee notification - assignee is the commenter: ${itemAssigneeDid}`,
                );
            }
            if (recipientDids.has(itemAssigneeDid)) {
                console.log(
                    `🔔 [NOTIFY] Skipping assignee notification - assignee is already a recipient (likely the author): ${itemAssigneeDid}`,
                );
            }
        }
    } else {
        console.log(`🔔 [NOTIFY] No Assignee DID found on ${itemType} ${itemId}`);
    }

    if (recipients.length === 0) {
        console.log(`🔔 [NOTIFY] No recipients found for ${itemType} comment notification:`, itemId);
        return;
    }

    // Get circle for context
    const circle = await getCircleById(parentItem.circleId);
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for parent item:", parentItem.circleId);
        return; // Need circle context
    }

    // Send notification (reuse post_comment type, but payload indicates parent item)
    console.log(`🔔 [NOTIFY] Sending ${itemType}_comment notification to ${recipients.length} recipients`);
    await sendNotifications(
        "post_comment",
        recipients,
        sanitizeObjectForJSON({
            circle,
            user: commenter, // The user who commented
            post, // The shadow post (contains parentItemId, parentItemType)
            comment,
            // Populate specific fields based on itemType for sendNotifications payload
            ...(itemType === "goal" && { goalId: itemId, goalTitle: (parentItem as GoalDisplay).title }),
            ...(itemType === "task" && { taskId: itemId, taskTitle: (parentItem as TaskDisplay).title }),
            ...(itemType === "issue" && { issueId: itemId, issueTitle: (parentItem as IssueDisplay).title }),
            ...(itemType === "proposal" && {
                proposalId: itemId,
                proposalName: (parentItem as ProposalDisplay).name,
            }),
            postId: post._id?.toString(), // Keep postId as fallback/context
        }),
    );
}

/**
 * Notifies relevant users (parent comment author, item author, assignee) when someone replies
 * to a comment on a Goal, Task, Issue, or Proposal shadow post.
 */
async function notifyParentItemCommentReply(
    post: Post, // Shadow post
    parentComment: Comment,
    reply: Comment,
    replier: Circle,
): Promise<void> {
    if (!post.parentItemId || !post.parentItemType) {
        console.error("🔔 [NOTIFY] Shadow post missing parent item info for reply:", post._id);
        return;
    }

    let parentItem: GoalDisplay | TaskDisplay | IssueDisplay | ProposalDisplay | null = null;
    let itemAuthorDid: string | undefined = undefined;
    let itemAssigneeDid: string | undefined = undefined;
    let itemType = post.parentItemType;
    let itemId = post.parentItemId;

    // Fetch the parent item
    try {
        switch (itemType) {
            case "goal":
                parentItem = await getGoalById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                break;
            case "task":
                parentItem = await getTaskById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                itemAssigneeDid = (parentItem as TaskDisplay)?.assignedTo;
                break;
            case "issue":
                parentItem = await getIssueById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                itemAssigneeDid = (parentItem as IssueDisplay)?.assignedTo;
                break;
            case "proposal":
                parentItem = await getProposalById(itemId);
                itemAuthorDid = parentItem?.createdBy;
                break;
            default:
                return; // Unknown type
        }
    } catch (fetchError) {
        console.error(`🔔 [NOTIFY] Error fetching parent ${itemType} (${itemId}) for reply:`, fetchError);
        return;
    }

    if (!parentItem) {
        console.error(`🔔 [NOTIFY] Parent ${itemType} not found for reply: ${itemId}`);
        return;
    }

    const recipients: UserPrivate[] = [];
    const recipientDids = new Set<string>();

    // 1. Add Parent Comment Author (if not the replier)
    if (parentComment.createdBy !== replier.did) {
        const commentAuthor = await getUserPrivate(parentComment.createdBy);
        if (commentAuthor) {
            recipients.push(commentAuthor);
            recipientDids.add(commentAuthor.did!);
        } else {
            console.warn(`🔔 [NOTIFY] Parent comment author not found: ${parentComment.createdBy}`);
        }
    }

    // 2. Add Item Author (if different from replier and parent comment author)
    if (itemAuthorDid && itemAuthorDid !== replier.did && !recipientDids.has(itemAuthorDid)) {
        const itemAuthor = await getUserPrivate(itemAuthorDid);
        if (itemAuthor) {
            recipients.push(itemAuthor);
            recipientDids.add(itemAuthor.did!);
        } else {
            console.warn(`🔔 [NOTIFY] Author not found for ${itemType} ${itemId}`);
        }
    }

    // 3. Add Assignee (for Tasks/Issues, if different from replier, parent author, and item author)
    if (itemAssigneeDid && itemAssigneeDid !== replier.did && !recipientDids.has(itemAssigneeDid)) {
        const assignee = await getUserPrivate(itemAssigneeDid);
        if (assignee) {
            recipients.push(assignee);
            recipientDids.add(assignee.did!);
        } else {
            console.warn(`🔔 [NOTIFY] Assignee not found for ${itemType} ${itemId}`);
        }
    }

    if (recipients.length === 0) {
        console.log(`🔔 [NOTIFY] No recipients found for ${itemType} comment reply notification:`, itemId);
        return;
    }

    // Get circle for context
    const circle = await getCircleById(parentItem.circleId);
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for parent item reply:", parentItem.circleId);
        return;
    }

    // Send notification (reuse comment_reply type, but payload indicates parent item)
    console.log(`🔔 [NOTIFY] Sending ${itemType}_comment_reply notification to ${recipients.length} recipients`);
    await sendNotifications(
        "comment_reply",
        recipients,
        sanitizeObjectForJSON({
            circle,
            user: replier, // The user who replied
            post, // The shadow post
            comment: reply, // The reply itself
            // Populate specific fields based on itemType for sendNotifications payload
            ...(itemType === "goal" && { goalId: itemId, goalTitle: (parentItem as GoalDisplay).title }),
            ...(itemType === "task" && { taskId: itemId, taskTitle: (parentItem as TaskDisplay).title }),
            ...(itemType === "issue" && { issueId: itemId, issueTitle: (parentItem as IssueDisplay).title }),
            ...(itemType === "proposal" && {
                proposalId: itemId,
                proposalName: (parentItem as ProposalDisplay).name,
            }),
            postId: post._id?.toString(), // Keep postId as fallback/context
            commentId: parentComment._id?.toString(), // ID of the comment being replied to
        }),
    );
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
    await sendNotifications(
        "post_like",
        [postAuthorPrivate],
        sanitizeObjectForJSON({
            circle,
            user: reactor,
            post,
            reaction: reactionType,
            postId: post._id?.toString(),
        }),
    );
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

    // --- Check if it's a comment on a parent item ---
    let parentItemPayload = {};
    if (post.parentItemType && post.parentItemId) {
        let parentItem: GoalDisplay | TaskDisplay | IssueDisplay | ProposalDisplay | null = null;
        try {
            switch (post.parentItemType) {
                case "goal":
                    parentItem = await getGoalById(post.parentItemId);
                    break;
                case "task":
                    parentItem = await getTaskById(post.parentItemId);
                    break;
                case "issue":
                    parentItem = await getIssueById(post.parentItemId);
                    break;
                case "proposal":
                    parentItem = await getProposalById(post.parentItemId);
                    break;
            }
        } catch (e) {
            console.error("Error fetching parent item for comment like notification", e);
        }

        if (parentItem) {
            parentItemPayload = {
                [`${post.parentItemType}Id`]: post.parentItemId,
                [`${post.parentItemType}Title`]: (parentItem as any).title || (parentItem as any).name,
                parentItemType: post.parentItemType,
            };
        }
    }
    // --- End parent item check ---

    // Send notification
    await sendNotifications(
        "comment_like",
        [commentAuthorPrivate],
        sanitizeObjectForJSON({
            circle,
            user: reactor,
            post,
            comment,
            reaction: reactionType,
            postId: post._id?.toString(),
            commentId: comment._id?.toString(),
            ...parentItemPayload, // Spread the parent item details into the payload
        }),
    );
}

/**
 * Send notifications when someone is mentioned in a post
 */
export async function notifyPostMentions(post: Post, author: Circle, mentionedCircles: Circle[]): Promise<void> {
    // Filter out self-mentions and get DIDs
    const mentionedUserDids = mentionedCircles
        .map((circle) => circle.did)
        .filter((did): did is string => !!did && did !== author.did);

    if (mentionedUserDids.length === 0) return;

    // Get UserPrivate for all mentioned users
    const mentionedUserPrivates = (await Promise.all(mentionedUserDids.map((did) => getUserPrivate(did)))).filter(
        (up): up is UserPrivate => up !== null,
    );

    if (mentionedUserPrivates.length === 0) return;

    // Get post circle
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // Send notifications to all mentioned users
    await sendNotifications(
        "post_mention",
        mentionedUserPrivates,
        sanitizeObjectForJSON({
            circle,
            user: author,
            post,
            postId: post._id?.toString(),
        }),
    );
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
    // Filter out self-mentions and get DIDs
    const mentionedUserDids = mentionedCircles
        .map((circle) => circle.did)
        .filter((did): did is string => !!did && did !== author.did);

    if (mentionedUserDids.length === 0) return;

    // Get UserPrivate for all mentioned users
    const mentionedUserPrivates = (await Promise.all(mentionedUserDids.map((did) => getUserPrivate(did)))).filter(
        (up): up is UserPrivate => up !== null,
    );

    if (mentionedUserPrivates.length === 0) return;

    // TODO: Enhance mention notifications for parent items (Goals, Tasks, etc.)?
    // Currently, it links to the shadow post. We might want it to link to the parent item.
    // This would require fetching the parent item based on post.parentItemId/Type here.

    // Get post circle (from the feed the shadow post belongs to)
    let feed = await getFeed(post.feedId);
    let circle = await getCircleById(feed?.circleId!);

    // --- Check if it's a comment on a parent item ---
    let parentItemPayloadMention = {};
    if (post.parentItemType && post.parentItemId) {
        let parentItem: GoalDisplay | TaskDisplay | IssueDisplay | ProposalDisplay | null = null;
        try {
            switch (post.parentItemType) {
                case "goal":
                    parentItem = await getGoalById(post.parentItemId);
                    break;
                case "task":
                    parentItem = await getTaskById(post.parentItemId);
                    break;
                case "issue":
                    parentItem = await getIssueById(post.parentItemId);
                    break;
                case "proposal":
                    parentItem = await getProposalById(post.parentItemId);
                    break;
            }
        } catch (e) {
            console.error("Error fetching parent item for comment mention notification", e);
        }

        if (parentItem) {
            parentItemPayloadMention = {
                [`${post.parentItemType}Id`]: post.parentItemId,
                [`${post.parentItemType}Title`]: (parentItem as any).title || (parentItem as any).name,
                parentItemType: post.parentItemType,
            };
        }
    }
    // --- End parent item check ---

    // Send notifications to all mentioned users
    await sendNotifications(
        "comment_mention",
        mentionedUserPrivates,
        sanitizeObjectForJSON({
            circle,
            user: author,
            post,
            comment,
            postId: post._id?.toString(),
            commentId: comment._id?.toString(),
            ...parentItemPayloadMention, // Spread the parent item details into the payload
        }),
    );
}

// --- Proposal Notifications ---

/**
 * Helper to get the circle for a proposal notification
 */
async function getProposalCircle(proposal: Proposal | ProposalDisplay): Promise<Circle | null> {
    if (!proposal?.circleId) {
        console.error("🔔 [NOTIFY] Proposal missing circleId");
        return null;
    }
    const circle = await getCircleById(proposal.circleId);
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for proposal:", proposal.circleId);
    }
    return circle;
}

/**
 * Send notification when a proposal is submitted for review
 */
export async function notifyProposalSubmittedForReview(proposal: ProposalDisplay, submitter: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalSubmittedForReview called:", {
            proposalId: proposal._id,
            submitterDid: submitter.did,
        });
        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        // Find DIDs of users with review permission (excluding the submitter)
        const reviewerDids = (await getAuthorizedMembers(circle, features.proposals.review))
            .map((user) => user.did)
            .filter((did): did is string => !!did && did !== submitter.did);

        if (reviewerDids.length === 0) {
            console.log("🔔 [NOTIFY] No reviewer DIDs found to notify for proposal:", proposal._id);
            return;
        }

        const reviewerUserPrivates = (await Promise.all(reviewerDids.map((did) => getUserPrivate(did)))).filter(
            (up): up is UserPrivate => up !== null,
        );

        if (reviewerUserPrivates.length === 0) {
            console.log("🔔 [NOTIFY] No reviewers (UserPrivate) found to notify for proposal:", proposal._id);
            return; // Exit if no reviewers
        }

        console.log(`🔔 [NOTIFY] Sending proposal_submitted_for_review to ${reviewerUserPrivates.length} reviewers`);
        await sendNotifications(
            "proposal_submitted_for_review",
            reviewerUserPrivates,
            sanitizeObjectForJSON({
                circle,
                user: submitter, // The user who triggered the notification (submitter)
                proposalId: proposal._id?.toString(),
                proposalName: proposal.name,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalSubmittedForReview:", error);
    }
}

/**
 * Send notification when a proposal is moved to the voting stage
 */
export async function notifyProposalMovedToVoting(proposal: ProposalDisplay, approver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalMovedToVoting called:", {
            proposalId: proposal._id,
            approverDid: approver.did,
        });
        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        // Find DIDs of users with voting permission (excluding the approver)
        const voterDids = (await getAuthorizedMembers(circle, features.proposals.vote))
            .map((user) => user.did)
            .filter((did): did is string => !!did && did !== approver.did);

        if (voterDids.length === 0) {
            console.log("🔔 [NOTIFY] No voter DIDs found to notify for proposal:", proposal._id);
            return;
        }
        const voterUserPrivates = (await Promise.all(voterDids.map((did) => getUserPrivate(did)))).filter(
            (up): up is UserPrivate => up !== null,
        );

        if (voterUserPrivates.length === 0) {
            console.log("🔔 [NOTIFY] No voters (UserPrivate) found to notify for proposal:", proposal._id);
            return; // Exit if no voters
        }

        console.log(`🔔 [NOTIFY] Sending proposal_moved_to_voting to ${voterUserPrivates.length} voters`);
        await sendNotifications(
            "proposal_moved_to_voting",
            voterUserPrivates,
            sanitizeObjectForJSON({
                circle,
                user: approver, // The user who triggered the notification (approver)
                proposalId: proposal._id?.toString(),
                proposalName: proposal.name,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalMovedToVoting:", error);
    }
}

/**
 * Send notification to the author when their proposal is approved for voting
 */
export async function notifyProposalApprovedForVoting(proposal: ProposalDisplay, approver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalApprovedForVoting called:", {
            proposalId: proposal._id,
            authorDid: proposal.createdBy,
            approverDid: approver.did,
        });
        // Don't notify if approver is the author
        if (proposal.createdBy === approver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - approver is author");
            return;
        }

        const author = await getUserPrivate(proposal.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for proposal:", proposal._id);
            return;
        }

        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending proposal_approved_for_voting to author:", author.name);
        await sendNotifications(
            "proposal_approved_for_voting",
            [author],
            sanitizeObjectForJSON({
                circle,
                user: approver, // The user who triggered the notification (approver)
                proposalId: proposal._id?.toString(),
                proposalName: proposal.name,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalApprovedForVoting:", error);
    }
}

/**
 * Formats the resolution message for notifications.
 */
function formatProposalResolutionMessage(
    proposal: ProposalDisplay,
    outcomePrefix: string, // e.g., "Your proposal", "The proposal"
): string {
    const outcomeText = proposal.outcome === "accepted" ? "accepted" : "rejected";
    let message = `${outcomePrefix} "${proposal.name}" was ${outcomeText}`;
    if (proposal.resolvedAtStage) {
        message += ` during the ${proposal.resolvedAtStage} stage`;
    }
    if (proposal.outcomeReason) {
        message += `: ${proposal.outcomeReason}`;
    } else {
        message += ".";
    }
    return message;
}

/**
 * Send notification to the author when their proposal is resolved
 */
export async function notifyProposalResolvedAuthor(proposal: ProposalDisplay, resolver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalResolvedAuthor called:", {
            proposalId: proposal._id,
            authorDid: proposal.createdBy,
            resolverDid: resolver.did,
        });
        // Don't notify if resolver is the author
        if (proposal.createdBy === resolver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - resolver is author");
            return;
        }

        const author = await getUserPrivate(proposal.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for proposal:", proposal._id);
            return;
        }

        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        const message = formatProposalResolutionMessage(proposal, "Your proposal");

        console.log("🔔 [NOTIFY] Sending proposal_resolved to author:", author.name);
        await sendNotifications(
            "proposal_resolved",
            [author],
            sanitizeObjectForJSON({
                circle,
                user: resolver, // The user who triggered the notification (resolver)
                proposalId: proposal._id?.toString(),
                proposalName: proposal.name,
                proposalOutcome: proposal.outcome,
                proposalResolvedAtStage: proposal.resolvedAtStage,
                messageBody: message, // Send pre-formatted message
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalResolvedAuthor:", error);
    }
}

/**
 * Send notification to voters when a proposal is resolved
 */
export async function notifyProposalResolvedVoters(proposal: ProposalDisplay, resolver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalResolvedVoters called:", {
            proposalId: proposal._id,
            resolverDid: resolver.did,
        });
        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        // Get DIDs of users who voted (reacted) - excluding the resolver and the author
        const voterDids = (await getProposalReactions(proposal._id as string))
            .map((user) => user.did)
            .filter((did): did is string => !!did && did !== resolver.did && did !== proposal.createdBy);

        if (voterDids.length === 0) {
            console.log("🔔 [NOTIFY] No voter DIDs found to notify for resolved proposal:", proposal._id);
            return;
        }

        const voterUserPrivates = (await Promise.all(voterDids.map((did) => getUserPrivate(did)))).filter(
            (up): up is UserPrivate => up !== null,
        );

        if (voterUserPrivates.length === 0) {
            console.log("🔔 [NOTIFY] No voters (UserPrivate) found to notify for resolved proposal:", proposal._id);
            return; // Exit if no voters
        }

        const message = formatProposalResolutionMessage(proposal, "The proposal");

        console.log(`🔔 [NOTIFY] Sending proposal_resolved_voter to ${voterUserPrivates.length} voters`);
        await sendNotifications(
            "proposal_resolved_voter",
            voterUserPrivates,
            sanitizeObjectForJSON({
                circle,
                user: resolver, // The user who triggered the notification (resolver)
                proposalId: proposal._id?.toString(),
                proposalName: proposal.name,
                proposalOutcome: proposal.outcome,
                proposalResolvedAtStage: proposal.resolvedAtStage,
                messageBody: message, // Send pre-formatted message
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalResolvedVoters:", error);
    }
}

/**
 * Send notification to the author when someone votes on their proposal
 */
export async function notifyProposalVote(proposal: ProposalDisplay, voter: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalVote called:", {
            proposalId: proposal._id,
            authorDid: proposal.createdBy,
            voterDid: voter.did,
        });
        // Don't notify if voter is the author
        if (proposal.createdBy === voter.did) {
            console.log("🔔 [NOTIFY] Skipping notification - voter is author");
            return;
        }

        const author = await getUserPrivate(proposal.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for proposal:", proposal._id);
            return;
        }

        const circle = await getProposalCircle(proposal);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending proposal_vote to author:", author.name);
        await sendNotifications(
            "proposal_vote",
            [author],
            sanitizeObjectForJSON({
                circle,
                user: voter, // The user who triggered the notification (voter)
                proposalId: proposal._id?.toString(),
                proposalName: proposal.name,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalVote:", error);
    }
}

// --- Issue Notifications ---

/**
 * Helper to get the circle for an issue notification
 */
async function getIssueCircle(issue: IssueDisplay): Promise<Circle | null> {
    if (!issue?.circleId) {
        console.error("🔔 [NOTIFY] Issue missing circleId");
        return null;
    }
    const circle = await getCircleById(issue.circleId);
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for issue:", issue.circleId);
    }
    return circle;
}

/**
 * Helper to get the circle for a task notification
 */
async function getTaskCircle(task: TaskDisplay): Promise<Circle | null> {
    // Renamed function, param type
    if (!task?.circleId) {
        // Renamed param
        console.error("🔔 [NOTIFY] Task missing circleId"); // Updated message
        return null;
    }
    const circle = await getCircleById(task.circleId); // Renamed param
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for task:", task.circleId); // Updated message, param
    }
    return circle;
}

/**
 * Helper to get the circle for a goal notification
 */
async function getGoalCircle(goal: GoalDisplay): Promise<Circle | null> {
    // Renamed function, param type
    if (!goal?.circleId) {
        // Renamed param
        console.error("🔔 [NOTIFY] Goal missing circleId"); // Updated message
        return null;
    }
    const circle = await getCircleById(goal.circleId); // Renamed param
    if (!circle) {
        console.error("🔔 [NOTIFY] Circle not found for goal:", goal.circleId); // Updated message, param
    }
    return circle;
}

/**
 * Send notification when an issue is submitted for review
 */
export async function notifyIssueSubmittedForReview(issue: IssueDisplay, submitter: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueSubmittedForReview called:", {
            issueId: issue._id,
            submitterDid: submitter.did,
        });
        const circle = await getIssueCircle(issue);
        if (!circle) return;

        // Find DIDs of users with review permission (excluding the submitter)
        const reviewerDids = (await getAuthorizedMembers(circle, features.issues?.review))
            .map((user) => user.did)
            .filter((did): did is string => !!did && did !== submitter.did);

        if (reviewerDids.length === 0) {
            console.log("🔔 [NOTIFY] No reviewer DIDs found to notify for issue:", issue._id);
            return;
        }
        const reviewerUserPrivates = (await Promise.all(reviewerDids.map((did) => getUserPrivate(did)))).filter(
            (up): up is UserPrivate => up !== null,
        );

        if (reviewerUserPrivates.length === 0) {
            console.log("🔔 [NOTIFY] No reviewers (UserPrivate) found to notify for issue:", issue._id);
            return;
        }

        console.log(`🔔 [NOTIFY] Sending issue_submitted_for_review to ${reviewerUserPrivates.length} reviewers`);
        await sendNotifications(
            "issue_submitted_for_review",
            reviewerUserPrivates,
            sanitizeObjectForJSON({
                circle,
                user: submitter, // The user who triggered the notification (submitter)
                // Pass issue details directly, not nested under 'issue'
                issueId: issue._id?.toString(),
                issueTitle: issue.title,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueSubmittedForReview:", error);
    }
}

/**
 * Send notification to the author when their issue is approved (moved to Open)
 */
export async function notifyIssueApproved(issue: IssueDisplay, approver: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueApproved called:", {
            issueId: issue._id,
            authorDid: issue.createdBy,
            approverDid: approver.did,
        });
        // Don't notify if approver is the author
        if (issue.createdBy === approver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - approver is author");
            return;
        }

        const author = await getUserPrivate(issue.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for issue:", issue._id);
            return;
        }

        const circle = await getIssueCircle(issue);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending issue_approved to author:", author.name);
        await sendNotifications(
            "issue_approved",
            [author],
            sanitizeObjectForJSON({
                circle,
                user: approver, // The user who triggered the notification (approver)
                // Pass issue details directly
                issueId: issue._id?.toString(),
                issueTitle: issue.title,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueApproved:", error);
    }
}

/**
 * Send notification when an issue is assigned to a user
 */
export async function notifyIssueAssigned(issue: IssueDisplay, assigner: Circle, assignee: UserPrivate): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueAssigned called:", {
            issueId: issue._id,
            assignerDid: assigner.did,
            assigneeDid: assignee.did,
        });
        // Don't notify if assigner is the assignee
        if (assigner.did === assignee.did) {
            console.log("🔔 [NOTIFY] Skipping notification - assigner is assignee");
            return;
        }

        const circle = await getIssueCircle(issue);
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending issue_assigned to assignee:", assignee.name);
        await sendNotifications(
            "issue_assigned",
            [assignee],
            sanitizeObjectForJSON({
                circle,
                user: assigner, // The user who triggered the notification (assigner)
                // Pass issue details directly
                issueId: issue._id?.toString(),
                issueTitle: issue.title,
                assigneeName: assignee.name, // Add assignee name for context
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueAssigned:", error);
    }
}

/**
 * Send notification when an issue's status changes (e.g., Open -> In Progress, In Progress -> Resolved)
 */
export async function notifyIssueStatusChanged(
    issue: IssueDisplay,
    changer: Circle,
    oldStage: IssueStage,
): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyIssueStatusChanged called:", {
            issueId: issue._id,
            changerDid: changer.did,
            oldStage: oldStage,
            newStage: issue.stage,
        });

        const circle = await getIssueCircle(issue);
        if (!circle) return;

        const recipients: UserPrivate[] = [];
        const author = await getUserPrivate(issue.createdBy);
        let assignee: UserPrivate | null = null;
        if (issue.assignedTo) {
            assignee = await getUserPrivate(issue.assignedTo);
        }

        // Add author if not the changer
        if (author && author.did !== changer.did) {
            recipients.push(author);
        }

        // Add assignee if exists, not the changer, and not already added (i.e., not the author)
        if (assignee && assignee.did !== changer.did && assignee.did !== author?.did) {
            recipients.push(assignee);
        }

        if (recipients.length === 0) {
            console.log("🔔 [NOTIFY] No recipients found for issue status change:", issue._id);
            return;
        }

        console.log(`🔔 [NOTIFY] Sending issue_status_changed to ${recipients.length} recipients`);
        await sendNotifications(
            "issue_status_changed",
            recipients,
            sanitizeObjectForJSON({
                circle,
                user: changer, // The user who triggered the notification (changer)
                // Pass issue details directly
                issueId: issue._id?.toString(),
                issueTitle: issue.title,
                issueOldStage: oldStage,
                issueNewStage: issue.stage,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyIssueStatusChanged:", error);
    }
}

/**
 * Send notification when a task is submitted for review
 */
export async function notifyTaskSubmittedForReview(task: TaskDisplay, submitter: Circle): Promise<void> {
    // Renamed function, param type
    try {
        console.log("🔔 [NOTIFY] notifyTaskSubmittedForReview called:", {
            // Updated message
            taskId: task._id, // Renamed property
            submitterDid: submitter.did,
        });
        const circle = await getTaskCircle(task); // Renamed helper function
        if (!circle) return;

        // Find DIDs of users with review permission (excluding the submitter)
        const reviewerDids = (await getAuthorizedMembers(circle, features.tasks?.review)) // Updated feature check
            .map((user) => user.did)
            .filter((did): did is string => !!did && did !== submitter.did);

        if (reviewerDids.length === 0) {
            console.log("🔔 [NOTIFY] No reviewer DIDs found to notify for task:", task._id); // Updated message
            return;
        }
        const reviewerUserPrivates = (await Promise.all(reviewerDids.map((did) => getUserPrivate(did)))).filter(
            (up): up is UserPrivate => up !== null,
        );

        if (reviewerUserPrivates.length === 0) {
            console.log("🔔 [NOTIFY] No reviewers (UserPrivate) found to notify for task:", task._id); // Updated message
            return;
        }

        console.log(`🔔 [NOTIFY] Sending task_submitted_for_review to ${reviewerUserPrivates.length} reviewers`); // Updated message
        await sendNotifications(
            "task_submitted_for_review",
            reviewerUserPrivates,
            sanitizeObjectForJSON({
                // Updated notification type
                circle,
                user: submitter, // The user who triggered the notification (submitter)
                // Pass task details directly
                taskId: task._id?.toString(), // Renamed property
                taskTitle: task.title, // Renamed property
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyTaskSubmittedForReview:", error); // Updated message
    }
}

/**
 * Send notification to the author when their task is approved (moved to Open)
 */
export async function notifyTaskApproved(task: TaskDisplay, approver: Circle): Promise<void> {
    // Renamed function, param type
    try {
        console.log("🔔 [NOTIFY] notifyTaskApproved called:", {
            // Updated message
            taskId: task._id, // Renamed property
            authorDid: task.createdBy,
            approverDid: approver.did,
        });
        // Don't notify if approver is the author
        if (task.createdBy === approver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - approver is author");
            return;
        }

        const author = await getUserPrivate(task.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for task:", task._id); // Updated message
            return;
        }

        const circle = await getTaskCircle(task); // Renamed helper function
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending task_approved to author:", author.name); // Updated message
        await sendNotifications(
            "task_approved",
            [author],
            sanitizeObjectForJSON({
                // Updated notification type
                circle,
                user: approver, // The user who triggered the notification (approver)
                // Pass task details directly
                taskId: task._id?.toString(), // Renamed property
                taskTitle: task.title, // Renamed property
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyTaskApproved:", error); // Updated message
    }
}

/**
 * Send notification when a task is assigned to a user
 */
export async function notifyTaskAssigned(task: TaskDisplay, assigner: Circle, assignee: UserPrivate): Promise<void> {
    // Renamed function, param type
    try {
        console.log("🔔 [NOTIFY] notifyTaskAssigned called:", {
            // Updated message
            taskId: task._id, // Renamed property
            assignerDid: assigner.did,
            assigneeDid: assignee.did,
        });
        // Don't notify if assigner is the assignee
        if (assigner.did === assignee.did) {
            console.log("🔔 [NOTIFY] Skipping notification - assigner is assignee");
            return;
        }

        const circle = await getTaskCircle(task); // Renamed helper function
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending task_assigned to assignee:", assignee.name); // Updated message
        await sendNotifications(
            "task_assigned",
            [assignee],
            sanitizeObjectForJSON({
                // Updated notification type
                circle,
                user: assigner, // The user who triggered the notification (assigner)
                // Pass task details directly
                taskId: task._id?.toString(), // Renamed property
                taskTitle: task.title, // Renamed property
                assigneeName: assignee.name, // Add assignee name for context
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyTaskAssigned:", error); // Updated message
    }
}

/**
 * Send notification when a task's status changes (e.g., Open -> In Progress, In Progress -> Resolved)
 */
export async function notifyTaskStatusChanged( // Renamed function
    task: TaskDisplay, // Renamed param type
    changer: Circle,
    oldStage: TaskStage, // Renamed param type
): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyTaskStatusChanged called:", {
            // Updated message
            taskId: task._id, // Renamed property
            changerDid: changer.did,
            oldStage: oldStage,
            newStage: task.stage,
        });

        const circle = await getTaskCircle(task); // Renamed helper function
        if (!circle) return;

        const recipients: UserPrivate[] = [];
        const author = await getUserPrivate(task.createdBy);
        let assignee: UserPrivate | null = null;
        if (task.assignedTo) {
            assignee = await getUserPrivate(task.assignedTo);
        }

        // Add author if not the changer
        if (author && author.did !== changer.did) {
            recipients.push(author);
        }

        // Add assignee if exists, not the changer, and not already added (i.e., not the author)
        if (assignee && assignee.did !== changer.did && assignee.did !== author?.did) {
            recipients.push(assignee);
        }

        if (recipients.length === 0) {
            console.log("🔔 [NOTIFY] No recipients found for task status change:", task._id); // Updated message
            return;
        }

        console.log(`🔔 [NOTIFY] Sending task_status_changed to ${recipients.length} recipients`); // Updated message
        await sendNotifications(
            "task_status_changed",
            recipients,
            sanitizeObjectForJSON({
                // Updated notification type
                circle,
                user: changer, // The user who triggered the notification (changer)
                // Pass task details directly
                taskId: task._id?.toString(), // Renamed property
                taskTitle: task.title, // Renamed property
                taskOldStage: oldStage, // Renamed property
                taskNewStage: task.stage, // Renamed property
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyTaskStatusChanged:", error); // Updated message
    }
}

/**
 * Send notification when a goal is submitted for review
 */
export async function notifyGoalSubmittedForReview(goal: GoalDisplay, submitter: Circle): Promise<void> {
    // Renamed function, param type
    try {
        console.log("🔔 [NOTIFY] notifyGoalSubmittedForReview called:", {
            // Updated message
            goalId: goal._id, // Renamed property
            submitterDid: submitter.did,
        });
        const circle = await getGoalCircle(goal); // Renamed helper function
        if (!circle) return;

        // Find DIDs of users with review permission (excluding the submitter)
        const reviewerDids = (await getAuthorizedMembers(circle, features.goals?.review)) // Updated feature check
            .map((user) => user.did)
            .filter((did): did is string => !!did && did !== submitter.did);

        if (reviewerDids.length === 0) {
            console.log("🔔 [NOTIFY] No reviewer DIDs found to notify for goal:", goal._id); // Updated message
            return;
        }
        const reviewerUserPrivates = (await Promise.all(reviewerDids.map((did) => getUserPrivate(did)))).filter(
            (up): up is UserPrivate => up !== null,
        );

        if (reviewerUserPrivates.length === 0) {
            console.log("🔔 [NOTIFY] No reviewers (UserPrivate) found to notify for goal:", goal._id); // Updated message
            return;
        }

        console.log(`🔔 [NOTIFY] Sending goal_submitted_for_review to ${reviewerUserPrivates.length} reviewers`); // Updated message
        await sendNotifications(
            "goal_submitted_for_review",
            reviewerUserPrivates,
            sanitizeObjectForJSON({
                // Updated notification type
                circle,
                user: submitter, // The user who triggered the notification (submitter)
                // Pass goal details directly
                goalId: goal._id?.toString(), // Renamed property
                goalTitle: goal.title, // Renamed property
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyGoalSubmittedForReview:", error); // Updated message
    }
}

/**
 * Send notification to the author when their goal is approved (moved to Open)
 */
export async function notifyGoalApproved(goal: GoalDisplay, approver: Circle): Promise<void> {
    // Renamed function, param type
    try {
        console.log("🔔 [NOTIFY] notifyGoalApproved called:", {
            // Updated message
            goalId: goal._id, // Renamed property
            authorDid: goal.createdBy,
            approverDid: approver.did,
        });
        // Don't notify if approver is the author
        if (goal.createdBy === approver.did) {
            console.log("🔔 [NOTIFY] Skipping notification - approver is author");
            return;
        }

        const author = await getUserPrivate(goal.createdBy);
        if (!author) {
            console.error("🔔 [NOTIFY] Author not found for goal:", goal._id); // Updated message
            return;
        }

        const circle = await getGoalCircle(goal); // Renamed helper function
        if (!circle) return;

        console.log("🔔 [NOTIFY] Sending goal_approved to author:", author.name); // Updated message
        await sendNotifications(
            "goal_approved",
            [author],
            sanitizeObjectForJSON({
                // Updated notification type
                circle,
                user: approver, // The user who triggered the notification (approver)
                // Pass goal details directly
                goalId: goal._id?.toString(), // Renamed property
                goalTitle: goal.title, // Renamed property
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyGoalApproved:", error); // Updated message
    }
}

/**
 * Send notification when a goal's status changes (e.g., Open -> In Progress, In Progress -> Resolved)
 */
export async function notifyGoalStatusChanged( // Renamed function
    goal: GoalDisplay, // Renamed param type
    changer: Circle,
    oldStage: GoalStage, // Renamed param type
): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyGoalStatusChanged called:", {
            // Updated message
            goalId: goal._id, // Renamed property
            changerDid: changer.did,
            oldStage: oldStage,
            newStage: goal.stage,
        });

        const circle = await getGoalCircle(goal); // Renamed helper function
        if (!circle) return;

        const recipients: UserPrivate[] = [];
        const author = await getUserPrivate(goal.createdBy);

        // Add author if not the changer
        if (author && author.did !== changer.did) {
            recipients.push(author);
        }

        if (recipients.length === 0) {
            console.log("🔔 [NOTIFY] No recipients found for goal status change:", goal._id); // Updated message
            return;
        }

        console.log(`🔔 [NOTIFY] Sending goal_status_changed to ${recipients.length} recipients`); // Updated message
        await sendNotifications(
            "goal_status_changed",
            recipients,
            sanitizeObjectForJSON({
                // Updated notification type
                circle,
                user: changer, // The user who triggered the notification (changer)
                // Pass goal details directly
                goalId: goal._id?.toString(), // Renamed property
                goalTitle: goal.title, // Renamed property
                goalOldStage: oldStage, // Renamed property
                goalNewStage: goal.stage, // Renamed property
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyGoalStatusChanged:", error); // Updated message
    }
}

/**
 * Send notification when a goal is completed.
 * Notifies all followers of the goal.
 */
export async function notifyGoalCompleted(goal: GoalDisplay, completer: Circle): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyGoalCompleted called:", {
            goalId: goal._id,
            completerDid: completer.did,
        });
        const circle = await getGoalCircle(goal);
        if (!circle) return;

        if (!goal.followers || goal.followers.length === 0) {
            console.log("🔔 [NOTIFY] No followers to notify for completed goal:", goal._id);
            return;
        }

        // Fetch UserPrivate details for all followers
        const followerUsers = await getCirclesByDids(goal.followers);
        const followerUserPrivates = (
            await Promise.all(followerUsers.map((u) => (u.did ? getUserPrivate(u.did) : Promise.resolve(null))))
        ).filter((up): up is UserPrivate => up !== null);

        // Filter out the completer from the recipients
        const recipients = followerUserPrivates.filter((follower) => follower.did !== completer.did);

        if (recipients.length === 0) {
            console.log("🔔 [NOTIFY] No recipients (after filtering completer) for completed goal:", goal._id);
            return;
        }

        console.log(`🔔 [NOTIFY] Sending goal_completed to ${recipients.length} followers`);
        await sendNotifications(
            "goal_completed",
            recipients,
            sanitizeObjectForJSON({
                circle,
                user: completer, // The user who completed the goal
                goalId: goal._id?.toString(),
                goalTitle: goal.title,
                goalResultSummary: goal.resultSummary, // Add result summary for context
                // The link in the notification should ideally go to the goal's result display/post
                // This might require the resultPostId to be part of the payload or handled by the client
                resultPostId: goal.resultPostId,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyGoalCompleted:", error);
    }
}

/**
 * Send notification when a proposal is converted into a goal.
 * Notifies the proposal author (if different from actor) and users who could vote.
 */
export async function notifyProposalToGoal(
    proposal: ProposalDisplay,
    newGoal: GoalDisplay,
    actor: Circle, // User who initiated the conversion
): Promise<void> {
    try {
        console.log("🔔 [NOTIFY] notifyProposalToGoal called:", {
            proposalId: proposal._id,
            newGoalId: newGoal._id,
            actorDid: actor.did,
        });
        const circle = await getProposalCircle(proposal); // Assuming goal is in the same circle
        if (!circle) return;

        const recipients: UserPrivate[] = [];
        const recipientDids = new Set<string>();

        // 1. Notify Proposal Author (if not the actor)
        if (proposal.createdBy && proposal.createdBy !== actor.did) {
            const author = await getUserPrivate(proposal.createdBy);
            if (author) {
                recipients.push(author);
                recipientDids.add(author.did!);
            } else {
                console.warn(`🔔 [NOTIFY] Proposal author not found for proposal_to_goal: ${proposal.createdBy}`);
            }
        }

        // 2. Notify users who were authorized to vote on the proposal (excluding actor and already added author)
        const potentialVoters = await getAuthorizedMembers(circle, features.proposals.vote);
        for (const pv of potentialVoters) {
            if (pv.did && pv.did !== actor.did && !recipientDids.has(pv.did)) {
                const voterUserPrivate = await getUserPrivate(pv.did);
                if (voterUserPrivate) {
                    recipients.push(voterUserPrivate);
                    recipientDids.add(voterUserPrivate.did!);
                }
            }
        }

        if (recipients.length === 0) {
            console.log("🔔 [NOTIFY] No recipients for proposal_to_goal notification:", proposal._id);
            return;
        }

        console.log(`🔔 [NOTIFY] Sending proposal_to_goal to ${recipients.length} users`);
        await sendNotifications(
            "proposal_to_goal",
            recipients,
            sanitizeObjectForJSON({
                circle,
                user: actor, // The user who converted the proposal
                proposalId: proposal._id?.toString(),
                proposalName: proposal.name,
                goalId: newGoal._id?.toString(),
                goalTitle: newGoal.title,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyProposalToGoal:", error);
    }
}

/**
 * Send notification when a user is invited to an event.
 */
export async function notifyEventInvitation(event: Event, inviter: Circle, invitedUser: UserPrivate): Promise<void> {
    try {
        console.log(`🔔 [NOTIFY] notifyEventInvitation called for event ${event._id} to user ${invitedUser.did}`);
        const circle = await getCircleById(event.circleId);
        if (!circle) {
            console.error(`🔔 [NOTIFY] Circle not found for event invitation: ${event.circleId}`);
            return;
        }

        await sendNotifications(
            "event_invitation",
            [invitedUser],
            sanitizeObjectForJSON({
                circle,
                user: inviter, // The user who invited
                eventId: event._id?.toString(),
                eventName: event.title,
            }),
        );
    } catch (error) {
        console.error("🔔 [NOTIFY] Error in notifyEventInvitation:", error);
    }
}
