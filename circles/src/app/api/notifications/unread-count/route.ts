import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUnreadNotificationCountForUser } from "@/lib/data/notifications";
import { BELL_EXCLUDED_NOTIFICATION_TYPES } from "@/lib/notifications/bell-filter";

export async function GET() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const unreadCount = await getUnreadNotificationCountForUser(userDid, {
            excludeTypes: BELL_EXCLUDED_NOTIFICATION_TYPES,
        });
        return NextResponse.json({ unreadCount });
    } catch (error) {
        console.error("Error fetching notification unread count:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
