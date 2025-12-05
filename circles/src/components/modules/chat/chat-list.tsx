// chat-list.tsx - Displays chat rooms in a list
"use client";

import { useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { ChatRoom, ChatRoomDisplay } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { LatestMessage } from "@/components/modules/chat/chat-room";
import { latestMessagesAtom, unreadCountsAtom, chatSettingsModalAtom } from "@/lib/data/atoms";
import { useRouter, useParams } from "next/navigation";
import { Settings } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import Image from "next/image";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import emptyFeed from "@images/empty-feed.png";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

interface ChatListProps {
    chats: ChatRoomDisplay[];
    onChatClick?: (chat: ChatRoomDisplay) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ chats, onChatClick }) => {
    const [latestMessages] = useAtom(latestMessagesAtom);
    const [unreadCounts] = useAtom(unreadCountsAtom);
    const [, setChatSettingsModal] = useAtom(chatSettingsModalAtom);
    const isMobile = useIsMobile();
    const router = useRouter();
    const params = useParams();
    const activeChatHandle = params.handle as string;

    const sortedChats = useMemo(() => {
        const chatsCopy = [...chats];

        chatsCopy.sort((a, b) => {
            const messageA = Object.entries(latestMessages).find(([key]) => key.startsWith(a.matrixRoomId!))?.[1];
            const messageB = Object.entries(latestMessages).find(([key]) => key.startsWith(b.matrixRoomId!))?.[1];

            const latestA = messageA?.origin_server_ts || 0;
            const latestB = messageB?.origin_server_ts || 0;
            return latestB - latestA; // Sort descending by timestamp
        });
        return chatsCopy;
    }, [chats, latestMessages]);

    const handleChatClick = (chat: ChatRoomDisplay) => {
        const path = chat.circle ? `/chat/${chat.circle.handle}` : `/chat/${chat.handle}`;
        router.push(path);
        if (onChatClick) {
            onChatClick(chat);
        }
    };

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatList.1");
        }
    }, []);

    return (
        <div>
            {sortedChats.length > 0 ? (
                sortedChats.map((chat) => {
                    const unreadCount =
                        Object.entries(unreadCounts).find(([key]) => key.startsWith(chat.matrixRoomId!))?.[1] || 0;

                    return (
                        <div
                            key={chat._id}
                            className={clsx(
                                "group m-1 flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-100",
                                {
                                    "bg-gray-200 dark:bg-gray-700": activeChatHandle === (chat.circle?.handle || chat.handle),
                                },
                            )}
                            onClick={() => handleChatClick(chat)}
                        >
                            <div className="relative">
                                <CirclePicture
                                    circle={{
                                        name: chat.name,
                                        picture: chat.picture,
                                        circleType: chat.circle?.circleType || "circle",
                                    }}
                                    size="40px"
                                    showTypeIndicator={chat.circle?.circleType !== "user" && !!chat.circle}
                                />
                                {unreadCount > 0 && (
                                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                        {unreadCount}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                                <p className="truncate text-sm font-medium">{chat.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    <LatestMessage roomId={chat.matrixRoomId!} latestMessages={latestMessages} />
                                </p>
                            </div>
                            {/* Settings Icon - shows on hover */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent chat click
                                    setChatSettingsModal({
                                        chatRoomId: chat._id,
                                        isOpen: true,
                                    });
                                }}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-2 hover:bg-gray-200 rounded-full transition-opacity"
                                aria-label="Chat settings"
                            >
                                <Settings className="h-4 w-4 text-gray-600" />
                            </button>
                        </div>
                    );
                })
            ) : (
                <div className="flex h-full items-center justify-center pt-4 text-sm text-gray-500">
                    {isMobile ? (
                        <div className="flex flex-col items-center justify-center gap-4 p-4">
                            <Image src={emptyFeed} alt="No chats yet" width={230} />
                            <h4 className="text-lg font-semibold">No Chat Rooms</h4>
                            <p className="max-w-md text-center text-sm text-gray-500">
                                You haven&apos;t joined any chat rooms yet. Try discover new circles to chat in.
                            </p>
                            <Button variant="outline" onClick={() => router.push("/circles?tab=discover")}>
                                Discover
                            </Button>
                        </div>
                    ) : (
                        "No chat rooms joined"
                    )}
                </div>
            )}
        </div>
    );
};
