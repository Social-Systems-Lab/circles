// chat.tsx

"use server";

import { ModulePageProps } from "../dynamic-page";
import { getChatRoomByHandle } from "@/lib/data/chat";
import { ChatRoomComponent } from "./chat-room";
import { ChatRoomDisplay, SortingOptions } from "@/models/models";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { ThirdColumn } from "../feeds/third-column";

export default async function ChatModule({ circle, page, subpage, searchParams }: ModulePageProps) {
    const chatRoom = (await getChatRoomByHandle(circle?._id, subpage)) as ChatRoomDisplay;
    if (!chatRoom) {
        return <div></div>;
    }

    return (
        <ContentDisplayWrapper content={[]}>
            <ChatRoomComponent chatRoom={chatRoom} circle={circle} page={page} subpage={subpage} />
            <ThirdColumn />
        </ContentDisplayWrapper>
    );
}
