// chat/layout.tsx - chat layout component, lists all chat rooms and shows selected chat room
"use client";

import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { ChatList } from "@/components/modules/chat/chat-list";
import { usePathname } from "next/navigation";
import { ChatSearch } from "@/components/modules/chat/chat-search";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { CreateChatModal } from "@/components/modules/chat/create-chat-modal";
import { GroupSettingsModal } from "@/components/modules/chat/group-settings-modal";
import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatSettingsModalAtom, unreadCountsAtom } from "@/lib/data/atoms";
import { ChatRoomDisplay } from "@/models/models";
import { listChatRoomsAction, markConversationReadAction } from "@/components/modules/chat/actions";

export default function ChatLayout({ children }: PropsWithChildren) {
    const [user] = useAtom(userAtom);
    const isMobile = useIsMobile();
    const pathname = usePathname();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [chatSearchTerm, setChatSearchTerm] = useState("");
    const [chatSettingsModal, setChatSettingsModal] = useAtom(chatSettingsModalAtom);
    const [, setUnreadCounts] = useAtom(unreadCountsAtom);

    const [chatRooms, setChatRooms] = useState<ChatRoomDisplay[]>([]);
    const openChatIdRef = useRef<string | null>(null);
    const [isChatRoomsLoading, setIsChatRoomsLoading] = useState(true);
    const [hasLoadedChatRooms, setHasLoadedChatRooms] = useState(false);

    useEffect(() => {
        let isMounted = true;
        if (isMounted) {
            setIsChatRoomsLoading(true);
            setHasLoadedChatRooms(false);
        }

        const loadRooms = async () => {
            if (!user) {
                if (isMounted) {
                    setChatRooms([]);
                }
                return;
            }
            try {
                const result = await listChatRoomsAction();
                if (isMounted && result.success && result.rooms) {
                    setChatRooms((prev) => {
                        return result.rooms!.map((room) => {
                            if (room._id && room._id === openChatIdRef.current) {
                                return { ...room, unreadCount: 0 };
                            }
                            return room;
                        });
                    });
                    // Sync server unread counts into the atom so Messages icon stays accurate
                    // This covers topic replies which are not in roomMessages client state
                    const serverCounts: Record<string, number> = {};
                    for (const room of result.rooms) {
                        const roomId = String(room._id || room.handle || "");
                        if (roomId) {
                            serverCounts[roomId] = room._id === openChatIdRef.current
                                ? 0
                                : (room as any).unreadCount || 0;
                        }
                    }
                    setUnreadCounts((prev) => ({ ...prev, ...serverCounts }));
                }
            } catch (error) {
                console.error("Failed to load chat rooms:", error);
            } finally {
                if (isMounted) {
                    setIsChatRoomsLoading(false);
                    setHasLoadedChatRooms(true);
                }
            }
        };

        loadRooms();

        // poll so unreadCount updates (mongo chat)
        const interval = setInterval(loadRooms, 3000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [user]);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatLayout.1");
        }
    }, []);

    const filteredChatRooms = useMemo(() => {
        const term = chatSearchTerm.trim().toLowerCase();
        if (!term) return chatRooms;

        return chatRooms.filter((chat) => {
            const nameMatch = chat.name?.toLowerCase().includes(term);
            const handleMatch = chat.handle?.toLowerCase().includes(term);
            const circleNameMatch = chat.circle?.name?.toLowerCase().includes(term);
            const circleHandleMatch = chat.circle?.handle?.toLowerCase().includes(term);

            return !!(nameMatch || handleMatch || circleNameMatch || circleHandleMatch);
        });
    }, [chatRooms, chatSearchTerm]);

    if (!user) {
        return <div className="p-4"></div>;
    }

    // Gather all chat rooms
    const segments = pathname.split("/").filter(Boolean); // e.g. ["chat"] or ["chat", "xyz-handle"]
    const isDetailRoute = segments.length > 1; // true if /chat/[handle]
    const showChatList = !isMobile || !isDetailRoute;

    // Find the chat room for the settings modal
    const selectedChat = chatSettingsModal.chatRoomId
        ? chatRooms.find((chat) => chat._id === chatSettingsModal.chatRoomId)
        : undefined;

    // Determine if current user is admin of the selected chat
    const isUserAdmin =
        selectedChat && user?.chatRoomMemberships
            ? (() => {
                  const membership = user.chatRoomMemberships.find((m) => m.chatRoom._id === selectedChat._id);
                  // Check role field, fallback to true for backward compatibility with old groups
                  // (groups created before role field was added)
                  return !!(membership?.role === "admin" || (membership && !membership.role));
              })()
            : false;

    return (
        <div>
            {showChatList && (
                <aside
                    className={`${
                        isMobile ? "w-full" : "fixed left-0 top-0 h-screen w-80 border-r border-gray-200 md:left-[72px]"
                    } flex flex-col bg-white p-2`}
                >
                    <div className="mb-4 mt-2 flex items-center justify-between pl-2 pt-0">
                        <h2 className="text-xl font-semibold">Chats</h2>
                        <Button variant="ghost" size="icon" onClick={() => setIsCreateModalOpen(true)}>
                            <SquarePen className="h-5 w-5" />
                        </Button>
                    </div>
                    <ChatSearch value={chatSearchTerm} onChange={setChatSearchTerm} />
                    <div className="flex-grow overflow-y-auto">
                        <ChatList
                            chats={filteredChatRooms}
                            isLoading={isChatRoomsLoading || !hasLoadedChatRooms}
                            searchTerm={chatSearchTerm}
                            totalChatsCount={chatRooms.length}
                            onChatClick={(chat) => {
                                // Track which chat is open so polling doesn't flash the badge
                                openChatIdRef.current = chat._id as string || null;
                                // Optimistic UI: clear sidebar badge immediately
                                setChatRooms((prev) =>
                                    prev.map((r) => (r._id === chat._id ? ({ ...r, unreadCount: 0 } as any) : r)),
                                );
                                // Read state is persisted by useMongoChat after messages load
                                // with the actual latest message ID — no need to mark here.
                            }}
                        />
                    </div>
                </aside>
            )}

            {/* main content: either the 'no chat selected' or the chosen chat */}
            <main className={`${!isMobile ? "ml-[372px]" : ""}`}>{children}</main>

            <CreateChatModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

            {/* Group Settings Modal - rendered at layout level */}
            {selectedChat && (
                <GroupSettingsModal
                    open={chatSettingsModal.isOpen}
                    onOpenChange={(open) =>
                        setChatSettingsModal({
                            chatRoomId: open ? chatSettingsModal.chatRoomId : null,
                            isOpen: open,
                        })
                    }
                    chatRoom={selectedChat}
                    isAdmin={isUserAdmin}
                />
            )}
        </div>
    );
}
