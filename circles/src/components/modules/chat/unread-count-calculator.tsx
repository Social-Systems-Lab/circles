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

    useEffect(() => {
        if (!Object.keys(roomMessages).length) {
            setUnreadCounts({});
            return;
        }

        const updatedUnreadCounts: Record<string, number> = {};

        for (const roomId of Object.keys(roomMessages)) {
            const messages = roomMessages[roomId] || [];
            const lastReadTimestamp = lastReadTimestamps[roomId] || 0;

            const unreadMessages = messages.filter((msg) => {
                const msgTimestamp =
                    msg.createdAt instanceof Date ? msg.createdAt.getTime() : new Date(msg.createdAt).getTime();

                if (msgTimestamp <= lastReadTimestamp) return false;
                if (msg.type !== "m.room.message") return false;
                if (!msg.createdBy) return true;
                if (!user?.did) return true;
                return msg.createdBy !== user.did;
            });

            updatedUnreadCounts[roomId] = unreadMessages.length;
        }

        setUnreadCounts(updatedUnreadCounts);
    }, [roomMessages, lastReadTimestamps, user?.did, setUnreadCounts]);

    return null;
};
