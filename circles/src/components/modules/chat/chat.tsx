// chat.tsx

"use server";

import { ModulePageProps } from "../dynamic-page";
import { getChatRoomByHandle } from "@/lib/data/chat";
import { ChatRoomComponent } from "./chat-room";
import { ChatRoomDisplay, SortingOptions } from "@/models/models";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { ThirdColumn } from "../feeds/third-column";

export default async function ChatModule({ circle, , searchParams }: ModulePageProps) {
    const chatRoom = (await getChatRoomByHandle(circle?._id)) as ChatRoomDisplay;
    if (!chatRoom) {
        return <div></div>;
    }

    return (
        <ContentDisplayWrapper content={[]}>
            <ChatRoomComponent chatRoom={chatRoom} circle={circle} />
            <ThirdColumn />
        </ContentDisplayWrapper>
    );
}
