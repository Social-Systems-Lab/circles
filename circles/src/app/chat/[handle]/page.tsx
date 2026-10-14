// chat/[handle]/page.tsx - chat room page

import { notFound, redirect } from "next/navigation";
import { ChatRoomComponent } from "@/components/modules/chat/chat-room";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { buildCanonicalChatRedirectPath, validateTopicDeepLink } from "@/lib/chat/topic-deep-link";

type ChatRoomPageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ topic?: string | string[] }>;
};

export default async function ChatRoomPage(props: ChatRoomPageProps) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/welcome");
    }

    const { resolveMongoConversationAccess } = await import("@/components/modules/chat/mongo-actions");
    const { listChatRoomsAction } = await import("@/components/modules/chat/mongo-actions");

    const slug = params.handle;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slug);
    const listResult = await listChatRoomsAction();
    const chats = listResult.success ? listResult.rooms || [] : [];

    // 1) If slug is an ObjectId, treat it as conversationId.
    if (isObjectId) {
        const access = await resolveMongoConversationAccess(slug, userDid);
        if (!access.ok || !access.conversation) {
            notFound();
        }

        const chatRoom = chats.find((room) => String(room._id) === slug);

        if (!chatRoom) {
            notFound();
        }

        const { findThreadStarter } = await import("@/lib/data/mongo-chat");
        const initialTopicId = await validateTopicDeepLink(searchParams.topic, slug, findThreadStarter);

        return <ChatRoomComponent chatRoom={chatRoom} circle={chatRoom.circle} initialTopicId={initialTopicId} />;
    }

    // 2) Otherwise treat slug as handle and redirect to canonical /chat/<conversationId>.
    const match = chats.find((c) => c.handle === slug || c.circle?.handle === slug);
    if (!match?._id) {
        notFound();
    }

    redirect(buildCanonicalChatRedirectPath(String(match._id), searchParams.topic));
}
