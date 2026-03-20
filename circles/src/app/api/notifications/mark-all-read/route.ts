import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { markAllNotificationsReadForUser } from "@/lib/data/notifications";

export async function POST() {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await markAllNotificationsReadForUser(userDid);
        return NextResponse.json({ success: true, updatedCount: result.modifiedCount });
    } catch (error) {
        console.error("Error marking notifications as read:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
