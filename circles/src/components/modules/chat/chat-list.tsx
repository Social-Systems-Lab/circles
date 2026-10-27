// chat-list.tsx - Displays chat rooms in a list
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { ChatRoomDisplay } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { unreadCountsAtom, chatSettingsModalAtom } from "@/lib/data/atoms";
import { useRouter, useParams, usePathname } from "next/navigation";
import { Archive, ArchiveRestore, Bell, BellOff, Info, Settings } from "lucide-react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import Image from "next/image";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { resolveConversationUnreadCount } from "@/lib/chat/unread-counts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
    beginConversationMuteMutation,
    CONVERSATION_MUTE_PENDING_EVENT,
    CONVERSATION_MUTE_PREFERENCE_EVENT,
    dispatchConversationMutePreference,
    finishConversationMuteMutation,
    isConversationMuteMutationPending,
} from "@/lib/client/chat-preference-events";
import { useToast } from "@/components/ui/use-toast";
import { getPostArchiveNavigationTarget } from "@/lib/chat/archive-navigation";

interface ChatListProps {
    chats: ChatRoomDisplay[];
    isLoading?: boolean;
    searchTerm?: string;
    totalChatsCount?: number;
    onChatClick?: (chat: ChatRoomDisplay) => void | Promise<void>;
    archivedView?: boolean;
    onUnarchive?: (chat: ChatRoomDisplay) => void | Promise<void>;
    onArchive?: (chat: ChatRoomDisplay) => void | Promise<void>;
    onRetryMutePreferences?: () => void | Promise<void>;
}

