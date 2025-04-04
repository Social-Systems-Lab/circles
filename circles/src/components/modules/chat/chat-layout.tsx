"use server";

import { createDefaultChatRooms, getChatRooms } from "@/lib/data/chat";
import { ChatLayoutWrapper } from "./chat-layout-wrapper";
import { redirect } from "next/navigation";
import { ChatRoom, Circle } from "@/models/models";
import React from "react";

type PageProps = {
    circle: Circle;
    children: React.ReactNode;
};

export default async function ChatLayout({ children, circle }: PageProps) {
    // get chat-rooms
    let chatRooms = await getChatRooms(circle?._id);
    if (!chatRooms || chatRooms.length === 0) {
        console.log("Creating chat rooms");

        // create default chat rooms
        chatRooms = (await createDefaultChatRooms(circle?._id)) as ChatRoom[];
        if (!chatRooms) {
            // redirect to error
            redirect("/error");
        }
    }

    return (
        <ChatLayoutWrapper circle={circle} chatRooms={chatRooms}>
            {children}
        </ChatLayoutWrapper>
    );
}
