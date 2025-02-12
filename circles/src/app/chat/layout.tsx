// chat/layout.tsx - shows chat rooms
"use client";

import { useState, useMemo, useEffect } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { ChatRoom, ChatRoomDisplay, Circle } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { ChatRoomComponent } from "@/components/modules/chat/chat-room";
import { LatestMessage } from "@/components/modules/chat/chat-room";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { latestMessagesAtom, unreadCountsAtom } from "@/lib/data/atoms";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter } from "next/navigation";
import Image from "next/image";
import emptyFeed from "@images/empty-feed.png";
import { Button } from "@/components/ui/button";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { ChatList } from "@/components/modules/chat/chat-list";

export default function ChatLayoutPage() {
    const [user] = useAtom(userAtom);
    const [latestMessages] = useAtom(latestMessagesAtom);
    const isMobile = useIsMobile();
    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatLayoutPage.1");
        }
    }, []);

    // Sort chat rooms by their latest message timestamps
    const sortedChats = useMemo(() => {
        if (!user?.chatRoomMemberships) return [];
        const chats = user.chatRoomMemberships.map((m) => m.chatRoom);
        return chats.sort((a, b) => {
            const messageA = Object.entries(latestMessages).find(([key]) => key.startsWith(a.matrixRoomId!))?.[1];
            const messageB = Object.entries(latestMessages).find(([key]) => key.startsWith(b.matrixRoomId!))?.[1];
            const latestA = messageA?.origin_server_ts || 0;
            const latestB = messageB?.origin_server_ts || 0;
            return latestB - latestA;
        });
    }, [user?.chatRoomMemberships, latestMessages]);

    if (!user) {
        return <div className="p-4">Please log in to access chats</div>;
    }

    // If there are no joined chat rooms, show a placeholder with a "Discover" button
    if (sortedChats.length === 0) {
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
        <div className="flex h-screen">
            {/* Chat List Panel */}
            <div className={`border-r border-gray-200 bg-white p-2 ${isMobile ? "w-full" : "w-80"}`}>
                <h2 className="mb-4 mt-2 pl-2 pt-0 text-xl font-semibold">Chats</h2>
                <ChatList chats={user?.chatRoomMemberships?.map((m) => m.chatRoom) || []} />
            </div>

            {/* Chat Window */}
            {/* <div className={`flex-1 ${!selectedChat && !isMobile ? "hidden" : ""}`}>
                {selectedChat && (
                    <ChatRoomComponent
                        chatRoom={selectedChat}
                        setSelectedChat={setSelectedChat}
                        circle={selectedChat.circle}
                        isDefaultCircle={false}
                    />
                )}
            </div> */}
        </div>
    );
}
