"use client";

import { PropsWithChildren, useMemo } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { ChatList } from "@/components/modules/chat/chat-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import emptyFeed from "@images/empty-feed.png";
import { Button } from "@/components/ui/button";

export default function ChatLayout({ children }: PropsWithChildren) {
    const [user] = useAtom(userAtom);
    const isMobile = useIsMobile();
    const router = useRouter();
    const pathname = usePathname();

    // If user not logged in, you could handle this or do a redirect:
    if (!user) {
        return <div className="p-4">Please log in to access chats</div>;
    }

    // Gather all chat rooms
    const allChats = user.chatRoomMemberships?.map((m) => m.chatRoom) || [];

    // If no chats => Show full screen "No chats" message
    if (!allChats.length) {
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

    const segments = pathname.split("/").filter(Boolean); // e.g. ["chat"] or ["chat", "xyz-handle"]
    const isDetailRoute = segments.length > 1; // true if /chat/[handle]
    const showChatList = !isMobile || !isDetailRoute;

    return (
        <div className="flex h-screen">
            {showChatList && (
                <aside className="w-80 border-r border-gray-200 bg-white p-2">
                    <h2 className="mb-4 mt-2 pl-2 pt-0 text-xl font-semibold">Chats</h2>
                    <ScrollArea>
                        <ChatList chats={allChats} />
                    </ScrollArea>
                </aside>
            )}

            {/* main content: either the 'no chat selected' or the chosen chat */}
            <main className="flex-1">{children}</main>
        </div>
    );
}
