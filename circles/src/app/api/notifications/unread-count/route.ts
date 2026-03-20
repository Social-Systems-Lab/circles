import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUnreadNotificationCountForUser } from "@/lib/data/notifications";

export async function GET() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const unreadCount = await getUnreadNotificationCountForUser(userDid);
        return NextResponse.json({ unreadCount });
    } catch (error) {
        console.error("Error fetching notification unread count:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
