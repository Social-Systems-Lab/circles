"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMongoMessagesAction, markConversationReadAction } from "./actions";
import { ChatMessage } from "@/models/models";
import { dispatchNotificationRefresh } from "@/lib/client/notification-events";

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

    const markCurrentConversationRead = useCallback(async () => {
        if (!roomId || lastMarkedIdRef.current === sinceIdRef.current) return;

        const result = await markConversationReadAction(roomId, null);
        if (result.success) {
            lastMarkedIdRef.current = sinceIdRef.current;
            dispatchNotificationRefresh({ reason: "chat-read", roomId });
        }
    }, [roomId]);

    useEffect(() => {
        if (!enabled || !roomId) return;

        let intervalId: NodeJS.Timeout;
        sinceIdRef.current = null;
        hasLoadedRef.current = false;
        lastMarkedIdRef.current = null;

        const initialLoad = async () => {
            setIsLoading(true);
            try {
                // Dynamically import to avoid circular dependency issues
                const { fetchRecentMessagesAction } = await import("./mongo-actions");
                const result = await fetchRecentMessagesAction(roomId, 50);
                if (result.success && result.messages && result.messages.length > 0) {
                    // Set sinceId to the latest message so polling only picks up new ones
                    const latestId = result.messages[result.messages.length - 1]?.id;
                    if (latestId) {
                        sinceIdRef.current = latestId;
                        await markCurrentConversationRead();
                    }
                    setRoomMessages((prev) => {
                        const existingIds = new Set((prev[roomId] || []).map((msg) => msg.id));
                        const newMessages = result.messages!.filter((msg) => !existingIds.has(msg.id));
                        return {
                            ...prev,
                            [roomId]: [...(prev[roomId] || []), ...newMessages],
                        };
                    });
                }
            } catch (error) {
                console.error("Failed to load recent messages:", error);
            } finally {
                hasLoadedRef.current = true;
                setIsLoading(false);
            }
        };

        const pollMessages = async () => {
            // Only poll for new messages after initial load is done
            if (!hasLoadedRef.current) return;

            try {
                const result = await fetchMongoMessagesAction(roomId, sinceIdRef.current || undefined, 50);
                if (result.success && result.messages && result.messages.length > 0) {
                    sinceIdRef.current = result.nextSinceId || sinceIdRef.current;
                    const latestId = result.nextSinceId || result.messages[result.messages.length - 1]?.id;
                    if (latestId) {
                        sinceIdRef.current = latestId;
                        await markCurrentConversationRead();
                    }
                    setRoomMessages((prev) => {
                        const current = prev[roomId] || [];
                        const existingIds = new Set(current.map((msg) => msg.id));
                        const merged = [...current, ...result.messages!.filter((msg) => !existingIds.has(msg.id))];
                        return {
                            ...prev,
                            [roomId]: merged,
                        };
                    });
                }
            } catch (error) {
                console.error("Failed to poll mongo messages:", error);
            }
        };

        // Run initial load immediately, then start polling
        void initialLoad();
        intervalId = setInterval(pollMessages, 4000);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [enabled, markCurrentConversationRead, roomId, setRoomMessages]);

    return { isLoading };
};
