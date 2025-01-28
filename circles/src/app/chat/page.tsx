// src/app/chat/page.tsx
"use client";

import { useState, useMemo } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { ChatRoom, Circle } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { ChatRoomComponent } from "@/components/modules/chat/chat-room";
import { LatestMessage } from "@/components/modules/chat/chat-room";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { latestMessagesAtom, unreadCountsAtom } from "@/lib/data/atoms";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter } from "next/navigation";

export default function ChatPage() {
    const [user] = useAtom(userAtom);
    const [selectedChat, setSelectedChat] = useState<ChatRoom | undefined>();
    const [latestMessages] = useAtom(latestMessagesAtom);
    const [unreadCounts] = useAtom(unreadCountsAtom);
    const isMobile = useIsMobile();
    const router = useRouter();

    // Sort chat rooms by latest message timestamp
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

    const handleChatClick = (chat: ChatRoom) => {
        setSelectedChat(chat);
        if (isMobile) {
            router.push(`/chat/${chat.handle}`);
        }
    };

    if (!user) {
        return <div className="p-4">Please log in to access chats</div>;
    }

    return (
        <div className="flex h-screen">
            {/* Chat List Panel */}
            <div
                className={`${isMobile && selectedChat ? "hidden" : "flex"} border-r border-gray-200 bg-white ${
                    isMobile ? "w-full" : "w-80"
                }`}
            >
                <ScrollArea className="flex-1">
                    <div className="p-2">
                        <h2 className="mb-4 mt-2 pl-2 pt-0 text-xl font-semibold">Chats</h2>
                        {sortedChats.map((chat) => {
                            const unreadCount =
                                Object.entries(unreadCounts).find(([key]) => key.startsWith(chat.matrixRoomId!))?.[1] ||
                                0;

                            return (
                                <div
                                    key={chat._id}
                                    className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                                    onClick={() => handleChatClick(chat)}
                                >
                                    <div className="relative">
                                        <CirclePicture
                                            circle={{ name: chat.name, picture: chat.picture }}
                                            size="40px"
                                        />
                                        {unreadCount > 0 && (
                                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                                {unreadCount}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="truncate text-sm font-medium">{chat.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            <LatestMessage
                                                roomId={chat.matrixRoomId!}
                                                latestMessages={latestMessages}
                                            />
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </div>

            {/* Chat Window */}
            <div className={`flex-1 ${!selectedChat && !isMobile ? "hidden" : ""}`}>
                {selectedChat ? (
                    <ChatRoomComponent
                        chatRoom={selectedChat}
                        circle={selectedChat.circleId as unknown as Circle}
                        isDefaultCircle={selectedChat.handle === "default"}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-gray-500">
                        Select a chat to start messaging
                    </div>
                )}
            </div>
        </div>
    );
}
