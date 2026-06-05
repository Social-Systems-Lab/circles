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

    const privateUser = await getUserPrivate(userDid);
    const { resolveMongoConversationAccess } = await import("@/components/modules/chat/mongo-actions");
    const { listConversationsForUser } = await import("@/lib/data/mongo-chat");

    const slug = params.handle;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slug);
    const circleIds = (privateUser?.memberships || []).map((m) => m.circleId).filter(Boolean);
    const chats = await listConversationsForUser(userDid, circleIds);

    // 1) If slug is an ObjectId, treat it as conversationId.
    if (isObjectId) {
        const access = await resolveMongoConversationAccess(slug, userDid);
        if (!access.ok || !access.conversation) {
            redirect("/unauthorized");
        }

        const chatRoom = chats.find((room) => String(room._id) === slug);

        if (!chatRoom) {
            redirect("/unauthorized");
        }

        return <ChatRoomComponent chatRoom={chatRoom} circle={chatRoom.circle} />;
    }

    // 2) Otherwise treat slug as handle and redirect to canonical /chat/<conversationId>.
    const match = chats.find((c) => c.handle === slug || c.circle?.handle === slug);
    if (!match?._id) {
        redirect("/unauthorized");
    }

    redirect(`/chat/${match._id}`);
}
