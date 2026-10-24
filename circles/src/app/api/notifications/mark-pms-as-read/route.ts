import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { acknowledgeTopicPmNotifications } from "@/lib/chat/pm-notification-read";

export async function POST(req: NextRequest) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { roomId, topicId, lastReadMessageId } = await req.json();
        if (!roomId || !topicId || !lastReadMessageId) {
            return NextResponse.json({ error: "Room, topic, and read boundary are required" }, { status: 400 });
        }

        const updatedCount = await acknowledgeTopicPmNotifications({
            userDid,
            conversationId: roomId,
            topicId,
            lastReadMessageId,
        });

        return NextResponse.json({ success: true, updatedCount });
    } catch (error) {
        console.error("Error marking PM notifications as read:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
