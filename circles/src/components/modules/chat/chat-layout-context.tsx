"use client";

import { createContext, useContext } from "react";
import type { ChatRoomDisplay } from "@/models/models";

type ChatLayoutState = {
    chatRooms: ChatRoomDisplay[];
    hasLoadedChatRooms: boolean;
};

const ChatLayoutContext = createContext<ChatLayoutState | null>(null);

export const ChatLayoutProvider = ChatLayoutContext.Provider;

export const useChatLayout = (): ChatLayoutState => {
    const context = useContext(ChatLayoutContext);
    if (!context) throw new Error("useChatLayout must be used inside ChatLayoutProvider");
    return context;
};
