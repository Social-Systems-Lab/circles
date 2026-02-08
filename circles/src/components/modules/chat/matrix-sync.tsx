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
import { RoomData, startSync, fetchRoomMessages } from "@/lib/data/client-matrix";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAndCacheMatrixUsers } from "./chat-room";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { getUserPrivateAction } from "../home/actions";
import { usePathname } from "next/navigation";

const parseEnvFlag = (value?: string) => {
    if (value === undefined || value === null) return true;
    const normalized = value.trim().toLowerCase();
    return normalized !== "false" && normalized !== "0" && normalized !== "off";
};

const MATRIX_SYNC_ENABLED = parseEnvFlag(process.env.NEXT_PUBLIC_MATRIX_ENABLED);
const CHAT_PROVIDER = process.env.NEXT_PUBLIC_CHAT_PROVIDER || "matrix";

export const MatrixSync = () => {
    const pathname = usePathname();
    const shouldSync = MATRIX_SYNC_ENABLED && CHAT_PROVIDER === "matrix" && pathname?.startsWith("/chat");

    if (!shouldSync) {
        return null;
    }

    return <MatrixSyncInner />;
};

const MatrixSyncInner = () => {
    const [user, setUser] = useAtom(userAtom);
    const [unreadCounts, setUnreadCounts] = useAtom(unreadCountsAtom);
    const [latestMessages, setLatestMessages] = useAtom(latestMessagesAtom);
    const [roomData, setRoomData] = useAtom(roomDataAtom);
    const [roomMessages, setRoomMessages] = useAtom(roomMessagesAtom);
    const [lastReadTimestamps, setLastReadTimestamps] = useAtom(lastReadTimestampsAtom);
    const roomMessagesRef = useRef(roomMessages);
    const [matrixUserCache, setMatrixUserCache] = useAtom(matrixUserCacheAtom);
    const matrixUserCacheRef = useRef(matrixUserCache);
    
    // Holds the current stop function for the active sync loop (so we can stop it before starting a new one)
    const stopSyncRef = useRef<null | (() => void)>(null);

    // Increments each time we (re)start syncing, so stale async work can be ignored safely
    const syncGenerationRef = useRef(0);


    // Fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

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
            // console.log("🔄 [Unread] Waiting for hydration...");
            return; // Wait for hydration
        }

        // console.log("🔄 [Unread] Recalculating unread counts...");
        // console.log("🔄 [Unread] lastReadTimestamps:", lastReadTimestamps);

        const updatedUnreadCounts: Record<string, number> = {};

        for (const roomId of Object.keys(roomMessages)) {
            const messages = roomMessages[roomId] || [];
            const lastReadTimestamp = lastReadTimestamps[roomId] || 0;
            const isNotificationsRoom = roomId === user?.matrixNotificationsRoomId;

            // console.log(`🔄 [Unread] Checking room: ${roomId} (${isNotificationsRoom ? "Notifications" : "Chat"})`);
            // console.log(`🔄 [Unread] - Last read timestamp: ${new Date(lastReadTimestamp).toISOString()}`);
            // console.log(`🔄 [Unread] - Total messages: ${messages.length}`);

            const unreadMessages = messages.filter((msg) => {
                // Get message timestamp in a consistent way
                const msgTimestamp =
                    msg.createdAt instanceof Date ? msg.createdAt.getTime() : new Date(msg.createdAt).getTime();

                const isUnread = msgTimestamp > lastReadTimestamp;
                const expectedSelfIdentifier = `@${user?.matrixUsername}:${process.env.NEXT_PUBLIC_MATRIX_DOMAIN}`;
                const isSelfMessage = msg.createdBy === expectedSelfIdentifier;

                if (isUnread) {
                    const timeAgo = Math.round((Date.now() - msgTimestamp) / 1000 / 60);
                    // console.log(`🔄 [Unread] - Message ${msg.id.substring(0, 8)}...`);
                    // console.log(`🔄 [Unread]   - Time: ${new Date(msgTimestamp).toISOString()} (${timeAgo} min ago)`);
                    // console.log(`🔄 [Unread]   - From: ${msg.createdBy} (self: ${isSelfMessage})`);

                    if (msg.type === "m.room.message") {
                        const contentPreview =
                            typeof msg.content?.body === "string"
                                ? JSON.stringify(msg.content?.body).substring(0, 50)
                                : "N/A";
                        // console.log(`🔄 [Unread]   - Content: ${contentPreview}...`);

                        const shouldCount = isNotificationsRoom || !isSelfMessage;
                        // console.log(`🔄 [Unread]   - Count as unread: ${shouldCount}`);
                        return shouldCount;
                    }
                }
                return false;
            });

            updatedUnreadCounts[roomId] = unreadMessages.length;
            // console.log(`🔄 [Unread] - Unread count for ${roomId}: ${unreadMessages.length} messages`);
        }

        // console.log("🔄 [Unread] Final unread counts:", updatedUnreadCounts);
        setUnreadCounts(updatedUnreadCounts);
    }, [roomMessages, lastReadTimestamps, user?.matrixUsername, user?.matrixNotificationsRoomId, setUnreadCounts]);

    // Stable, memoized roomIds list for initial sync (avoids complex deps)
        const roomIdsForInitialSync = useMemo(() => {
    const ids = (user?.chatRoomMemberships || [])
        .map((m) => m.chatRoom.matrixRoomId)
        .filter(Boolean);

    if (user?.matrixNotificationsRoomId) ids.push(user.matrixNotificationsRoomId);

    return ids;
    }, [user?.chatRoomMemberships, user?.matrixNotificationsRoomId]);

        // Start the sync process
