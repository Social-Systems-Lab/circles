// chat/[handle]/page.tsx - chat room page

import { redirect } from "next/navigation";
import { ChatRoomComponent } from "@/components/modules/chat/chat-room";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";

type ChatRoomPageProps = {
    params: Promise<{ handle: string }>;
};

export default async function ChatRoomPage(props: ChatRoomPageProps) {
    const params = await props.params;
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/welcome");
    }

    // check if user has access to chat room
    let privateUser = await getUserPrivate(userDid);
    let chatRoom = privateUser.chatRoomMemberships.find((m) => m.chatRoom.circle.handle === params.handle)?.chatRoom;
    if (!chatRoom) {
        redirect("/unauthorized");
    }

    return <ChatRoomComponent chatRoom={chatRoom} circle={chatRoom.circle} />;
}
