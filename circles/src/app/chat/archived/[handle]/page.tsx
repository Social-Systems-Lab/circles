import { notFound, redirect } from "next/navigation";
import { ChatRoomComponent } from "@/components/modules/chat/chat-room";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { validateTopicDeepLink } from "@/lib/chat/topic-deep-link";

type ArchivedChatRoomPageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ topic?: string | string[] }>;
};

export default async function ArchivedChatRoomPage(props: ArchivedChatRoomPageProps) {
    const [{ handle }, searchParams] = await Promise.all([props.params, props.searchParams]);
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) redirect("/welcome");
    if (!/^[0-9a-fA-F]{24}$/.test(handle)) notFound();

    const { listChatRoomsAction, resolveMongoConversationAccess } = await import(
        "@/components/modules/chat/mongo-actions"
    );
    const [access, listResult] = await Promise.all([
        resolveMongoConversationAccess(handle, userDid, "read"),
        listChatRoomsAction("archived"),
    ]);
    const chatRoom = listResult.success
        ? (listResult.rooms || []).find((room) => String(room._id) === handle)
        : undefined;
    if (!access.ok || !chatRoom || access.conversation?.type !== "dm") notFound();

    const { findThreadStarter } = await import("@/lib/data/mongo-chat");
    const initialTopicId = await validateTopicDeepLink(searchParams.topic, handle, findThreadStarter);

    return (
        <ChatRoomComponent
            chatRoom={chatRoom}
            circle={chatRoom.circle}
            initialTopicId={initialTopicId}
            archivedReadOnly
        />
    );
}