useEffect(() => {
    // If we don’t have the Matrix credentials yet, do nothing.
    if (!user?.matrixAccessToken || !user?.matrixUrl || !user?.matrixUsername) return;

    // Bump generation so any in-flight async work from a previous run becomes stale.
    syncGenerationRef.current += 1;
    const myGen = syncGenerationRef.current;

    // Always stop any previous loop before starting a new one.
    if (stopSyncRef.current) {
        stopSyncRef.current();
        stopSyncRef.current = null;
    }

    const handleSyncData = async (data: {
        rooms: Record<string, RoomData>;
        latestMessages: Record<string, any>;
        lastReadTimestamps: Record<string, number>;
    }) => {
        // Ignore stale updates (e.g., Strict Mode double-invocation / fast refresh / deps changes)
        if (syncGenerationRef.current !== myGen) return;

        setLatestMessages((prev) => ({ ...prev, ...data.latestMessages }));
        setRoomData((prev) => ({ ...prev, ...data.rooms }));
        setLastReadTimestamps((prev) => ({ ...prev, ...data.lastReadTimestamps }));

        // Merge incoming messages into roomMessages without duplicating events
        const newRoomMessages: Record<string, any[]> = {};
        for (const [roomId, room] of Object.entries(data.rooms)) {
            const timelineEvents = room?.timeline?.events || [];
            const messages = timelineEvents
                .filter((event: any) => event?.type === "m.room.message")
                .map((event: any) => ({
                    id: event.event_id,
                    roomId,
                    createdBy: event.sender,
                    createdAt: new Date(event.origin_server_ts),
                    content: event.content,
                    type: event.type,
                    author: matrixUserCacheRef.current?.[event.sender] || { name: event.sender },
                    reactions: event.reactions,
                }));

            const existing = roomMessagesRef.current?.[roomId] || [];
            const map = new Map<string, any>(existing.map((m: any) => [m.id, m]));
            for (const m of messages) {
                map.set(m.id, { ...(map.get(m.id) || {}), ...m });
            }

            newRoomMessages[roomId] = Array.from(map.values()).sort(
                (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
        }

        if (Object.keys(newRoomMessages).length) {
            setRoomMessages((prev) => ({ ...prev, ...newRoomMessages }));
        }
    };

    const initialSync = async () => {
        // If we became stale before starting, abort.
        if (syncGenerationRef.current !== myGen) return;

        const syncToken = localStorage.getItem("syncToken");
        if (!syncToken) {
            for (const roomId of roomIdsForInitialSync) {
                // Abort if stale mid-loop
                if (syncGenerationRef.current !== myGen) return;
                if (!roomId) continue;

                try {
                    const { messages: historicalMessages } = await fetchRoomMessages(
                        user.matrixAccessToken!,
                        user.matrixUrl!,
                        roomId,
                        50,
                    );

                    // Abort if stale after await
                    if (syncGenerationRef.current !== myGen) return;

                    const formattedMessages = historicalMessages.map((event: any) => ({
                        id: event.event_id,
                        roomId,
                        createdBy: event.sender,
                        createdAt: new Date(event.origin_server_ts),
                        content: event.content,
                        type: event.type,
                        author: matrixUserCacheRef.current?.[event.sender] || { name: event.sender },
                        reactions: event.reactions,
                    }));

                    setRoomMessages((prev) => ({
                        ...prev,
                        [roomId]: [...(prev[roomId] || []), ...formattedMessages].sort(
                            (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                        ),
                    }));
                } catch (error) {
                    console.error(`Failed to fetch historical messages for room ${roomId}:`, error);
                }
            }
        }

        // Abort if stale right before starting the long-running loop
        if (syncGenerationRef.current !== myGen) return;

        // Start the live sync loop
        stopSyncRef.current = startSync(
            user.matrixAccessToken!,
            user.matrixUrl!,
            user.matrixUsername!,
            handleSyncData,
        );
    };

    // Fire and forget; generation guards handle safety.
    initialSync();

    return () => {
        // Mark this run stale and stop the active loop.
        syncGenerationRef.current += 1;
        if (stopSyncRef.current) {
            stopSyncRef.current();
            stopSyncRef.current = null;
        }
    };
}, [
    user?.matrixAccessToken,
    user?.matrixUrl,
    user?.matrixUsername,
    user?.matrixNotificationsRoomId,
    roomIdsForInitialSync,

    setLatestMessages,
    setRoomData,
    setRoomMessages,
    setLastReadTimestamps,
]);

    return null;
};
