"use client";

import { useIsMobile } from "@/components/utils/use-is-mobile";

export default function ChatPage() {
    const isMobile = useIsMobile();

    return (
        <div className="flex h-full items-center justify-center text-gray-500">
            {!isMobile && "Select a chat to start messaging"}
        </div>
    );
}
