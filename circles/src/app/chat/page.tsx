// chat/page.tsx - chat page placeholder when no chat room is selected
"use client";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import Image from "next/image";
import emptyFeed from "@images/empty-feed.png";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export default function ChatPage() {
    const isMobile = useIsMobile();
    const [user] = useAtom(userAtom);
    const allChats = user?.chatRoomMemberships?.map((m) => m.chatRoom) || [];
    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatPage.1");
        }
    }, []);

    if (isMobile) {
        return null;
    }

    // If no chats => Show full screen "No chats" message
    if (allChats.length <= 0) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 p-4">
                <Image src={emptyFeed} alt="No chats yet" width={300} />
                <h4 className="text-lg font-semibold">No Chat Rooms</h4>
                <p className="max-w-md text-center text-sm text-gray-500">
                    You haven&apos;t joined any chat rooms yet. Try discover new circles to chat in.
                </p>
                <Button variant="outline" onClick={() => router.push("/circles?tab=discover")}>
                    Discover
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full items-center justify-center text-gray-500">
            {!isMobile && "Select a chat to start messaging"}
        </div>
    );
}
