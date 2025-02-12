//notifications.tsx - Displays the user notifications
"use client";

import React, { useEffect, useMemo } from "react";
import { userAtom, roomMessagesAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { timeSince } from "@/lib/utils";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

type Notification = {
    id: number;
    message: string;
    time: string;
};

export const Notifications = () => {
    const [user, setUser] = useAtom(userAtom);
    const [roomMessages] = useAtom(roomMessagesAtom);
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
                return {
                    id: msg.id,
                    message: msg.content?.body || "New notification",
                    time: timeSince(msg.createdAt, false),
                };
            })
            .reverse(); // reverse to show the newest on top if you like
    }, [user?.matrixNotificationsRoomId, roomMessages]);

    return (
        <div>
            {notifications.length > 0 ? (
                notifications.map((notification) => (
                    <div key={notification.id} className="m-1 cursor-pointer rounded-lg p-2 hover:bg-gray-100">
                        <p className="text-sm">{notification.message}</p>
                        <p className="text-xs text-muted-foreground">{notification.time}</p>
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
