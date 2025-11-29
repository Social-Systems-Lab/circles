"use client";

import { useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { roomMessagesAtom, userAtom, matrixUserCacheAtom } from "@/lib/data/atoms";
import { ChatMessage } from "@/models/models";

/**
 * Background polling component that fetches messages for all chat rooms
 * regardless of which page the user is on
 */
export const BackgroundMessagePoller = () => {
    const [user] = useAtom(userAtom);
    const [roomMessages, setRoomMessages] = useAtom(roomMessagesAtom);
    const [matrixUserCache, setMatrixUserCache] = useAtom(matrixUserCacheAtom);
    const roomMessagesRef = useRef(roomMessages);

    // Keep ref in sync with state
    useEffect(() => {
        roomMessagesRef.current = roomMessages;
    }, [roomMessages]);

    useEffect(() => {
        if (!user?.chatRoomMemberships) return;

        const pollAllRooms = async () => {
            const { fetchRoomMessagesAction, fetchMatrixUsers } = await import("./actions");

            // Get all room IDs from user's chat memberships
            const roomIds = user.chatRoomMemberships
                .map((m) => m.chatRoom.matrixRoomId)
                .filter((id): id is string => !!id);

            for (const roomId of roomIds) {
                try {
                    const result = await fetchRoomMessagesAction(roomId, 50);

                    if (result.success && result.messages) {
                        // Convert Matrix messages to ChatMessage format
                        const formattedMessages: ChatMessage[] = await Promise.all(
                            result.messages
                                .filter((msg: any) => msg.type === "m.room.message")
                                .map(async (msg: any) => {
                                    // Get or cache user info
                                    let author = matrixUserCache[msg.sender];
                                    if (!author) {
                                        const users = await fetchMatrixUsers([msg.sender]);
                                        author = users[0];
                                        if (author) {
                                            setMatrixUserCache((prev) => ({ ...prev, [msg.sender]: author }));
                                        }
                                    }

                                    return {
                                        id: msg.event_id,
                                        roomId: roomId,
                                        type: msg.type,
                                        content: msg.content,
                                        createdBy: msg.sender,
                                        createdAt: new Date(msg.origin_server_ts),
                                        author: author || undefined,
                                        reactions: {},
                                    } as ChatMessage;
                                })
                        );

                        // Only update if message count changed
                        const currentMessages = roomMessagesRef.current[roomId] || [];
                        if (formattedMessages.length !== currentMessages.length) {
                            setRoomMessages((prev) => ({
                                ...prev,
                                [roomId]: formattedMessages.reverse(),
                            }));
                            console.log(`📨 [Background Poll] Updated ${roomId} with ${formattedMessages.length} messages`);
                        }
                    }
                } catch (error) {
                    // Silently skip rooms with 403 errors (user not in room)
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (!errorMessage.includes('403') && !errorMessage.includes('M_FORBIDDEN')) {
                        console.error(`Failed to poll messages for room ${roomId}:`, error);
                    }
                }
            }
        };

        // Initial fetch
        pollAllRooms();

        // Poll every 5 seconds
        const intervalId = setInterval(pollAllRooms, 5000);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [user?.chatRoomMemberships, matrixUserCache, setMatrixUserCache, setRoomMessages]);

    return null;
};
