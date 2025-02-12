"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, ChatRoom } from "@/models/models";
import { FormNav, NavItem } from "@/components/forms/form-nav";
import { ChatNav } from "./chat-nav";
import { useEffect } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export type ChatLayoutWrapperProps = {
    circle: Circle;
    children: React.ReactNode;
    isDefaultCircle: boolean;
    chatRooms: ChatRoom[];
};

export const ChatLayoutWrapper = ({ children, circle, chatRooms, isDefaultCircle }: ChatLayoutWrapperProps) => {
    const isCompact = useIsCompact();
    const navItems = chatRooms.map((item) => ({
        name: item.name,
        handle: item.handle,
    })) as NavItem[];

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatLayoutWrapper.1");
        }
    }, []);

    return (
        <div
            className={"flex w-full bg-[#fbfbfb]"}
            style={{
                flexDirection: isCompact ? "column" : "row",
            }}
        >
            <div
                className="relative flex flex-col items-center"
                style={{
                    flex: isCompact ? "0" : "1",
                    alignItems: isCompact ? "normal" : "flex-end",
                    minWidth: isCompact ? "0px" : "240px",
                    paddingTop: isCompact ? "0" : "72px",
                }}
            >
                <ChatNav items={navItems} circle={circle} isDefaultCircle={isDefaultCircle} />
            </div>
            {children}
        </div>
    );
};
