"use client";

import { useIsMobile } from "@/components/utils/use-is-mobile";

export default function ArchivedConversationsPage() {
    const isMobile = useIsMobile();
    if (isMobile) return null;
    return (
        <div className="flex h-screen items-center justify-center text-gray-500">Select an archived conversation</div>
    );
}
