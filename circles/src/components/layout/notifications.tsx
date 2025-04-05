//notifications.tsx - Displays the user notifications
"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { userAtom, roomMessagesAtom, unreadCountsAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { timeSince } from "@/lib/utils";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { Circle, NotificationType, Post, Comment, Proposal, ProposalDisplay } from "@/models/models"; // Add Proposal, ProposalDisplay
import { CirclePicture } from "../modules/circles/circle-picture";
import { sendReadReceipt } from "@/lib/data/client-matrix";
import { MdOutlineArticle } from "react-icons/md";
import { Hammer } from "lucide-react"; // Gavel icon for proposals
import { AiFillHeart } from "react-icons/ai";

type Notification = {
    id: string;
    type: string;
    message: string;
    time: string;
    createdAt: Date;
    notificationType: NotificationType;
    circle?: Circle;
    user?: Circle;
    post?: Post;
    comment?: Comment;
    postId?: string;
    commentId?: string;
    reaction?: string;
    project?: Circle;
    projectId?: string;
    // Proposal fields
    proposal?: Proposal | ProposalDisplay;
    proposalId?: string;
    proposalName?: string;
    // For grouping purposes
    key?: string;
};

type GroupedNotification = {
    key: string;
    count: number;
    notificationType: NotificationType;
    latestNotification: Notification;
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
};

