import { NextRequest, NextResponse } from "next/server";
import { Notifications } from "@/lib/data/db";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { markNotificationReadForUser } from "@/lib/data/notification-read";

export async function POST(req: NextRequest) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { notificationId } = await req.json();
        const result = await markNotificationReadForUser(Notifications, notificationId, userDid);
        if (!result) return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 });

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: "Notification not found or user mismatch" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
