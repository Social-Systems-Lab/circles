// chat/layout.tsx - chat layout component, lists all chat rooms and shows selected chat room
"use client";

import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useClientMediaQuery } from "@/components/utils/use-is-mobile";
import { ChatList } from "@/components/modules/chat/chat-list";
import { usePathname, useRouter } from "next/navigation";
import { ChatSearch } from "@/components/modules/chat/chat-search";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { CreateChatModal } from "@/components/modules/chat/create-chat-modal";
import { GroupSettingsModal } from "@/components/modules/chat/group-settings-modal";
import { Archive, BookmarkCheck, MessageCircle, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatSettingsModalAtom } from "@/lib/data/atoms";
import { useChatRoomList } from "@/components/modules/chat/chat-room-list-provider";
import { ChatDraftRows } from "@/components/modules/chat/chat-draft-rows";
import { dispatchNotificationRefresh } from "@/lib/client/notification-events";
import { listDmDraftsAction } from "@/components/modules/chat/draft-actions";
import { ChatLayoutProvider } from "@/components/modules/chat/chat-layout-context";
import { getPostArchiveNavigationTarget } from "@/lib/chat/archive-navigation";

export default function ChatLayout({ children }: PropsWithChildren) {
    const [user] = useAtom(userAtom);
    // Tailwind's md breakpoint starts at 768px, so chat must stop using the
    // bottom-navigation layout one pixel earlier than the shared mobile hook.
    const isChatMobile = useClientMediaQuery("(max-width: 767px)");
    const pathname = usePathname();
    const router = useRouter();
    const isArchivedRoute = pathname === "/chat/archived" || pathname.startsWith("/chat/archived/");
    const isFollowUpsRoute = pathname.startsWith("/chat/follow-ups");
    const isMessagesRoute = !isArchivedRoute && !isFollowUpsRoute;
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [chatSearchTerm, setChatSearchTerm] = useState("");
    const [chatSettingsModal, setChatSettingsModal] = useAtom(chatSettingsModalAtom);
    const { rooms: chatRooms, unreadCounts, status, refresh } = useChatRoomList(isArchivedRoute);
    const loadRooms = useCallback(() => refresh("retry"), [refresh]);
    const userDid = user?.did;

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
    const isDetailRoute = segments.length > (isArchivedRoute ? 2 : 1);
    const showChatList = !isChatMobile || !isDetailRoute;

    // Find the chat room for the settings modal
    const selectedChat = chatSettingsModal.chatRoomId
        ? chatRooms.find((chat) => chat._id === chatSettingsModal.chatRoomId)
        : undefined;

    // Determine if current user is admin of the selected chat
    const isUserAdmin =
        selectedChat && user?.chatRoomMemberships
            ? (() => {
                  const membership = user.chatRoomMemberships.find((m) => m.chatRoomId === String(selectedChat._id));
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
                        isChatMobile
                            ? "w-full"
                            : "fixed left-0 top-0 h-screen w-80 border-r border-gray-200 md:left-[72px]"
                    } flex flex-col bg-white p-2 ${isChatMobile ? "pt-16" : ""}`}
                    style={
                        isChatMobile ? { height: "calc(100dvh - 56px - env(safe-area-inset-bottom, 0px))" } : undefined
                    }
                >
                    <div className="mb-4 mt-2 flex items-center justify-between pl-2 pt-0">
                        <h2 className="text-xl font-semibold">
                            {isArchivedRoute ? "Archived" : isFollowUpsRoute ? "Follow-ups" : "Messages"}
                        </h2>
                        {isMessagesRoute && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                onClick={() => setIsCreateModalOpen(true)}
                                aria-label="New message"
                            >
                                <SquarePen className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                    <nav className="mb-2 grid grid-cols-3 gap-1" aria-label="Message views">
                        <Button
                            variant="ghost"
                            className={`h-11 min-w-0 justify-center gap-1 px-1 text-xs ${
                                isMessagesRoute ? "bg-[#F1F6DF] text-[#2d6a45] hover:bg-[#e8f0cf]" : ""
                            }`}
                            onClick={() => router.push("/chat")}
                            aria-current={isMessagesRoute ? "page" : undefined}
                        >
                            <MessageCircle className="h-4 w-4 flex-none" aria-hidden="true" />
                            <span className="min-w-0 truncate">Messages</span>
                        </Button>
                        <Button
                            variant="ghost"
                            className={`h-11 min-w-0 justify-center gap-1 px-1 text-xs ${
                                isFollowUpsRoute ? "bg-[#F1F6DF] text-[#2d6a45] hover:bg-[#e8f0cf]" : ""
                            }`}
                            onClick={() => router.push("/chat/follow-ups")}
                            aria-current={isFollowUpsRoute ? "page" : undefined}
                        >
                            <BookmarkCheck className="h-4 w-4 flex-none" aria-hidden="true" />
                            <span className="min-w-0 truncate">Follow-ups</span>
                        </Button>
                        <Button
                            variant="ghost"
                            className={`h-11 min-w-0 justify-center gap-1 px-1 text-xs ${
                                isArchivedRoute ? "bg-[#F1F6DF] text-[#2d6a45] hover:bg-[#e8f0cf]" : ""
                            }`}
                            onClick={() => router.push("/chat/archived")}
                            aria-current={isArchivedRoute ? "page" : undefined}
                        >
                            <Archive className="h-4 w-4 flex-none" aria-hidden="true" />
                            <span className="min-w-0 truncate">Archived</span>
                        </Button>
                    </nav>
                    <ChatSearch value={chatSearchTerm} onChange={setChatSearchTerm} />
                    <div className="flex-grow overflow-y-auto">
                        {!isArchivedRoute && userDid && (
                            <ChatDraftRows
                                key={userDid}
                                viewerDid={userDid}
                                ready={status !== "loading"}
                                composerPath={pathname.startsWith("/chat/new/") ? pathname : null}
                                loadDrafts={listDmDraftsAction}
                                onOpen={(recipientDid) => router.push(`/chat/new/${encodeURIComponent(recipientDid)}`)}
                            />
                        )}
                        <ChatList
                            chats={filteredChatRooms}
                            unreadCounts={unreadCounts}
                            key={`${userDid}:${isArchivedRoute}`}
                            isLoading={status === "loading"}
                            hasLoadError={status === "error"}
                            onRetryLoad={loadRooms}
                            searchTerm={chatSearchTerm}
                            totalChatsCount={chatRooms.length}
                            archivedView={isArchivedRoute}
                            onRetryMutePreferences={loadRooms}
                            onArchive={async (chat) => {
                                const conversationId = String(chat._id);
                                const { archiveDmConversationAction } = await import(
                                    "@/components/modules/chat/actions"
                                );
                                const result = await archiveDmConversationAction(conversationId);
                                if (result.success) {
                                    dispatchNotificationRefresh({ reason: "chat-rooms-changed", roomId: conversationId });
                                    const navigationTarget = getPostArchiveNavigationTarget(pathname, conversationId);
                                    if (navigationTarget) router.replace(navigationTarget);
                                } else {
                                    alert(result.message || "Failed to archive conversation");
                                }
                            }}
                            onUnarchive={async (chat) => {
                                const { unarchiveDmConversationAction } = await import(
                                    "@/components/modules/chat/actions"
                                );
                                const result = await unarchiveDmConversationAction(String(chat._id));
                                if (result.success) {
                                    dispatchNotificationRefresh({ reason: "chat-rooms-changed", roomId: String(chat._id) });
                                    router.push(`/chat/${String(chat._id)}`);
                                } else {
                                    alert(result.message || "Failed to unarchive conversation");
                                }
                            }}
                            onChatClick={(chat) => {
                                // Topic replies remain unread until their topic is opened.
                                // useMongoChat advances only the legacy loose-message cursor.
                            }}
                        />
                    </div>
                </aside>
            )}

            {/* main content: either the 'no chat selected' or the chosen chat */}
            <main className={`${!isChatMobile ? "ml-[372px]" : ""}`}>
                <ChatLayoutProvider value={{ chatRooms, hasLoadedChatRooms: status === "ready", chatRoomsLoadFailed: status === "error" }}>
                    {children}
                </ChatLayoutProvider>
            </main>

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