export const Notifications = () => {
    const [user, setUser] = useAtom(userAtom);
    const [roomMessages] = useAtom(roomMessagesAtom);
    const [unreadCounts, setUnreadCounts] = useAtom(unreadCountsAtom);
    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.Notifications.1");
        }
    }, []);

    // Get raw notifications
    const allNotifications = useMemo(() => {
        if (!user?.matrixNotificationsRoomId) return [];

        const notificationMsgs = roomMessages[user.matrixNotificationsRoomId] || [];
        return notificationMsgs
            .map((msg) => {
                // Generate grouping key based on notification type
                let groupKey = "";
                const createdAt = msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt);

                switch (msg.content?.notificationType) {
                    case "post_like":
                        groupKey = `post_like_${msg.content?.postId}`;
                        break;
                    case "comment_like":
                        groupKey = `comment_like_${msg.content?.commentId}`;
                        break;
                    case "post_comment":
                        groupKey = `post_comment_${msg.content?.postId}`;
                        break;
                    case "comment_reply":
                        groupKey = `comment_reply_${msg.content?.commentId}`;
                        break;
                    case "post_mention":
                        groupKey = `post_mention_${msg.content?.postId}`;
                        break;
                    case "comment_mention":
                        groupKey = `comment_mention_${msg.content?.commentId}`;
                        break;
                    // Proposal grouping
                    case "proposal_vote":
                        groupKey = `proposal_vote_${msg.content?.proposalId}`;
                        break;
                    default:
                        // For other proposal types and non-groupable notifications, use unique ID
                        groupKey = msg.id;
                }

                let notification: Notification = {
                    id: msg.id,
                    type: msg.type,
                    message: msg.content?.body || "New notification",
                    time: timeSince(createdAt, false),
                    createdAt: createdAt,
                    notificationType: msg.content?.notificationType,
                    circle: msg.content?.circle,
                    user: msg.content?.user,
                    post: msg.content?.post,
                    comment: msg.content?.comment,
                    postId: msg.content?.postId,
                    commentId: msg.content?.commentId,
                    reaction: msg.content?.reaction,
                    project: msg.content?.project,
                    projectId: msg.content?.projectId,
                    // Add proposal fields
                    proposal: msg.content?.proposal,
                    proposalId: msg.content?.proposalId,
                    proposalName: msg.content?.proposalName,
                    key: groupKey,
                };
                return notification;
            })
            .sort((a, b) => b?.createdAt?.getTime() - a?.createdAt?.getTime()); // Sort by newest first
    }, [user?.matrixNotificationsRoomId, roomMessages]);

    const notifications = useMemo(
        () => allNotifications.filter((msg) => msg.type === "m.room.message"),
        [allNotifications],
    );

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
                    relatedUsers: notification.user ? [notification.user] : [],
                    postId: notification.postId,
                    commentId: notification.commentId,
                    post: notification.post,
                    comment: notification.comment,
                    project: notification.project,
                    projectId: notification.projectId,
                    // Add proposal fields
                    proposal: notification.proposal,
                    proposalId: notification.proposalId,
                    proposalName: notification.proposalName,
                });
            }
        }

        // Convert map to array and sort by latest notification time
        return Array.from(groupMap.values()).sort(
            (a, b) => b.latestNotification.createdAt.getTime() - a.latestNotification.createdAt.getTime(),
        );
    }, [notifications]);

    const markLatestNotificationAsRead = useCallback(async () => {
        if (notifications.length > 0 && user?.matrixAccessToken) {
            // Use index 0 since array is sorted by newest first
            const latestNotification = notifications[0];

            console.log(`📩 [Notifications] Marking latest notification as read:`);
            console.log(`📩 [Notifications] - ID: ${latestNotification.id}`);
            console.log(`📩 [Notifications] - Message: ${latestNotification.message}`);
            console.log(`📩 [Notifications] - Type: ${latestNotification.notificationType}`);
            console.log(`📩 [Notifications] - Room ID: ${user.matrixNotificationsRoomId}`);

            await sendReadReceipt(
                user.matrixAccessToken,
                user.matrixUrl!,
                user.matrixNotificationsRoomId!,
                latestNotification.id,
            );

            console.log(`📩 [Notifications] Read receipt sent successfully`);

            // Reset unread count for notifications
            setUnreadCounts((counts) => {
                console.log(
                    `📩 [Notifications] Resetting unread count from ${counts[user.matrixNotificationsRoomId!] || 0} to 0`,
                );
                return {
                    ...counts,
                    [user.matrixNotificationsRoomId!]: 0,
                };
            });
        } else {
            console.log(`📩 [Notifications] No notifications to mark as read`);
            if (!user?.matrixAccessToken) {
                console.log(`📩 [Notifications] Missing Matrix access token`);
            }
        }
    }, [notifications, user?.matrixAccessToken, user?.matrixUrl, user?.matrixNotificationsRoomId, setUnreadCounts]);

    useEffect(() => {
        markLatestNotificationAsRead();
    }, [notifications, markLatestNotificationAsRead]);

    const handleNotificationClick = (groupedNotification: GroupedNotification) => {
        const notification = groupedNotification.latestNotification;
        const circleHandle = notification.circle?.handle || "default";

        switch (notification.notificationType) {
            // Original notification types
            case "follow_request":
                router.push(`/circles/${notification.circle?.handle}/settings/membership-requests`);
                break;
            case "new_follower":
                router.push(`/circles/${notification.user?.handle}`);
                break;
            case "follow_accepted":
                router.push(`/circles/${notification.circle?.handle}`);
                break;

            // Post-related notifications
            case "post_comment":
            case "post_like":
            case "post_mention":
                if (notification.postId) {
                    // Navigate to the dedicated post page
                    router.push(`/circles/${circleHandle}/post/${notification.postId}`);
                }
                break;

            // Comment-related notifications
            case "comment_reply":
            case "comment_like":
            case "comment_mention":
                if (notification.postId) {
                    // Navigate to the dedicated post page with comment id
                    // This will need to be enhanced to scroll to the specific comment
                    router.push(`/circles/${circleHandle}/post/${notification.postId}`);
                }
                break;

            // Proposal Notifications Navigation
            case "proposal_submitted_for_review":
            case "proposal_moved_to_voting":
            case "proposal_approved_for_voting":
            case "proposal_resolved":
            case "proposal_resolved_voter":
            case "proposal_vote":
                if (notification.proposalId) {
                    router.push(`/circles/${circleHandle}/proposals/${notification.proposalId}`);
                }
                break;

            default:
                // Ensure exhaustive check or provide a default behavior
                const exhaustiveCheck: never = notification.notificationType;
                console.log("Unknown notification type:", exhaustiveCheck);
                break;
        }
    };

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
                return `${userList} liked your post`;

            case "comment_like":
                return `${userList} liked your comment`;

            case "post_comment":
                return `${userList} commented on your post`;

            case "comment_reply":
                return `${userList} replied to your comment`;

            case "post_mention":
                return `${userList} mentioned you in a post`;

            case "comment_mention":
                return `${userList} mentioned you in a comment`;

            // Proposal Grouped Messages
            case "proposal_vote":
                return `${userList} voted on your proposal "${groupedNotification.latestNotification.proposalName || "a proposal"}"`;

            // For non-grouped or single proposal notifications, use the original message
            // (especially important for resolved notifications with specific reasons)
            default:
                return groupedNotification.latestNotification.message;
        }
    };

    return (
        <div>
            {groupedNotifications.length > 0 ? (
                groupedNotifications.map((groupedNotification) => (
                    <div
                        key={groupedNotification.key}
                        className={`m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100`}
                        onClick={() => handleNotificationClick(groupedNotification)}
                    >
                        <div className="relative h-[40px] w-[40px]">
                            {/* Different layouts based on notification type */}
                            {["post_comment", "comment_reply", "post_mention", "comment_mention"].includes(
                                groupedNotification.latestNotification.notificationType,
                            ) ||
                            // Add proposal types that involve a user action
                            ["proposal_vote", "proposal_submitted_for_review"].includes(
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

                                    {/* Post/Proposal icon in bottom-right position */}
                                    <div className="absolute bottom-0 right-0 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-gray-100">
                                        {["post_comment", "comment_reply", "post_mention", "comment_mention"].includes(
                                            groupedNotification.latestNotification.notificationType,
                                        ) ? (
                                            <MdOutlineArticle size="14px" />
                                        ) : (
                                            <Hammer size="14px" /> // Gavel for proposals
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
                    </div>
                ))
            ) : (
                <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                    No notifications
                </div>
            )}
        </div>
    );
};
