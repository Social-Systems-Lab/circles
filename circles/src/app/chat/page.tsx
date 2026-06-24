// chat/page.tsx - chat page placeholder when no chat room is selected
"use client";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { ChatRoomDisplay } from "@/models/models";

export default function ChatPage() {
    const isMobile = useIsMobile();
    const [user] = useAtom(userAtom);
    const [chatRooms, setChatRooms] = useState<ChatRoomDisplay[]>([]);
    const [hasLoadedRooms, setHasLoadedRooms] = useState(false);
    const hasRedirectedRef = useRef(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatPage.1");
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadRooms = async () => {
            if (!user) {
                if (isMounted) {
                    setChatRooms([]);
                    setHasLoadedRooms(true);
                }
                return;
            }
            try {
                const { listChatRoomsAction } = await import("@/components/modules/chat/actions");
                const result = await listChatRoomsAction();
                if (isMounted && result.success && result.rooms) {
                    setChatRooms(result.rooms);
                }
            } catch (error) {
                console.error("Failed to load chat rooms:", error);
            } finally {
                if (isMounted) {
                    setHasLoadedRooms(true);
                }
            }
        };

        loadRooms();
        return () => {
            isMounted = false;
        };
    }, [user]);

    useEffect(() => {
        if (!user || isMobile || !hasLoadedRooms || hasRedirectedRef.current || chatRooms.length <= 0) {
            return;
        }

        const explicitSelectionKeys = ["conversationId", "conversation", "roomId", "room", "handle"];
        const hasExplicitSelection = explicitSelectionKeys.some((key) => {
            const value = searchParams.get(key);
            return typeof value === "string" && value.trim().length > 0;
        });
        if (hasExplicitSelection) {
            return;
        }

        const targetRoom = chatRooms.find((room) => ((room as any).unreadCount || 0) > 0) || chatRooms[0];
        const targetConversationId = String(targetRoom?._id || targetRoom?.handle || "");
        if (!targetConversationId) {
            return;
        }

        hasRedirectedRef.current = true;
        router.replace(`/chat/${targetConversationId}`);
    }, [chatRooms, hasLoadedRooms, isMobile, router, searchParams, user]);

    if (isMobile) {
        return null;
    }

    // If no messages => Show full screen empty-state message
    if (hasLoadedRooms && chatRooms.length <= 0) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 p-4">
                <Image src="/images/illustrations/mailbox.png" alt="No messages yet" width={300} height={300} />
                <h4 className="text-lg font-semibold">No Messages Yet</h4>
                <p className="max-w-md text-center text-sm text-gray-500">
                    You haven&apos;t joined any message groups yet. Try exploring artists, hosts, and music communities to message.
                </p>
                <Button variant="outline" onClick={() => router.push("/circles?tab=discover")}>
                    Explore Kamooni
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full items-center justify-center text-gray-500">
            {!isMobile && "Select a message thread to start messaging"}
        </div>
    );
}
