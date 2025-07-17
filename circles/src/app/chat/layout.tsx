// chat/layout.tsx - chat layout component, lists all chat rooms and shows selected chat room
"use client";

import { PropsWithChildren, useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { ChatList } from "@/components/modules/chat/chat-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter, usePathname } from "next/navigation";
import { ChatSearch } from "@/components/modules/chat/chat-search";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export default function ChatLayout({ children }: PropsWithChildren) {
    const [user] = useAtom(userAtom);
    const isMobile = useIsMobile();
    const pathname = usePathname();
    const allChats = useMemo(
        () => user?.chatRoomMemberships?.map((m) => m.chatRoom) || [],
        [user?.chatRoomMemberships],
    );

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

    return (
        <div>
            {showChatList && (
                <aside
                    className={`${
                        isMobile ? "w-full" : "fixed left-0 top-0 h-screen w-80 border-r border-gray-200 md:left-[72px]"
                    } flex flex-col bg-white p-2`}
                >
                    <h2 className="mb-4 mt-2 pl-2 pt-0 text-xl font-semibold">Chats</h2>
                    <ChatSearch />
                    <ScrollArea className="flex-grow">
                        <ChatList chats={allChats} />
                    </ScrollArea>
                </aside>
            )}

            {/* main content: either the 'no chat selected' or the chosen chat */}
            <main className={`${!isMobile ? "ml-[372px]" : ""}`}>{children}</main>
        </div>
    );
}
