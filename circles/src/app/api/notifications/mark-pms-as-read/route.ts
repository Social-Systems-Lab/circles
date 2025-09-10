import { NextRequest, NextResponse } from "next/server";
import { Notifications } from "@/lib/data/db";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";

export async function POST(req: NextRequest) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { roomId } = await req.json();
        if (!roomId) {
            return NextResponse.json({ error: "Room ID is required" }, { status: 400 });
        }

        const result = await Notifications.updateMany(
            {
                userId: userDid,
                "content.roomId": roomId,
                type: "pm_received",
                isRead: false,
            },
            { $set: { isRead: true } },
        );

        return NextResponse.json({ success: true, updatedCount: result.modifiedCount });
    } catch (error) {
        console.error("Error marking PM notifications as read:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
