// matrix-sync.tsx - Syncs the user's room events and messages from the Matrix server and stores them in local storage and global state
"use client";

import {
    latestMessagesAtom,
    unreadCountsAtom,
    roomDataAtom,
    userAtom,
    roomMessagesAtom,
    matrixUserCacheAtom,
    lastReadTimestampsAtom,
} from "@/lib/data/atoms";
import { RoomData, startSync } from "@/lib/data/client-matrix";
import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { fetchAndCacheMatrixUsers } from "./chat-room";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { getUserPrivateAction } from "../home/actions";

export const MatrixSync = () => {
    const [user, setUser] = useAtom(userAtom);
    const [unreadCounts, setUnreadCounts] = useAtom(unreadCountsAtom);
    const [latestMessages, setLatestMessages] = useAtom(latestMessagesAtom);
    const [roomData, setRoomData] = useAtom(roomDataAtom);
    const [roomMessages, setRoomMessages] = useAtom(roomMessagesAtom);
    const [lastReadTimestamps, setLastReadTimestamps] = useAtom(lastReadTimestampsAtom);
    const roomMessagesRef = useRef(roomMessages);
    const [matrixUserCache, setMatrixUserCache] = useAtom(matrixUserCacheAtom);
    const matrixUserCacheRef = useRef(matrixUserCache);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.MatrixSync.1");
        }
    }, []);

    useEffect(() => {
        roomMessagesRef.current = roomMessages;
    }, [roomMessages]);

    useEffect(() => {
        matrixUserCacheRef.current = matrixUserCache;
    }, [matrixUserCache]);

    const resetLocalStorage = () => {
        localStorage.removeItem("unreadCounts");
        localStorage.removeItem("latestMessages");
        localStorage.removeItem("roomData");
        localStorage.removeItem("roomMessages");
        localStorage.removeItem("lastReadTimestamps");
        localStorage.removeItem("syncToken");

        setUnreadCounts({});
        setLatestMessages({});
        setRoomData({});
        setRoomMessages({});
        setLastReadTimestamps({});
    };

    // Load stored state on mount
    useEffect(() => {
        // resetLocalStorage();
        const storedLatestMessages = localStorage.getItem("latestMessages");
        const storedRoomData = localStorage.getItem("roomData");
        const storedRoomMessages = localStorage.getItem("roomMessages");
        const storedLastReadTimestamps = localStorage.getItem("lastReadTimestamps");

        if (storedLatestMessages) setLatestMessages(JSON.parse(storedLatestMessages));
        if (storedRoomData) setRoomData(JSON.parse(storedRoomData));
        if (storedRoomMessages) setRoomMessages(JSON.parse(storedRoomMessages));
        if (storedLastReadTimestamps) setLastReadTimestamps(JSON.parse(storedLastReadTimestamps));
    }, [setLatestMessages, setUnreadCounts, setRoomData, setRoomMessages, setLastReadTimestamps]);

    // Persist state changes to localStorage
    useEffect(() => {
        localStorage.setItem("latestMessages", JSON.stringify(latestMessages));
    }, [latestMessages]);

    useEffect(() => {
        localStorage.setItem("roomData", JSON.stringify(roomData));
    }, [roomData]);

    useEffect(() => {
        localStorage.setItem("roomMessages", JSON.stringify(roomMessages));
    }, [roomMessages]);

    useEffect(() => {
        localStorage.setItem("lastReadTimestamps", JSON.stringify(lastReadTimestamps));
    }, [lastReadTimestamps]);

    // Recalculate unreadCounts whenever roomMessages or lastReadTimestamps change
    useEffect(() => {
        if (!Object.keys(roomMessages).length || !Object.keys(lastReadTimestamps).length) {
            console.log("🔄 [Unread] Waiting for hydration...");
            return; // Wait for hydration
        }

        console.log("🔄 [Unread] Recalculating unread counts...");
        console.log("🔄 [Unread] lastReadTimestamps:", lastReadTimestamps);

        const updatedUnreadCounts: Record<string, number> = {};

        for (const roomId of Object.keys(roomMessages)) {
            const messages = roomMessages[roomId] || [];
            const lastReadTimestamp = lastReadTimestamps[roomId] || 0;
            const isNotificationsRoom = roomId === user?.matrixNotificationsRoomId;

            console.log(`🔄 [Unread] Checking room: ${roomId} (${isNotificationsRoom ? "Notifications" : "Chat"})`);
            console.log(`🔄 [Unread] - Last read timestamp: ${new Date(lastReadTimestamp).toISOString()}`);
            console.log(`🔄 [Unread] - Total messages: ${messages.length}`);

            const unreadMessages = messages.filter((msg) => {
                // Get message timestamp in a consistent way
                const msgTimestamp =
                    msg.createdAt instanceof Date ? msg.createdAt.getTime() : new Date(msg.createdAt).getTime();

                const isUnread = msgTimestamp > lastReadTimestamp;
                const expectedSelfIdentifier = `@${user?.matrixUsername}:${process.env.NEXT_PUBLIC_MATRIX_DOMAIN}`;
                const isSelfMessage = msg.createdBy === expectedSelfIdentifier;

                if (isUnread) {
                    const timeAgo = Math.round((Date.now() - msgTimestamp) / 1000 / 60);
                    console.log(`🔄 [Unread] - Message ${msg.id.substring(0, 8)}...`);
                    console.log(`🔄 [Unread]   - Time: ${new Date(msgTimestamp).toISOString()} (${timeAgo} min ago)`);
                    console.log(`🔄 [Unread]   - From: ${msg.createdBy} (self: ${isSelfMessage})`);

                    if (msg.type === "m.room.message") {
                        const contentPreview =
                            typeof msg.content?.body === "string"
                                ? JSON.stringify(msg.content?.body).substring(0, 50)
                                : "N/A";
                        console.log(`🔄 [Unread]   - Content: ${contentPreview}...`);

                        const shouldCount = isNotificationsRoom || !isSelfMessage;
                        console.log(`🔄 [Unread]   - Count as unread: ${shouldCount}`);
                        return shouldCount;
                    }
                }
                return false;
            });

            updatedUnreadCounts[roomId] = unreadMessages.length;
            console.log(`🔄 [Unread] - Unread count for ${roomId}: ${unreadMessages.length} messages`);
        }

        console.log("🔄 [Unread] Final unread counts:", updatedUnreadCounts);
        setUnreadCounts(updatedUnreadCounts);
    }, [roomMessages, lastReadTimestamps, user?.matrixUsername, user?.matrixNotificationsRoomId, setUnreadCounts]);

    // Start the sync process
    useEffect(() => {
        if (!user?.matrixAccessToken) return;

        const handleSyncData = async (data: {
            rooms: Record<string, RoomData>;
            latestMessages: Record<string, any>;
            lastReadTimestamps: Record<string, number>;
        }) => {
            console.log("handleSyncData called");
            setLatestMessages((prev) => ({ ...prev, ...data.latestMessages }));
            setRoomData((prev) => ({ ...prev, ...data.rooms }));
            setLastReadTimestamps((prev) => ({ ...prev, ...data.lastReadTimestamps }));

            let newRoomFound = false;
            const newRoomMessages: Record<string, any[]> = {};
            for (const [roomId, roomData] of Object.entries(data.rooms)) {
                const timelineEvents = roomData.timeline?.events || [];
                const newUsernames = timelineEvents
                    .filter((event: any) => event.type === "m.room.message")
                    .map((event: any) => event.sender)
                    .filter((username: string) => !matrixUserCache[username]);

                const updatedCache = await fetchAndCacheMatrixUsers(
                    newUsernames,
                    matrixUserCacheRef.current,
                    setMatrixUserCache,
                );

                const messages = timelineEvents.map((event) => ({
                    id: event.event_id,
                    roomId,
                    createdBy: event.sender,
                    createdAt: new Date(event.origin_server_ts),
                    content: event.content,
                    type: event.type,
                    author: updatedCache[event.sender] || { name: event.sender },
                }));

                newRoomMessages[roomId] = [
                    ...(roomMessagesRef.current[roomId] || []),
                    ...messages.filter(
                        (msg) => !(roomMessagesRef.current[roomId] || []).some((existing) => existing.id === msg.id),
                    ),
                ];

                newRoomFound =
                    newRoomFound ||
                    (!user.chatRoomMemberships?.some((m) => m.chatRoom.matrixRoomId === roomId) &&
                        roomId !== user.matrixNotificationsRoomId);
            }

            if (newRoomFound) {
                console.warn("New room detected");
                let newUser = await getUserPrivateAction();
                if (newUser) {
                    setUser(newUser);
                }
            }

            setRoomMessages((prev) => ({ ...prev, ...newRoomMessages }));
        };

        startSync(user.matrixAccessToken, user.matrixUrl!, user.matrixUsername!, handleSyncData);
    }, [
        setLatestMessages,
        setUnreadCounts,
        setRoomData,
        setRoomMessages,
        setUser,
        user?.matrixAccessToken,
        user?.chatRoomMemberships,
        user?.matrixNotificationsRoomId,
        setMatrixUserCache,
        matrixUserCache,
        user?.matrixUsername,
        user?.matrixUrl,
        setLastReadTimestamps,
    ]);

    return null;
};
