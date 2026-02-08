// chat/layout.tsx - chat layout component, lists all chat rooms and shows selected chat room
"use client";

import { PropsWithChildren, useEffect, useState } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { ChatList } from "@/components/modules/chat/chat-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter, usePathname } from "next/navigation";
import { ChatSearch } from "@/components/modules/chat/chat-search";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { CreateChatModal } from "@/components/modules/chat/create-chat-modal";
import { GroupSettingsModal } from "@/components/modules/chat/group-settings-modal";
import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatSettingsModalAtom } from "@/lib/data/atoms";
import { ChatRoomDisplay } from "@/models/models";

export default function ChatLayout({ children }: PropsWithChildren) {
    const [user] = useAtom(userAtom);
    const isMobile = useIsMobile();
    const pathname = usePathname();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [chatSettingsModal, setChatSettingsModal] = useAtom(chatSettingsModalAtom);

    const [chatRooms, setChatRooms] = useState<ChatRoomDisplay[]>([]);

    useEffect(() => {
        let isMounted = true;
        const loadRooms = async () => {
            if (!user) {
                if (isMounted) setChatRooms([]);
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
            }
        };

        loadRooms();
        return () => {
            isMounted = false;
        };
    }, [user]);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatLayout.1");
        }
    }, []);

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
    const isUserAdmin = selectedChat && user?.chatRoomMemberships
        ? (() => {
            const membership = user.chatRoomMemberships.find(
                m => m.chatRoom._id === selectedChat._id
            );
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
                    <div className="flex items-center justify-between mb-4 mt-2 pl-2 pt-0">
                        <h2 className="text-xl font-semibold">Chats</h2>
                        <Button variant="ghost" size="icon" onClick={() => setIsCreateModalOpen(true)}>
                            <SquarePen className="h-5 w-5" />
                        </Button>
                    </div>
                    <ChatSearch />
                    <div className="flex-grow overflow-y-auto">
                        <ChatList chats={chatRooms} />
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
