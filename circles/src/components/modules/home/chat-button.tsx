"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { Circle } from "@/models/models";
import { useIsCompact } from "@/components/utils/use-is-compact";

interface ChatButtonProps {
    circle: Circle;
    renderCompact?: boolean;
}

const ChatButton: React.FC<ChatButtonProps> = ({ circle, renderCompact }) => {
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;

    return (
        <Link href={`/chat/${circle.handle}`} passHref>
            <Button
                variant={compact ? "ghost" : "outline"}
                className={compact ? "h-[32px] w-[32px] p-0" : "gap-2 rounded-full"}
                asChild={false} // Ensure this doesn't act as a slot for the Link
            >
                <MessageCircle className="h-4 w-4" />
                {compact ? "" : "Chat"}
            </Button>
        </Link>
    );
};

export default ChatButton;
