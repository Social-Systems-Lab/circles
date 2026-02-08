// chat/[handle]/page.tsx - chat room page

import { redirect } from "next/navigation";
import { ChatRoomComponent } from "@/components/modules/chat/chat-room";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { getCircleByDid, getCircleByHandle } from "@/lib/data/circle";

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

    const chatProvider = process.env.CHAT_PROVIDER || "matrix";
    if (chatProvider === "mongo") {
        const { listConversationsForUser, findOrCreateDmConversation } = await import("@/lib/data/mongo-chat");
        const circleIds = (privateUser?.memberships || [])
            .map((membership) => membership.circleId)
            .filter(Boolean);

        let chats = await listConversationsForUser(userDid, circleIds);
        let chatRoom = chats.find(
            (chat) => chat.circle?.handle === params.handle || chat.handle === params.handle,
        );

        if (!chatRoom) {
            const target = await getCircleByHandle(params.handle);
            if (target?.did && target.did !== userDid) {
                const currentUser = await getCircleByDid(userDid);
                if (currentUser) {
                    await findOrCreateDmConversation(currentUser, target);
                    chats = await listConversationsForUser(userDid, circleIds);
                    chatRoom = chats.find(
                        (chat) => chat.circle?.handle === params.handle || chat.handle === params.handle,
                    );
                }
            }
        }

        if (!chatRoom) {
            redirect("/unauthorized");
        }

        return <ChatRoomComponent chatRoom={chatRoom} circle={chatRoom.circle} chatProvider="mongo" />;
    }
    
    console.log("Looking for chat with handle:", params.handle);
    console.log("Available chat handles:", privateUser.chatRoomMemberships.map(m => ({
        circleHandle: m.chatRoom.circle?.handle,
        chatHandle: m.chatRoom.handle,
        name: m.chatRoom.name
    })));
    
    let chatRoom = privateUser.chatRoomMemberships.find((m) => m.chatRoom.circle?.handle === params.handle || m.chatRoom.handle === params.handle)?.chatRoom;
    if (!chatRoom) {
        console.error("Chat room not found for handle:", params.handle);
        redirect("/unauthorized");
    }

    // If this is a DM without a Matrix room, create one
    console.log("Chat room check:", {
        isDirect: chatRoom.isDirect,
        hasMatrixRoomId: !!chatRoom.matrixRoomId,
        matrixRoomId: chatRoom.matrixRoomId,
        handle: params.handle
    });
    
    if (chatRoom.isDirect && !chatRoom.matrixRoomId) {
        console.log("Creating Matrix room for DM without one");
        const { findOrCreateDMRoom } = await import("@/lib/data/chat");
        const { getCircleById } = await import("@/lib/data/circle");
        
        // Get the other participant
        const otherParticipantId = chatRoom.dmParticipants?.find((id) => id !== privateUser._id);
        if (otherParticipantId) {
            const otherParticipant = await getCircleById(otherParticipantId);
            if (otherParticipant) {
                const currentUser = await getCircleById(privateUser._id!);
                if (currentUser) {
                    // This will create the Matrix room if it doesn't exist
                    chatRoom = await findOrCreateDMRoom(currentUser, otherParticipant);
                }
            }
        }
    }

    return <ChatRoomComponent chatRoom={chatRoom} circle={chatRoom.circle} chatProvider="matrix" />;
}
