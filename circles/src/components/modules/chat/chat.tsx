"use server";

import { ModulePageProps } from "../dynamic-page";
import { getChatRoomByHandle, getChatMessages } from "@/lib/data/chat";
import { ChatRoomComponent } from "./chat-room";
import { ThirdColumn } from "./third-column";
import { getChatMessagesAction } from "./actions";
import { SortingOptions } from "@/models/models";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";

export default async function ChatModule({ circle, page, subpage, isDefaultCircle, searchParams }: ModulePageProps) {
    const chatRoom = await getChatRoomByHandle(circle?._id, subpage);
    if (!chatRoom) {
        return <div></div>;
    }
    const messages = await getChatMessagesAction(chatRoom._id, circle._id, 20, 0, searchParams?.sort as SortingOptions);

    return (
        <ContentDisplayWrapper content={messages}>
            <ChatRoomComponent
                initialMessages={messages}
                chatRoom={chatRoom}
                circle={circle}
                page={page}
                subpage={subpage}
                isDefaultCircle={isDefaultCircle}
            />
            <ThirdColumn />
        </ContentDisplayWrapper>
    );
}
