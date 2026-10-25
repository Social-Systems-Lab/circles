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

    const { getChatRoomAction } = await import("@/components/modules/chat/mongo-actions");

    const slug = params.handle;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slug);
    const roomResult = await getChatRoomAction(slug);
    const chatRoom = roomResult.success ? roomResult.room : undefined;
    if (!chatRoom?._id) notFound();

    // 1) If slug is an ObjectId, treat it as conversationId.
    if (isObjectId) {
        const { findThreadStarter } = await import("@/lib/data/mongo-chat");
        const initialTopicId = await validateTopicDeepLink(searchParams.topic, slug, findThreadStarter);

        return <ChatRoomComponent chatRoom={chatRoom} circle={chatRoom.circle} initialTopicId={initialTopicId} />;
    }

    // 2) Otherwise treat slug as handle and redirect to canonical /chat/<conversationId>.
    redirect(buildCanonicalChatRedirectPath(String(chatRoom._id), searchParams.topic));
}
