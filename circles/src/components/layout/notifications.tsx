//notifications.tsx - Displays the user notifications
"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { userAtom, roomMessagesAtom, unreadCountsAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { timeSince } from "@/lib/utils";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { Circle, NotificationType } from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import { sendReadReceipt } from "@/lib/data/client-matrix";

type Notification = {
    id: string;
    message: string;
    time: string;
    notificationType: NotificationType;
    circle?: Circle;
    user?: Circle;
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

    const notifications = useMemo(() => {
        if (!user?.matrixNotificationsRoomId) return [];

        const notificationMsgs = roomMessages[user.matrixNotificationsRoomId] || [];
        return notificationMsgs
            .filter((msg) => msg.type === "m.room.message") // consider only message events
            .map((msg) => {
                let notification: Notification = {
                    id: msg.id,
                    message: msg.content?.body || "New notification",
                    time: timeSince(msg.createdAt, false),
                    notificationType: msg.content?.notificationType,
                    circle: msg.content?.circle,
                    user: msg.content?.user,
                };
                return notification;
            })
            .reverse(); // reverse to show the newest on top if you like
    }, [user?.matrixNotificationsRoomId, roomMessages]);

    const markLatestNotificationAsRead = useCallback(async () => {
        if (notifications.length > 0 && user?.matrixAccessToken) {
            const latestNotification = notifications[notifications.length - 1];
            await sendReadReceipt(
                user.matrixAccessToken,
                user.matrixUrl!,
                user.matrixNotificationsRoomId!,
                latestNotification.id,
            );

            // Reset unread count for notifications
            setUnreadCounts((counts) => ({
                ...counts,
                [user.matrixNotificationsRoomId!]: 0,
            }));
        }
    }, [notifications, user?.matrixAccessToken, user?.matrixUrl, user?.matrixNotificationsRoomId, setUnreadCounts]);

    useEffect(() => {
        markLatestNotificationAsRead();
    }, [notifications, markLatestNotificationAsRead]);

    const handleNotificationClick = (notification: Notification) => {
        if (notification.message.includes("requested to join")) {
            router.push(`/circles/${notification.circle?.handle}/settings/membership-requests`);
        }
    };

    return (
        <div>
            {notifications.length > 0 ? (
                notifications.map((notification) => (
                    <div
                        key={notification.id}
                        className={`m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100`}
                        onClick={() => handleNotificationClick(notification)}
                    >
                        <div className="relative h-[40px] w-[40px]">
                            <CirclePicture
                                circle={notification.circle!}
                                size="30px"
                                className="absolute left-0 top-0"
                            />
                            <CirclePicture
                                circle={notification.user!}
                                size="30px"
                                className="absolute bottom-0 right-0"
                            />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm">{notification.message}</p>
                            <p className="text-xs text-muted-foreground">{notification.time}</p>
                        </div>
                    </div>
                ))
            ) : (
                <div className="flex h-full items-center justify-center pt-4 text-sm text-[#4d4d4d]">
                    No notifications
                </div>
            )}
            {/* <pre>
                {JSON.stringify({ notifications, matrixNotificationsRoomId: user?.matrixNotificationsRoomId }, null, 2)}
            </pre> */}
        </div>
    );
};
