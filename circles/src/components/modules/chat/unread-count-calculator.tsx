"use client";

import { useAtom } from "jotai";
import { useEffect } from "react";
import { roomMessagesAtom, lastReadTimestampsAtom, unreadCountsAtom, userAtom } from "@/lib/data/atoms";

/**
 * Lightweight component that calculates unread message counts
 * based on roomMessages and lastReadTimestamps
 */
export const UnreadCountCalculator = () => {
    const [roomMessages] = useAtom(roomMessagesAtom);
    const [lastReadTimestamps] = useAtom(lastReadTimestampsAtom);
    const [, setUnreadCounts] = useAtom(unreadCountsAtom);
    const [user] = useAtom(userAtom);

    // Recalculate unreadCounts whenever roomMessages or lastReadTimestamps change
    useEffect(() => {
        if (!Object.keys(roomMessages).length || !Object.keys(lastReadTimestamps).length) {
            console.log("🔔 [Unread] Waiting for hydration...");
            return; // Wait for hydration
        }

        console.log("🔔 [Unread] Recalculating unread counts...");
        console.log("🔔 [Unread] Room messages:", Object.keys(roomMessages));
        console.log("🔔 [Unread] Last read timestamps:", lastReadTimestamps);

        const updatedUnreadCounts: Record<string, number> = {};

        for (const roomId of Object.keys(roomMessages)) {
            const messages = roomMessages[roomId] || [];
            const lastReadTimestamp = lastReadTimestamps[roomId] || 0;
            const isNotificationsRoom = roomId === user?.matrixNotificationsRoomId;

            console.log(`🔔 [Unread] Checking room: ${roomId}`);
            console.log(`🔔 [Unread] - Last read timestamp: ${new Date(lastReadTimestamp).toISOString()}`);
            console.log(`🔔 [Unread] - Total messages: ${messages.length}`);

            const unreadMessages = messages.filter((msg) => {
                // Get message timestamp in a consistent way
                const msgTimestamp =
                    msg.createdAt instanceof Date ? msg.createdAt.getTime() : new Date(msg.createdAt).getTime();

                const isUnread = msgTimestamp > lastReadTimestamp;
                const expectedSelfIdentifier = `@${user?.matrixUsername}:${process.env.NEXT_PUBLIC_MATRIX_DOMAIN}`;
                const isSelfMessage = msg.createdBy === expectedSelfIdentifier;

                if (isUnread && msg.type === "m.room.message") {
                    console.log(`🔔 [Unread] - Unread message from ${msg.createdBy} at ${new Date(msgTimestamp).toISOString()}`);
                    const shouldCount = isNotificationsRoom || !isSelfMessage;
                    console.log(`🔔 [Unread] - Should count: ${shouldCount} (isNotificationsRoom: ${isNotificationsRoom}, isSelfMessage: ${isSelfMessage})`);
                    return shouldCount;
                }
                return false;
            });

            updatedUnreadCounts[roomId] = unreadMessages.length;
            console.log(`🔔 [Unread] - Unread count for ${roomId}: ${unreadMessages.length}`);
        }

        console.log("🔔 [Unread] Final unread counts:", updatedUnreadCounts);
        setUnreadCounts(updatedUnreadCounts);
    }, [roomMessages, lastReadTimestamps, user?.matrixUsername, user?.matrixNotificationsRoomId, setUnreadCounts]);

    return null;
};
