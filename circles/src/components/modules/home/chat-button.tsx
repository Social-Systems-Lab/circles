"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { Circle } from "@/models/models";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { ensureCircleConversationAction } from "@/components/modules/chat/actions";

interface ChatButtonProps {
    circle: Circle;
    renderCompact?: boolean;
}

const ChatButton: React.FC<ChatButtonProps> = ({ circle, renderCompact }) => {
    const router = useRouter();
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const res = await ensureCircleConversationAction(String(circle._id));
        if (res.success && res.roomId) {
            router.push("/chat/" + res.roomId);
        }
    };

    return (
        <Button
            onClick={handleClick}
            variant={compact ? "ghost" : "outline"}
            className={compact ? "h-[32px] w-[32px] p-0" : "gap-2 rounded-full"}
        >
            <MessageCircle className="h-4 w-4" />
            {compact ? "" : "Chat"}
        </Button>
    );
};

export default ChatButton;
