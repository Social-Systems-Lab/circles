"use server";

import { createDefaultChatRooms, getChatRooms } from "@/lib/data/chat";
import { ModuleLayoutPageProps } from "../dynamic-page-layout";
import { ChatLayoutWrapper } from "./chat-layout-wrapper";
import { redirect } from "next/navigation";
import { ChatRoom } from "@/models/models";

export default async function ChatLayout({ children, circle, page, isDefaultCircle }: ModuleLayoutPageProps) {
    // get chat-rooms
    let chatRooms = await getChatRooms(circle?._id);
    if (!chatRooms || chatRooms.length === 0) {
        console.log("Creating chat rooms");

        // create default feeds
        chatRooms = (await createDefaultChatRooms(circle?._id)) as ChatRoom[];
        if (!chatRooms) {
            // redirect to error
            redirect("/error");
        }
    }

    return (
        <ChatLayoutWrapper circle={circle} chatRooms={chatRooms} isDefaultCircle={isDefaultCircle}>
            {children}
        </ChatLayoutWrapper>
    );
}
