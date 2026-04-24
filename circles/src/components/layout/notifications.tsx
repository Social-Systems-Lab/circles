//notifications.tsx - Displays the user notifications
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { notificationUnreadCountAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { timeSince } from "@/lib/utils";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import {
    Circle,
    NotificationType,
    Post,
    Comment,
    Proposal,
    ProposalDisplay,
    IssueDisplay,
    IssueStage,
    TaskDisplay, // Added TaskDisplay
    TaskStage,
    GoalDisplay,
    GoalStage, // Added TaskStage
    Event,
} from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import { MdOutlineArticle } from "react-icons/md";
import { Hammer, AlertCircle } from "lucide-react"; // Gavel icon for proposals, AlertCircle for issues
import { AiFillHeart } from "react-icons/ai";
import { Button } from "../ui/button";

type Notification = {
    id: string;
    type: string;
    message: string;
    url?: string;
    time: string;
    createdAt: Date;
    isRead: boolean;
    notificationType: NotificationType;
    circle?: Circle;
    user?: Circle;
    post?: Post;
    comment?: Comment;
    postId?: string;
    commentId?: string;
    reaction?: string;
    roomId?: string;
    project?: Circle;
    projectId?: string;
    // Proposal fields
    proposalId?: string;
    proposalName?: string;
    // Issue fields
    issue?: IssueDisplay;
    issueId?: string;
    issueTitle?: string;
    previousStage?: IssueStage; // Keep for issues
    newStage?: IssueStage; // Keep for issues
    // Task fields (mirroring Issue fields)
    task?: TaskDisplay;
    taskId?: string;
    taskTitle?: string;
    previousTaskStage?: TaskStage;
    newTaskStage?: TaskStage;
    // Goal fields (mirroring Issue fields)
    goal?: GoalDisplay;
    goalId?: string;
    goalTitle?: string;
    previousGoalStage?: GoalStage;
    newGoalStage?: GoalStage;
    // Event fields
    eventId?: string;
    eventName?: string;
    // For grouping purposes
    key?: string;
};

type GroupedNotification = {
    key: string;
    count: number;
    notificationType: NotificationType;
    latestNotification: Notification;
    notificationIds: string[];
    unreadNotificationIds: string[];
    relatedUsers: Circle[];
    postId?: string;
    commentId?: string;
    post?: Post;
    comment?: Comment;
    project?: Circle;
    projectId?: string;
    proposal?: Proposal | ProposalDisplay;
    proposalId?: string;
    proposalName?: string;
    // Issue fields
    issue?: IssueDisplay;
    issueId?: string;
    issueTitle?: string;
    // Task fields (mirroring Issue fields)
    task?: TaskDisplay;
    taskId?: string;
    taskTitle?: string;
    // Goal fields (mirroring Issue fields)
    goal?: GoalDisplay;
    goalId?: string;
    goalTitle?: string;
    // Event fields
    eventId?: string;
    eventName?: string;
};

type StoredNotificationRecord = {
    _id: string;
    type: string;
    content: Record<string, any>;
    isRead: boolean;
    createdAt: string | Date;
};

export const Notifications = ({ onNavigate }: { onNavigate?: () => void }) => {
    const [user] = useAtom(userAtom);
    const [, setNotificationUnreadCount] = useAtom(notificationUnreadCountAtom);
    const [records, setRecords] = useState<StoredNotificationRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);
    const [isClearingRead, setIsClearingRead] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.Notifications.1");
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (!user?.did) {
            setRecords([]);
            setNotificationUnreadCount(0);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch("/api/notifications?limit=50", { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Failed to fetch notifications (${response.status})`);
            }

            const data = await response.json();
            setRecords(Array.isArray(data.notifications) ? data.notifications : []);
            setNotificationUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
            setIsLoading(false);
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
            setIsLoading(false);
        }
    }, [setNotificationUnreadCount, user?.did]);

    useEffect(() => {
        void fetchNotifications();
    }, [fetchNotifications]);

    useEffect(() => {
        if (!user?.did) return;

        const intervalId = window.setInterval(() => {
            void fetchNotifications();
        }, 15000);

        return () => window.clearInterval(intervalId);
    }, [fetchNotifications, user?.did]);

    const notifications = useMemo(() => {
        return records
            .reduce((acc: Notification[], record) => {
                const content = record.content;
                if (!content || typeof content !== "object") {
                    return acc;
                }

                const notificationType = record.type as NotificationType;
                const createdAt = record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt);

                let groupKey = "";
                switch (notificationType) {
                    case "post_like":
                        groupKey = `post_like_${content.postId}`;
                        break;
                    case "comment_like":
                        groupKey = `comment_like_${content.commentId}`;
                        break;
                    case "post_comment":
                        groupKey = `post_comment_${content.postId}`;
                        break;
                    case "comment_reply":
                        groupKey = `comment_reply_${content.commentId}`;
                        break;
                    case "post_mention":
                        groupKey = `post_mention_${content.postId}`;
                        break;
                    case "comment_mention":
                        groupKey = `comment_mention_${content.commentId}`;
                        break;
                    case "proposal_vote":
                        groupKey = `proposal_vote_${content.proposalId}`;
                        break;
                    case "event_invitation":
                        groupKey = `event_invitation_${content.eventId}`;
                        break;
                    case "pm_received":
                        groupKey = `pm_received_${content.roomId || record._id}`;
                        break;
                    default:
                        groupKey = record._id;
                }

                const notification: Notification = {
                    id: record._id,
                    type: record.type,
                    message: content.body || "New notification",
                    url: typeof content.url === "string" ? content.url : undefined,
                    time: timeSince(createdAt, false),
                    createdAt,
                    isRead: !!record.isRead,
                    notificationType,
                    circle: content.circle,
                    user: content.user,
                    post: content.post,
                    comment: content.comment,
                    postId: content.postId,
                    commentId: content.commentId,
                    reaction: content.reaction,
                    roomId: content.roomId,
                    project: content.project,
                    projectId: content.projectId,
                    proposalId: content.proposalId,
                    proposalName: content.proposalName,
                    issue: content.issue,
                    issueId: content.issueId,
                    issueTitle: content.issueTitle,
                    previousStage: content.previousStage,
                    newStage: content.newStage,
                    task: content.task,
                    taskId: content.taskId,
                    taskTitle: content.taskTitle,
                    previousTaskStage: content.previousTaskStage,
                    newTaskStage: content.newTaskStage,
                    goal: content.goal,
                    goalId: content.goalId,
                    goalTitle: content.goalTitle,
                    previousGoalStage: content.previousGoalStage,
                    newGoalStage: content.newGoalStage,
                    eventId: content.eventId,
                    eventName: content.eventName,
                    key: groupKey,
                };

                acc.push(notification);
                return acc;
            }, [])
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }, [records]);

    // Group similar notifications
    const groupedNotifications = useMemo(() => {
        const groupMap = new Map<string, GroupedNotification>();

        // Group notifications by key
        for (const notification of notifications) {
            // Skip notifications without grouping key
            if (!notification.key) continue;

            if (groupMap.has(notification.key)) {
                // Update existing group
                const group = groupMap.get(notification.key)!;
                group.count++;
                group.notificationIds.push(notification.id);
                if (!notification.isRead) {
                    group.unreadNotificationIds.push(notification.id);
                }

                // Use more recent notification if needed
                if (notification.createdAt > group.latestNotification.createdAt) {
                    group.latestNotification = notification;
                }

                // Add user to related users list if not already there
                if (notification.user && !group.relatedUsers.some((u) => u.did === notification.user?.did)) {
                    group.relatedUsers.push(notification.user);
                }
            } else {
                // Create new group
                groupMap.set(notification.key, {
                    key: notification.key,
                    count: 1,
                    notificationType: notification.notificationType,
                    latestNotification: notification,
                    notificationIds: [notification.id],
                    unreadNotificationIds: notification.isRead ? [] : [notification.id],
                    relatedUsers: notification.user ? [notification.user] : [],
                    postId: notification.postId,
                    commentId: notification.commentId,
                    post: notification.post,
                    comment: notification.comment,
                    project: notification.project,
                    projectId: notification.projectId,
                    // Add proposal fields
                    proposalId: notification.proposalId,
                    proposalName: notification.proposalName,
                    // Add issue fields
                    issue: notification.issue,
                    issueId: notification.issueId,
                    issueTitle: notification.issueTitle,
                    // Add task fields
                    task: notification.task,
                    taskId: notification.taskId,
                    taskTitle: notification.taskTitle,
                    // Add goal fields
                    goal: notification.goal,
                    goalId: notification.goalId,
                    goalTitle: notification.goalTitle,
                    // Add event fields
                    eventId: notification.eventId,
                    eventName: notification.eventName,
                });
            }
        }

        // Convert map to array and sort by latest notification time
        return Array.from(groupMap.values()).sort(
            (a, b) => b.latestNotification.createdAt.getTime() - a.latestNotification.createdAt.getTime(),
        );
    }, [notifications]);

    const hasUnreadNotifications = useMemo(
        () => groupedNotifications.some((groupedNotification) => groupedNotification.unreadNotificationIds.length > 0),
        [groupedNotifications],
    );

    const markNotificationGroupAsRead = useCallback(
        async (groupedNotification: GroupedNotification) => {
            if (!groupedNotification.unreadNotificationIds.length) {
                return;
            }

            const unreadIds = groupedNotification.unreadNotificationIds;
            setRecords((prevRecords) =>
                prevRecords.map((record) =>
                    unreadIds.includes(record._id)
                        ? {
                              ...record,
                              isRead: true,
                          }
                        : record,
                ),
            );
            setNotificationUnreadCount((count) => Math.max(0, count - unreadIds.length));

            try {
                await Promise.all(
                    unreadIds.map((notificationId) =>
                        fetch("/api/notifications/mark-as-read", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ notificationId }),
                        }),
                    ),
                );
            } catch (error) {
                console.error("Failed to mark notification group as read:", error);
                void fetchNotifications();
            }
        },
        [fetchNotifications, setNotificationUnreadCount],
    );

    const markAllNotificationsAsRead = useCallback(async () => {
        if (!hasUnreadNotifications || isMarkingAllAsRead) {
            return;
        }

        setIsMarkingAllAsRead(true);
        setRecords((prevRecords) =>
            prevRecords.map((record) =>
                record.isRead
                    ? record
                    : {
                          ...record,
                          isRead: true,
                      },
            ),
        );
        setNotificationUnreadCount(0);

        try {
            const response = await fetch("/api/notifications/mark-all-read", {
                method: "POST",
            });
            if (!response.ok) {
                throw new Error(`Failed to mark all notifications as read (${response.status})`);
            }
        } catch (error) {
            console.error("Failed to mark all notifications as read:", error);
            void fetchNotifications();
        } finally {
            setIsMarkingAllAsRead(false);
        }
    }, [fetchNotifications, hasUnreadNotifications, isMarkingAllAsRead, setNotificationUnreadCount]);

    const clearReadNotifications = useCallback(async () => {
        if (isClearingRead) return;

        setIsClearingRead(true);

        // Optimistic UI: remove read notifications
        setRecords(prev => prev.filter(r => !r.isRead));

        try {
            const res = await fetch("/api/notifications/clear-read", {
                method: "POST",
            });

            if (!res.ok) throw new Error("Failed to clear read notifications");
        } catch (err) {
            console.error(err);
            void fetchNotifications();
        } finally {
            setIsClearingRead(false);
        }
    }, [fetchNotifications, isClearingRead]);

    const getNotificationHref = useCallback(
        (notification: Notification): string | null => {
            if (notification.url) {
                return notification.url;
            }

            const circleHandle = notification.circle?.handle || "default";

            const getParentItemUrl = (notif: Notification): string | null => {
                const type = notif.post?.parentItemType;
                const id = notif.post?.parentItemId;
                const handle = notif.circle?.handle || circleHandle;

                if (type && id && handle) {
                    const typePlural = type === "issue" ? "issues" : `${type}s`;
                    return `/circles/${handle}/${typePlural}/${id}`;
                }
                return null;
            };

            switch (notification.notificationType) {
                case "follow_request":
                    return notification.circle?.handle
                        ? `/circles/${notification.circle.handle}/settings/membership-requests`
                        : null;
                case "new_follower":
                    return notification.user?.handle ? `/circles/${notification.user.handle}` : null;
                case "follow_accepted":
                    return notification.circle?.handle ? `/circles/${notification.circle.handle}` : null;
                case "user_verified":
                case "user_verification_clarification_requested":
                case "user_verification_rejected":
                    return user?.handle ? `/circles/${user.handle}/settings/subscription` : `/`;
                case "user_verification_request":
                case "user_verification_reply_received":
                    return `/admin`;
                case "pm_received":
                    return notification.roomId ? `/chat/${notification.roomId}` : null;
                case "contact_request_received":
                    return notification.user?.handle ? `/circles/${notification.user.handle}` : null;
                case "post_comment":
                case "comment_reply":
                case "post_like":
                case "comment_like":
                case "post_mention":
                case "comment_mention":
                    return getParentItemUrl(notification) ||
                        (notification.postId ? `/circles/${circleHandle}/post/${notification.postId}` : null);
                case "proposal_submitted_for_review":
                case "proposal_moved_to_voting":
                case "proposal_approved_for_voting":
                case "proposal_resolved":
                case "proposal_resolved_voter":
                case "proposal_vote":
                    return notification.proposalId ? `/circles/${circleHandle}/proposals/${notification.proposalId}` : null;
                case "issue_submitted_for_review":
                case "issue_approved":
                case "issue_assigned":
                case "issue_status_changed":
                    return notification.issueId ? `/circles/${circleHandle}/issues/${notification.issueId}` : null;
                case "task_submitted_for_review":
                case "task_changes_requested":
                case "task_verified":
                case "task_approved":
                case "task_assigned":
                case "task_accepted":
                case "task_shift_signup":
                case "task_shift_confirmed":
                case "task_status_changed":
                    return notification.taskId ? `/circles/${circleHandle}/tasks/${notification.taskId}` : null;
                case "goal_submitted_for_review":
                case "goal_approved":
                case "goal_status_changed":
                    return notification.goalId ? `/circles/${circleHandle}/goals/${notification.goalId}` : null;
                case "event_invitation":
                    return notification.eventId ? `/circles/${circleHandle}/events/${notification.eventId}` : null;
                default:
                    return null;
            }
        },
        [user?.handle],
    );

    const getNotificationActionLabel = useCallback((groupedNotification: GroupedNotification) => {
        const notification = groupedNotification.latestNotification;
        const href = getNotificationHref(notification);

        if (!href) {
            return null;
        }

        switch (notification.notificationType) {
            case "pm_received":
                return "Reply";
            case "task_assigned":
            case "task_shift_signup":
                return "Review";
            case "user_verification_request":
            case "user_verification_reply_received":
                return "Review";
            case "user_verification_clarification_requested":
                return "Respond";
            case "task_shift_confirmed":
                return "Open";
            case "task_accepted":
                return "View";
            case "task_changes_requested":
            case "task_verified":
            case "post_comment":
            case "comment_reply":
            case "post_mention":
            case "comment_mention":
            case "task_status_changed":
            case "task_approved":
            case "task_submitted_for_review":
            case "task_changes_requested":
            case "task_verified":
            case "issue_assigned":
            case "issue_status_changed":
            case "issue_approved":
            case "issue_submitted_for_review":
            case "goal_status_changed":
            case "goal_approved":
            case "goal_submitted_for_review":
            case "proposal_submitted_for_review":
            case "proposal_moved_to_voting":
            case "proposal_approved_for_voting":
            case "proposal_resolved":
                return "View";
            default:
                return null;
        }
    }, [getNotificationHref]);

    const handleNotificationClick = useCallback(async (groupedNotification: GroupedNotification) => {
        await markNotificationGroupAsRead(groupedNotification);
        if (onNavigate) {
            onNavigate();
        }

        const href = getNotificationHref(groupedNotification.latestNotification);
        if (href) {
            router.push(href);
            return;
        }

        console.log("Unknown notification type:", groupedNotification.latestNotification.notificationType);
    }, [getNotificationHref, markNotificationGroupAsRead, onNavigate, router]);

    // Helper function to create a grouped notification message
    const createGroupedMessage = (groupedNotification: GroupedNotification) => {
        const { notificationType, count, relatedUsers } = groupedNotification;

        if (count === 1) {
            // For single notifications, use the original message
            return groupedNotification.latestNotification.message;
        }

        // Create a list of user names (limited to 3)
        const userNames = relatedUsers.slice(0, 3).map((user) => user.name);
        const remainingUsers = relatedUsers.length - 3;

        let userList = "";
        if (userNames.length === 1) {
            userList = userNames[0] ?? "";
        } else if (userNames.length === 2) {
            userList = `${userNames[0]} and ${userNames[1]}`;
        } else {
            userList = `${userNames[0]}, ${userNames[1]}, and ${userNames[2]}`;
            if (remainingUsers > 0) {
                userList += ` and ${remainingUsers} other${remainingUsers > 1 ? "s" : ""}`;
            }
        }

        // Create appropriate message based on notification type
        switch (notificationType) {
            case "post_like":
                // Check if it's a like on a parent item's shadow post
                if (groupedNotification.post?.postType && groupedNotification.post.parentItemType) {
                    const itemType = groupedNotification.post.parentItemType;
                    const itemTitle =
                        groupedNotification[`${itemType}Title` as keyof typeof groupedNotification] || `a ${itemType}`;
                    return `${userList} liked the ${itemType}: "${itemTitle}"`; // Message doesn't imply ownership
                }
                return `${userList} liked your noticeboard post`; // Fallback

            case "comment_like":
                // Check if it's a like on a parent item's comment
                if (groupedNotification.post?.parentItemType) {
                    // Check parentItemType directly
                    const itemType = groupedNotification.post.parentItemType;
                    // Access specific title field based on type
                    const itemTitle =
                        groupedNotification.goalTitle ||
                        groupedNotification.taskTitle ||
                        groupedNotification.issueTitle ||
                        groupedNotification.proposalName || // Use proposalName
                        `a ${itemType}`;
                    return `${userList} liked a comment on the ${itemType}: "${itemTitle}"`;
                }
                return `${userList} liked your comment`; // Fallback

            case "post_comment":
                // Check if it's a comment on a parent item
                if (groupedNotification.post?.postType && groupedNotification.post.parentItemType) {
                    const itemType = groupedNotification.post.parentItemType;
                    const itemTitle =
                        groupedNotification[`${itemType}Title` as keyof typeof groupedNotification] || `a ${itemType}`;
                    // TODO: Differentiate message if recipient is assignee vs author?
                    return `${userList} commented on the ${itemType}: "${itemTitle}"`;
                }
                return `${userList} commented on your noticeboard post`; // Fallback

            case "comment_reply":
                // Check if it's a reply on a parent item's comment thread
                if (groupedNotification.post?.postType && groupedNotification.post.parentItemType) {
                    const itemType = groupedNotification.post.parentItemType;
                    const itemTitle =
                        groupedNotification[`${itemType}Title` as keyof typeof groupedNotification] || `a ${itemType}`;
                    return `${userList} replied to a comment on the ${itemType}: "${itemTitle}"`;
                }
                return `${userList} replied to your comment`; // Fallback

            case "post_mention":
                // Check if it's a mention in a parent item's shadow post
                if (groupedNotification.post?.postType && groupedNotification.post.parentItemType) {
                    const itemType = groupedNotification.post.parentItemType;
                    const itemTitle =
                        groupedNotification[`${itemType}Title` as keyof typeof groupedNotification] || `a ${itemType}`;
                    return `${userList} mentioned you in the ${itemType}: "${itemTitle}"`;
                }
                return `${userList} mentioned you in a noticeboard post`; // Fallback

            case "comment_mention":
                // Check if it's a mention in a parent item's comment
                if (groupedNotification.post?.parentItemType) {
                    // Check parentItemType directly
                    const itemType = groupedNotification.post.parentItemType;
                    // Access specific title field based on type
                    const itemTitle =
                        groupedNotification.goalTitle ||
                        groupedNotification.taskTitle ||
                        groupedNotification.issueTitle ||
                        groupedNotification.proposalName || // Use proposalName
                        `a ${itemType}`;
                    return `${userList} mentioned you in a comment on the ${itemType}: "${itemTitle}"`;
                }
                return `${userList} mentioned you in a comment`; // Fallback

            // Proposal Grouped Messages
            case "proposal_vote":
                return `${userList} voted on your proposal "${groupedNotification.latestNotification.proposalName || "a proposal"}"`;

            // For non-grouped or single proposal notifications, use the original message
            // Issue Grouped Messages (if needed - for now, use default)
            case "issue_submitted_for_review":
            case "issue_approved":
            case "issue_assigned":
            case "issue_status_changed":
            case "task_submitted_for_review":
            case "task_changes_requested":
            case "task_verified":
            case "task_approved":
            case "task_assigned":
            case "task_accepted":
            case "task_shift_signup":
            case "task_shift_confirmed":
            case "task_status_changed":
                // For now, issue notifications aren't grouped, so use original message
                return groupedNotification.latestNotification.message;

            // For non-grouped or single proposal/issue notifications, use the original message
            case "event_invitation":
                return `${userList} invited you to the event "${groupedNotification.latestNotification.eventName || "an event"}"`;
            case "pm_received":
                return count > 1
                    ? `${userList} sent you ${count} messages`
                    : groupedNotification.latestNotification.message;
            default:
                return groupedNotification.latestNotification.message;
        }
    };

    return (
        <div className={isLoading ? "opacity-70 transition-opacity" : ""}>
            {groupedNotifications.length > 0 ? (
                <>
                    <div className="mb-1 flex items-center justify-end px-2 pt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => void markAllNotificationsAsRead()}
                            disabled={!hasUnreadNotifications || isMarkingAllAsRead}
                        >
                            {isMarkingAllAsRead ? "Marking..." : "Mark all as read"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => void clearReadNotifications()}
                            disabled={isClearingRead}
                        >
                            {isClearingRead ? "Clearing..." : "Clear read"}
                        </Button>
                    </div>
                    {groupedNotifications.map((groupedNotification) => (
                        <div
                            key={groupedNotification.key}
                            className={`m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100 ${
                                groupedNotification.unreadNotificationIds.length > 0 ? "bg-gray-50" : ""
                            }`}
                            onClick={() => void handleNotificationClick(groupedNotification)}
                        >
                            <div className="relative h-[40px] w-[40px]">
                                {/* Different layouts based on notification type */}
                                {["post_comment", "comment_reply", "post_mention", "comment_mention"].includes(
                                    groupedNotification.latestNotification.notificationType,
                                ) ||
                                // Add proposal/issue types that involve a user action
                                [
                                    "proposal_vote",
                                    "proposal_submitted_for_review",
                                    "issue_submitted_for_review", // Add issue types
                                    "issue_approved",
                                    "issue_assigned",
                                    "issue_status_changed",
                                    "task_submitted_for_review",
                                    "task_changes_requested",
                                    "task_verified",
                                    "task_approved",
                                    "task_assigned",
                                    "task_accepted",
                                    "task_shift_signup",
                                    "task_shift_confirmed",
                                    "task_status_changed",
                                ].includes(groupedNotification.latestNotification.notificationType) ? (
                                    <>
                                        {/* Show triggering user picture in the center */}
                                        {groupedNotification.latestNotification.user && (
                                            <CirclePicture
                                                circle={groupedNotification.latestNotification.user}
                                                size="34px"
                                            />
                                        )}

                                        {/* Post/Proposal icon in bottom-right position */}
                                        <div className="absolute bottom-0 right-0 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-gray-100">
                                            {["post_comment", "comment_reply", "post_mention", "comment_mention"].includes(
                                                groupedNotification.latestNotification.notificationType,
                                            ) ? (
                                                <MdOutlineArticle size="14px" />
                                            ) : ["proposal_vote", "proposal_submitted_for_review"].includes(
                                                  groupedNotification.latestNotification.notificationType,
                                              ) ? (
                                                <Hammer size="14px" /> // Gavel for proposals
                                            ) : (
                                                <AlertCircle size="14px" /> // Alert for issues
                                            )}
                                        </div>
                                    </>
                                ) : ["post_like", "comment_like"].includes(
                                      groupedNotification.latestNotification.notificationType,
                                  ) ? (
                                    <>
                                        {/* Show triggering user picture in the center */}
                                        {groupedNotification.latestNotification.user && (
                                            <CirclePicture
                                                circle={groupedNotification.latestNotification.user}
                                                size="34px"
                                            />
                                        )}

                                        {/* Heart icon in bottom-right position */}
                                        <div className="absolute bottom-0 right-0 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-gray-100">
                                            <AiFillHeart className="fill-[#ff4772] stroke-[#ff4772]" size="14px" />
                                        </div>
                                    </>
                                ) : (
                                    // Default layout (e.g., follow requests, proposal status changes)
                                    <>
                                        {/* Show circle picture */}
                                        {groupedNotification.latestNotification.circle && (
                                            <CirclePicture
                                                circle={groupedNotification.latestNotification.circle}
                                                size="30px"
                                                className="absolute left-0 top-0"
                                            />
                                        )}

                                        {/* Show user picture if available */}
                                        {groupedNotification.latestNotification.user && (
                                            <CirclePicture
                                                circle={groupedNotification.latestNotification.user}
                                                size="30px"
                                                className={
                                                    groupedNotification.latestNotification.circle
                                                        ? "absolute bottom-0 right-0"
                                                        : "absolute left-0 top-0"
                                                }
                                            />
                                        )}
                                    </>
                                )}

                                {/* Show count badge for grouped notifications */}
                                {groupedNotification.count > 1 && (
                                    <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                                        {groupedNotification.count}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm">{createGroupedMessage(groupedNotification)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {timeSince(groupedNotification.latestNotification.createdAt, false)}
                                </p>
                            </div>

                            {getNotificationActionLabel(groupedNotification) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void handleNotificationClick(groupedNotification);
                                    }}
                                    className="ml-2 rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                                >
                                    {getNotificationActionLabel(groupedNotification)}
                                </button>
                            )}
                            {groupedNotification.unreadNotificationIds.length > 0 && (
                                <div className="ml-2 h-2 w-2 rounded-full bg-blue-500" />
                            )}
                        </div>
                    ))}
                </>
            ) : isLoading ? (
                <div className="space-y-2 p-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="m-1 flex items-center space-x-4 rounded-lg p-2">
                            <div className="h-[40px] w-[40px] animate-pulse rounded-full bg-gray-200" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                                <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
                    All caught up ✨
                </div>
            )}
        </div>
    );
};