export const ChatList: React.FC<ChatListProps> = ({
    chats,
    isLoading = false,
    searchTerm,
    totalChatsCount = chats.length,
    onChatClick,
    archivedView = false,
    onUnarchive,
    onArchive,
    onRetryMutePreferences,
}) => {
    const [unreadCounts] = useAtom(unreadCountsAtom);
    const [, setChatSettingsModal] = useAtom(chatSettingsModalAtom);
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const router = useRouter();
    const params = useParams();
    const pathname = usePathname();
    const activeChatHandle = params.handle as string;
    const getConversationId = (chat: ChatRoomDisplay) => String(chat._id || "");
    const isLoadingRooms = isLoading && totalChatsCount === 0;
    const [mutePreferences, setMutePreferences] = useState<Record<string, boolean>>({});
    const [pendingMuteMutations, setPendingMuteMutations] = useState<Set<string>>(() => new Set());
    const hasLocalMutePreference = (chat: ChatRoomDisplay) =>
        Object.prototype.hasOwnProperty.call(mutePreferences, getConversationId(chat));
    const isConversationMuted = (chat: ChatRoomDisplay) =>
        mutePreferences[getConversationId(chat)] ?? chat.notificationsMuted === true;
    const isMutePreferenceKnown = (chat: ChatRoomDisplay) =>
        hasLocalMutePreference(chat) || chat.notificationsMutePreferenceAvailable !== false;

    useEffect(() => {
        const handlePreference = (event: Event) => {
            const detail = (event as CustomEvent<{ conversationId?: string; muted?: boolean }>).detail;
            if (detail?.conversationId && typeof detail.muted === "boolean") {
                setMutePreferences((current) => ({ ...current, [detail.conversationId!]: detail.muted! }));
            }
        };
        window.addEventListener(CONVERSATION_MUTE_PREFERENCE_EVENT, handlePreference);
        return () => window.removeEventListener(CONVERSATION_MUTE_PREFERENCE_EVENT, handlePreference);
    }, []);

    useEffect(() => {
        const handlePending = (event: Event) => {
            const detail = (event as CustomEvent<{ conversationId?: string; pending?: boolean }>).detail;
            if (!detail?.conversationId || typeof detail.pending !== "boolean") return;
            setPendingMuteMutations((current) => {
                const next = new Set(current);
                detail.pending ? next.add(detail.conversationId!) : next.delete(detail.conversationId!);
                return next;
            });
        };
        window.addEventListener(CONVERSATION_MUTE_PENDING_EVENT, handlePending);
        return () => window.removeEventListener(CONVERSATION_MUTE_PENDING_EVENT, handlePending);
    }, []);

    const handleMuteChange = async (chat: ChatRoomDisplay) => {
        const conversationId = getConversationId(chat);
        if (!beginConversationMuteMutation(conversationId)) return;
        const previous = isConversationMuted(chat);
        const muted = !previous;
        setMutePreferences((current) => ({ ...current, [conversationId]: muted }));
        try {
            const { setConversationMutePreferenceAction } = await import("./actions");
            const result = await setConversationMutePreferenceAction(conversationId, muted);
            if (!result.success) throw new Error(result.message || "Failed to save notification preference");
            dispatchConversationMutePreference(conversationId, muted);
        } catch (error) {
            setMutePreferences((current) => ({ ...current, [conversationId]: previous }));
            toast({
                title: "Couldn’t update notifications",
                description: error instanceof Error ? error.message : "Please try again.",
                variant: "destructive",
            });
        } finally {
            finishConversationMuteMutation(conversationId);
        }
    };

    const handleArchive = async (chat: ChatRoomDisplay) => {
        if (onArchive) {
            await onArchive(chat);
            return;
        }
        const { archiveDmConversationAction } = await import("./actions");
        const result = await archiveDmConversationAction(getConversationId(chat));
        if (result.success) {
            const navigationTarget = getPostArchiveNavigationTarget(pathname, getConversationId(chat));
            if (navigationTarget) router.replace(navigationTarget);
        } else {
            alert(result.message || "Failed to archive conversation");
        }
    };

    const sortedChats = useMemo(() => {
        const chatsCopy = [...chats];

        chatsCopy.sort((a, b) => {
            const latestA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const latestB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return latestB - latestA; // Sort descending by timestamp
        });
        return chatsCopy;
    }, [chats]);

    const handleChatClick = async (chat: ChatRoomDisplay) => {
        const path = archivedView ? `/chat/archived/${getConversationId(chat)}` : `/chat/${getConversationId(chat)}`;
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
                    const atomUnread = Object.entries(unreadCounts).find(([key]) =>
                        key.startsWith(getConversationId(chat)),
                    )?.[1];
                    const unreadCount = resolveConversationUnreadCount(atomUnread, mongoUnread);

                    return (
                        <div
                            key={chat._id}
                            className={clsx(
                                "group m-1 flex items-center gap-3 rounded-lg p-2 hover:bg-gray-100",
                                "cursor-pointer",
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
                            {archivedView ? (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void onUnarchive?.(chat);
                                    }}
                                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    aria-label={`Unarchive conversation with ${chat.name}`}
                                >
                                    <ArchiveRestore className="h-5 w-5" aria-hidden="true" />
                                </button>
                            ) : (
                                <>
                                    {isMutePreferenceKnown(chat) && isConversationMuted(chat) && (
                                        <span
                                            className="flex flex-shrink-0 text-gray-400 dark:text-gray-500"
                                            aria-label="Notifications muted"
                                            title="Notifications muted"
                                        >
                                            <BellOff className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                onClick={(event) => event.stopPropagation()}
                                                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                aria-label={`Conversation menu for ${chat.name}`}
                                            >
                                                <Settings className="h-5 w-5 text-gray-600" aria-hidden="true" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="end"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <DropdownMenuItem
                                                onSelect={() =>
                                                    setChatSettingsModal({ chatRoomId: chat._id, isOpen: true })
                                                }
                                            >
                                                <Info className="mr-2 h-4 w-4" aria-hidden="true" />
                                                {chat.isDirect ? "Chat Info" : "Group Info"}
                                            </DropdownMenuItem>
                                            {!isMutePreferenceKnown(chat) ? (
                                                <DropdownMenuItem onSelect={() => void onRetryMutePreferences?.()}>
                                                    <BellOff className="mr-2 h-4 w-4" aria-hidden="true" />
                                                    Retry notification setting
                                                </DropdownMenuItem>
                                            ) : (
                                                <DropdownMenuItem
                                                    disabled={
                                                        pendingMuteMutations.has(getConversationId(chat)) ||
                                                        isConversationMuteMutationPending(getConversationId(chat))
                                                    }
                                                    onSelect={() => void handleMuteChange(chat)}
                                                >
                                                    {isConversationMuted(chat) ? (
                                                        <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
                                                    ) : (
                                                        <BellOff className="mr-2 h-4 w-4" aria-hidden="true" />
                                                    )}
                                                    {pendingMuteMutations.has(getConversationId(chat))
                                                        ? "Saving notification setting…"
                                                        : isConversationMuted(chat)
                                                          ? "Unmute notifications"
                                                          : "Mute notifications"}
                                                </DropdownMenuItem>
                                            )}
                                            {chat.isDirect && (
                                                <DropdownMenuItem onSelect={() => void handleArchive(chat)}>
                                                    <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                                                    Archive conversation
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </>
                            )}
                        </div>
                    );
                })
            ) : (
                <div className="flex h-full items-center justify-center pt-4 text-sm text-gray-500">
                    {archivedView && !isLoadingRooms ? (
                        <p className="p-4 text-center">No archived conversations</p>
                    ) : isLoadingRooms ? (
                        <p className="flex animate-pulse items-center" aria-live="polite">
                            <span>Messages loading</span>
                            <LoadingEllipsis />
                        </p>
                    ) : isMobile ? (
                        <div className="flex flex-col items-center justify-center gap-4 p-4">
                            <Image
                                src="/images/illustrations/mailbox.png"
                                alt="No messages yet"
                                width={230}
                                height={230}
                            />
                            <h4 className="text-lg font-semibold">No Messages Yet</h4>
                            <p className="max-w-md text-center text-sm text-gray-500">
                                You haven&apos;t joined any message groups yet. Try exploring artists, hosts, and music
                                communities to message.
                            </p>
                            <Button variant="outline" onClick={() => router.push("/circles?tab=discover")}>
                                Explore Kamooni
                            </Button>
                        </div>
                    ) : searchTerm?.trim() && totalChatsCount > 0 ? (
                        "No messages found"
                    ) : (
                        "Messages loading..."
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
