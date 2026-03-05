// chat-list.tsx - Displays chat rooms in a list
"use client";

import { useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { ChatRoomDisplay } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
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
    isLoading?: boolean;
    searchTerm?: string;
    totalChatsCount?: number;
    onChatClick?: (chat: ChatRoomDisplay) => void | Promise<void>;
}

export const ChatList: React.FC<ChatListProps> = ({ chats, searchTerm, totalChatsCount = chats.length, onChatClick }) => {
    const [latestMessages] = useAtom(latestMessagesAtom);
    const [unreadCounts] = useAtom(unreadCountsAtom);
    const [, setChatSettingsModal] = useAtom(chatSettingsModalAtom);
    const isMobile = useIsMobile();
    const router = useRouter();
    const params = useParams();
    const activeChatHandle = params.handle as string;
    const getConversationId = (chat: ChatRoomDisplay) => String(chat._id || chat.matrixRoomId || chat.handle || "");
    const isLoadingRooms = isLoading && chats.length === 0;

    const sortedChats = useMemo(() => {
        const chatsCopy = [...chats];

        chatsCopy.sort((a, b) => {
            const keyA = getConversationId(a);
            const keyB = getConversationId(b);
            const messageA = Object.entries(latestMessages).find(([key]) => key.startsWith(keyA))?.[1];
            const messageB = Object.entries(latestMessages).find(([key]) => key.startsWith(keyB))?.[1];

            const latestA = messageA?.origin_server_ts || 0;
            const latestB = messageB?.origin_server_ts || 0;
            return latestB - latestA; // Sort descending by timestamp
        });
        return chatsCopy;
    }, [chats, latestMessages]);

    const handleChatClick = async (chat: ChatRoomDisplay) => {
        const path = `/chat/${getConversationId(chat)}`;
        router.push(path);
        if (onChatClick) {
            await onChatClick(chat);
        }
    };

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatList.1");
        }
    }, []);

    const LoadingEllipsis = () => (
        <span className="inline-flex" aria-hidden="true">
            <span className="loading-dot">.</span>
            <span className="loading-dot">.</span>
            <span className="loading-dot">.</span>
        </span>
    );

    return (
        <div>
            {sortedChats.length > 0 ? (
                sortedChats.map((chat) => {
                    const groupMemberCount =
                        !chat.isDirect && typeof (chat as any).memberCount === "number"
                            ? ((chat as any).memberCount as number)
                            : undefined;
                    const mongoUnread =
                        typeof (chat as any).unreadCount === "number" ? (chat as any).unreadCount : undefined;
                    const unreadCount =
                        mongoUnread ||
                        Object.entries(unreadCounts).find(([key]) => key.startsWith(getConversationId(chat)))?.[1] ||
                        0;

                    return (
                        <div
                            key={chat._id}
                            className={clsx(
                                "group m-1 flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-100",
                                {
                                    "bg-gray-200 dark:bg-gray-700":
                                        activeChatHandle === getConversationId(chat) ||
                                        activeChatHandle === (chat.circle?.handle || chat.handle),
                                },
                            )}
                            onClick={() => {
                                void handleChatClick(chat);
                            }}
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
                            <div className="min-w-0 flex-1 overflow-hidden">
                                <p className="truncate text-sm font-medium">
                                    {chat.name}
                                    {groupMemberCount !== undefined && (
                                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                                            · {groupMemberCount} {groupMemberCount === 1 ? "member" : "members"}
                                        </span>
                                    )}
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
                                className="flex-shrink-0 rounded-full p-2 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-200"
                                aria-label="Chat settings"
                            >
                                <Settings className="h-4 w-4 text-gray-600" />
                            </button>
                        </div>
                    );
                })
            ) : (
                <div className="flex h-full items-center justify-center pt-4 text-sm text-gray-500">
                    {isLoadingRooms ? (
                        <p className="flex items-center">
                            <span>Loading messages</span>
                            <LoadingEllipsis />
                        </p>
                    ) : isMobile ? (
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
                    ) : searchTerm?.trim() && totalChatsCount > 0 ? (
                        "No chats found"
                    ) : (
                        "No chat rooms joined"
                    )}
                </div>
            )}
            <style jsx>{`
                .loading-dot {
                    animation: loadingDot 1.2s infinite;
                    margin-left: 1px;
                }

                .loading-dot:nth-child(1) {
                    animation-delay: 0s;
                }

                .loading-dot:nth-child(2) {
                    animation-delay: 0.2s;
                }

                .loading-dot:nth-child(3) {
                    animation-delay: 0.4s;
                }

                @keyframes loadingDot {
                    0%,
                    80%,
                    100% {
                        opacity: 0.2;
                    }
                    40% {
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
};
