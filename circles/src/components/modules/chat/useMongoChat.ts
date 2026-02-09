"use client";

import { useEffect, useRef, useState } from "react";
import { fetchMongoMessagesAction, markConversationReadAction } from "./actions";
import { ChatMessage } from "@/models/models";

type UseMongoChatOptions = {
    roomId?: string;
    enabled: boolean;
    setRoomMessages: React.Dispatch<React.SetStateAction<Record<string, ChatMessage[]>>>;
};

export const useMongoChat = ({ roomId, enabled, setRoomMessages }: UseMongoChatOptions) => {
    const [isLoading, setIsLoading] = useState(false);
    const sinceIdRef = useRef<string | null>(null);
    const hasLoadedRef = useRef(false);
    const lastMarkedIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled || !roomId) return;

        let intervalId: NodeJS.Timeout;
        sinceIdRef.current = null;
        hasLoadedRef.current = false;
        lastMarkedIdRef.current = null;

        const pollMessages = async () => {
            try {
                if (!hasLoadedRef.current) {
                    setIsLoading(true);
                }

                const result = await fetchMongoMessagesAction(roomId, sinceIdRef.current || undefined, 50);
                if (result.success && result.messages) {
                    if (result.messages.length > 0) {
                        sinceIdRef.current = result.nextSinceId || sinceIdRef.current;
                        const latestId = result.nextSinceId || result.messages[result.messages.length - 1]?.id;
                        if (latestId && latestId !== lastMarkedIdRef.current) {
                            await markConversationReadAction(roomId, latestId);
                            lastMarkedIdRef.current = latestId;
                        }
                        setRoomMessages((prev) => {
                            const current = prev[roomId] || [];
                            const existingIds = new Set(current.map((msg) => msg.id));
                            const merged = [...current, ...result.messages.filter((msg) => !existingIds.has(msg.id))];
                            return {
                                ...prev,
                                [roomId]: merged,
                            };
                        });
                    }
                }
            } catch (error) {
                console.error("Failed to poll mongo messages:", error);
            } finally {
                if (!hasLoadedRef.current) {
                    hasLoadedRef.current = true;
                    setIsLoading(false);
                }
            }
        };

        pollMessages();
        intervalId = setInterval(pollMessages, 4000);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [enabled, roomId, setRoomMessages]);

    return { isLoading };
};
