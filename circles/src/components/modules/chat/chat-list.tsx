"use client";

import { useMemo } from "react";
import { useAtom } from "jotai";
import { ChatRoom, ChatRoomDisplay } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { LatestMessage } from "@/components/modules/chat/chat-room";
import { latestMessagesAtom, unreadCountsAtom } from "@/lib/data/atoms";
import { useRouter } from "next/navigation";

interface ChatListProps {
    chats: ChatRoomDisplay[];
    onChatClick?: (chat: ChatRoomDisplay) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ chats, onChatClick }) => {
    const [latestMessages] = useAtom(latestMessagesAtom);
    const [unreadCounts] = useAtom(unreadCountsAtom);
    const router = useRouter();

    const sortedChats = useMemo(() => {
        return chats.sort((a, b) => {
            const messageA = Object.entries(latestMessages).find(([key]) => key.startsWith(a.matrixRoomId!))?.[1];
            const messageB = Object.entries(latestMessages).find(([key]) => key.startsWith(b.matrixRoomId!))?.[1];

            const latestA = messageA?.origin_server_ts || 0;
            const latestB = messageB?.origin_server_ts || 0;
            return latestB - latestA; // Sort descending by timestamp
        });
    }, [chats, latestMessages]);

    const handleChatClick = (chat: ChatRoomDisplay) => {
        const path = `/chat/${chat.circle.handle}`;
        router.push(path);
        if (onChatClick) {
            onChatClick(chat);
        }
    };

    return (
        <div>
            {sortedChats.length > 0 ? (
                sortedChats.map((chat) => {
                    const unreadCount =
                        Object.entries(unreadCounts).find(([key]) => key.startsWith(chat.matrixRoomId!))?.[1] || 0;

                    return (
                        <div
                            key={chat._id}
                            className="m-1 flex cursor-pointer items-center space-x-4 rounded-lg p-2 hover:bg-gray-100"
                            onClick={() => handleChatClick(chat)}
                        >
                            <div className="relative">
                                <CirclePicture circle={{ name: chat.name, picture: chat.picture }} size="40px" />
                                {unreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                        {unreadCount}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="truncate text-sm font-medium">{chat.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    <LatestMessage roomId={chat.matrixRoomId!} latestMessages={latestMessages} />
                                </p>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="flex h-full items-center justify-center pt-4 text-sm text-gray-500">
                    No chat rooms joined
                </div>
            )}
        </div>
    );
};
