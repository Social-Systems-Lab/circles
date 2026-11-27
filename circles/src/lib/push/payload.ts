import { resolveSafeNotificationUrl } from "../pwa/notification-click-url";
import type { PushNotificationCategoryKey, PushNotificationPayload } from "./types";

const INTERNAL_ORIGIN = "https://kamooni.local";

export function getPushCategoryForNotificationType(type: string): PushNotificationCategoryKey {
    switch (type) {
        case "pm_received":
        case "chat_mention":
        case "circle_moderation_update":
        case "contact_request_received":
            return "messages";
        case "event_invitation":
        case "event_submitted_for_review":
        case "event_approved":
        case "event_status_changed":
            return "events";
        case "ranking_stale_reminder":
        case "ranking_grace_period_ended":
            return "tasks";
        case "user_verified":
        case "user_verification_request":
        case "user_verification_clarification_requested":
        case "user_verification_reply_received":
        case "user_verification_rejected":
        case "user_becomes_member":
        case "proof_of_humanity_verified":
            return "account";
        default:
            if (type.startsWith("task_")) {
                return "tasks";
            }
            return "community";
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function resolveNotificationRoutePath(
    type: string,
    content: Record<string, unknown> | undefined,
    recipientHandle?: string,
): string {
    const explicitUrl = asNonEmptyString(content?.url);
    if (explicitUrl) {
        return resolveSafeNotificationUrl(explicitUrl, INTERNAL_ORIGIN);
    }

    const circleHandle = asNonEmptyString(asRecord(content?.circle)?.handle) || "default";
    const actorHandle = asNonEmptyString(asRecord(content?.user)?.handle);
    const post = asRecord(content?.post);
    const parentItemType = asNonEmptyString(post?.parentItemType);
    const parentItemId = asNonEmptyString(post?.parentItemId);

    const resolveParentItemPath = (): string | undefined => {
        if (!parentItemType || !parentItemId) {
            return undefined;
        }
        const plural = parentItemType === "issue" ? "issues" : `${parentItemType}s`;
        return `/circles/${encodeURIComponent(circleHandle)}/${encodeURIComponent(plural)}/${encodeURIComponent(parentItemId)}`;
    };

    let candidate = "/";
    const roomId = asNonEmptyString(content?.roomId);
    const topicId = asNonEmptyString(content?.topicId);
    const postId = asNonEmptyString(content?.postId);
    const proposalId = asNonEmptyString(content?.proposalId);
    const issueId = asNonEmptyString(content?.issueId);
    const taskId = asNonEmptyString(content?.taskId);
    const goalId = asNonEmptyString(content?.goalId);
    const eventId = asNonEmptyString(content?.eventId);
    const invitationId = asNonEmptyString(content?.invitationId);

    switch (type) {
        case "pm_received":
        case "chat_mention":
        case "circle_moderation_update":
            if (roomId) {
                candidate = `/chat/${encodeURIComponent(roomId)}${topicId ? `?topic=${encodeURIComponent(topicId)}` : ""}`;
            }
            break;
        case "contact_request_received":
            if (actorHandle) {
                candidate = `/circles/${encodeURIComponent(actorHandle)}`;
            }
            break;
        case "follow_request":
            if (circleHandle !== "default") {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/settings/membership-requests`;
            }
            break;
        case "new_follower":
            if (actorHandle) {
                candidate = `/circles/${encodeURIComponent(actorHandle)}`;
            }
            break;
        case "follow_accepted":
        case "new_following":
        case "new_member":
            if (circleHandle !== "default") {
                candidate = `/circles/${encodeURIComponent(circleHandle)}`;
            }
            break;
        case "user_verified":
        case "user_verification_clarification_requested":
        case "user_verification_rejected":
        case "user_becomes_member":
        case "proof_of_humanity_verified":
            if (recipientHandle) {
                candidate = `/circles/${encodeURIComponent(recipientHandle)}/settings/subscription`;
            }
            break;
        case "user_verification_request":
        case "user_verification_reply_received":
            candidate = "/admin";
            break;
        case "secret_circle_invitation":
            if (invitationId) {
                candidate = `/secret-invitations/${encodeURIComponent(invitationId)}`;
            }
            break;
        case "post_comment":
        case "comment_reply":
        case "post_like":
        case "comment_like":
        case "post_mention":
        case "comment_mention":
            candidate =
                resolveParentItemPath() ||
                (postId ? `/circles/${encodeURIComponent(circleHandle)}/post/${encodeURIComponent(postId)}` : "/");
            break;
        case "proposal_to_goal":
            if (goalId) {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/goals/${encodeURIComponent(goalId)}`;
            } else if (proposalId) {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/proposals/${encodeURIComponent(proposalId)}`;
            }
            break;
        case "proposal_submitted_for_review":
        case "proposal_moved_to_voting":
        case "proposal_approved_for_voting":
        case "proposal_resolved":
        case "proposal_resolved_voter":
        case "proposal_vote":
            if (proposalId) {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/proposals/${encodeURIComponent(proposalId)}`;
            }
            break;
        case "issue_submitted_for_review":
        case "issue_approved":
        case "issue_assigned":
        case "issue_status_changed":
            if (issueId) {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/issues/${encodeURIComponent(issueId)}`;
            }
            break;
        case "goal_submitted_for_review":
        case "goal_approved":
        case "goal_status_changed":
        case "goal_completed":
            if (goalId) {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/goals/${encodeURIComponent(goalId)}`;
            }
            break;
        case "event_invitation":
        case "event_submitted_for_review":
        case "event_approved":
        case "event_status_changed":
            if (eventId) {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/events/${encodeURIComponent(eventId)}`;
            }
            break;
        default:
            if (type.startsWith("task_") && taskId) {
                candidate = `/circles/${encodeURIComponent(circleHandle)}/tasks/${encodeURIComponent(taskId)}`;
            }
            break;
    }

    return resolveSafeNotificationUrl(candidate, INTERNAL_ORIGIN);
}

function getGenericPushBody(type: string, content: Record<string, unknown> | undefined): string {
    switch (type) {
        case "pm_received":
            return "You have a new direct message.";
        case "chat_mention":
            return "You were mentioned in a conversation.";
        case "circle_moderation_update":
            return "You have a Circle moderation update.";
        case "contact_request_received":
            return "You have a new contact request.";
        case "event_invitation":
            return "You have a new event invitation.";
        case "event_submitted_for_review":
            return "An event is ready for review.";
        case "event_approved":
            return "Your event was approved.";
        case "event_status_changed":
            return content?.eventNewStage === "cancelled"
                ? "An event you follow was cancelled."
                : "An event you follow was updated.";
        case "task_assigned":
            return "You were assigned a new task.";
        case "task_shift_confirmed":
            return "Your shift signup was confirmed.";
        case "task_shift_attendance_verified":
            return "Your shift attendance was verified.";
        case "task_shift_signup":
            return "Someone signed up for a shift.";
        case "task_changes_requested":
            return "Changes were requested on a task.";
        case "task_verified":
            return "A task was verified.";
        case "task_approved":
            return "A task was approved.";
        case "task_submitted_for_review":
            return "A task is ready for review.";
        case "task_claim_submitted":
            return "A task claim needs review.";
        case "task_claim_approved":
            return "Your task claim was approved.";
        case "task_claim_declined":
            return "Your task claim was declined.";
        case "task_accepted":
        case "task_status_changed":
            return "You have a task update.";
        case "secret_circle_invitation":
            return "You have received a private Circle invitation.";
        case "follow_request":
            return "You have a new follow request.";
        case "new_follower":
            return "You have a new follower.";
        case "follow_accepted":
        case "new_following":
        case "new_member":
            return "Your Circle access update is ready.";
        case "post_comment":
        case "comment_reply":
            return "You have a new comment reply.";
        case "post_mention":
        case "comment_mention":
            return "You were mentioned in a discussion.";
        case "post_like":
        case "comment_like":
            return "Someone reacted to your post.";
        case "proposal_submitted_for_review":
        case "proposal_moved_to_voting":
        case "proposal_approved_for_voting":
        case "proposal_resolved":
        case "proposal_resolved_voter":
        case "proposal_vote":
            return "You have a proposal update.";
        case "issue_submitted_for_review":
        case "issue_approved":
        case "issue_assigned":
        case "issue_status_changed":
            return "You have an issue update.";
        case "goal_submitted_for_review":
        case "goal_approved":
        case "goal_status_changed":
        case "goal_completed":
        case "proposal_to_goal":
            return "You have a goal update.";
        case "ranking_stale_reminder":
        case "ranking_grace_period_ended":
            return "Your ranking needs attention.";
        case "user_verified":
            return "Your Kamooni account has been verified.";
        case "user_verification_request":
        case "user_verification_clarification_requested":
        case "user_verification_reply_received":
        case "user_verification_rejected":
            return "You have an account verification update.";
        case "user_becomes_member":
            return "Your Kamooni membership was updated.";
        case "proof_of_humanity_verified":
            return "Your profile verification was updated.";
        default:
            return "You have a new update on Kamooni.";
    }
}

function getPushCollapseTag(
    notificationId: string,
    type: string,
    content: Record<string, unknown> | undefined,
): string {
    const roomId = asNonEmptyString(content?.roomId);
    if ((type === "pm_received" || type === "chat_mention" || type === "circle_moderation_update") && roomId) {
        return `chat:${roomId}`;
    }

    const eventId = asNonEmptyString(content?.eventId);
    if (type.startsWith("event_") && eventId) {
        return `event:${eventId}`;
    }

    const taskId = asNonEmptyString(content?.taskId);
    if (type.startsWith("task_") && taskId) {
        return `task:${taskId}`;
    }

    const invitationId = asNonEmptyString(content?.invitationId);
    if (type === "secret_circle_invitation" && invitationId) {
        return `secret-invite:${invitationId}`;
    }

    return notificationId;
}

/**
 * Builds a lock-screen-safe generic push payload with no message contents,
 * sender names, private Circle names, or secrets.
 */
export function buildGenericPushPayload({
    notificationId,
    type,
    content,
    recipientHandle,
}: {
    notificationId: string;
    type: string;
    content?: Record<string, unknown>;
    recipientHandle?: string;
}): PushNotificationPayload {
    return {
        notificationId,
        title: "Kamooni",
        body: getGenericPushBody(type, content),
        url: resolveNotificationRoutePath(type, content, recipientHandle),
        tag: getPushCollapseTag(notificationId, type, content),
    };
}
