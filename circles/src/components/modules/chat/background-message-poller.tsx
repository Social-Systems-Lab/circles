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
                        const formattedMessages = await Promise.all(
                            result.messages
                                .filter((msg: any) => msg.type === "m.room.message")
                                .map(async (msg: any) => {
                                    const senderMatrixName = msg.sender;
                                    let author = matrixUserCache[senderMatrixName];
                                    if (!author) {
                                        const fetchedAuthors = await fetchMatrixUsers([senderMatrixName]);
                                        if (fetchedAuthors?.[0]) {
                                            author = fetchedAuthors[0];
                                        }
                                        if (author) {
                                            setMatrixUserCache((prev) => ({ ...prev, [senderMatrixName]: author! }));
                                        }
                                    }
                                    return {
                                        id: msg.event_id,
                                        roomId,
                                        type: msg.type,
                                        content: msg.content,
                                        createdBy: msg.sender,
                                        createdAt: new Date(msg.origin_server_ts),
                                        author: author || undefined,
                                        reactions: {},
                                        isRedacted: !!msg.unsigned?.redacted_because,
                                    } as ChatMessage;
                                })
                        );

                        // Process edit events - update original messages instead of adding new ones
                        const currentMessages = roomMessagesRef.current[roomId] || [];
                        const updatedMessages = [...currentMessages];
                        const newMessages: ChatMessage[] = [];

                        for (const msg of formattedMessages) {
                            // Handle redactions
                            if (msg.isRedacted) {
                                const originalIndex = updatedMessages.findIndex(m => m.id === msg.id);
                                if (originalIndex !== -1) {
                                    updatedMessages.splice(originalIndex, 1);
                                }
                                continue;
                            }

                            const relatesTo = (msg.content as any)?.["m.relates_to"];
                            if (relatesTo?.rel_type === "m.replace" && relatesTo?.event_id) {
                                // This is an edit - find and update the original message
                                const originalIndex = updatedMessages.findIndex(m => m.id === relatesTo.event_id);
                                if (originalIndex !== -1) {
                                    // Update the original message with new content
                                    updatedMessages[originalIndex] = {
                                        ...updatedMessages[originalIndex],
                                        content: {
                                            ...msg.content,
                                            body: (msg.content as any)["m.new_content"]?.body || (msg.content as any).body,
                                        },
                                    };
                                }
                            } else {
                                // Regular message - add if not already in the list
                                if (!updatedMessages.some(m => m.id === msg.id)) {
                                    newMessages.push(msg);
                                }
                            }
                        }

                        // Combine existing messages with new ones
                        const finalMessages = [...updatedMessages, ...newMessages];

                        // Check if anything changed (new messages, edits, or different count)
                        const hasChanges = 
                            finalMessages.length !== currentMessages.length || 
                            newMessages.length > 0 ||
                            // Check if any message content changed (edits)
                            finalMessages.some((msg, idx) => {
                                const currentMsg = currentMessages[idx];
                                return !currentMsg || 
                                       JSON.stringify(msg.content) !== JSON.stringify(currentMsg.content);
                            });

                        if (hasChanges) {
                            setRoomMessages((prev) => ({
                                ...prev,
                                [roomId]: finalMessages,
                            }));
                            console.log(`📨 [Background Poll] Updated ${roomId} with ${finalMessages.length} messages (${newMessages.length} new)`);
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
