import { NextRequest, NextResponse } from "next/server";
import { Notifications } from "@/lib/data/db";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { markNotificationReadForUser } from "@/lib/data/notification-read";
import { readJsonBodyLimited } from "@/lib/security/bounded-input";

export async function POST(req: NextRequest) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await readJsonBodyLimited(req, 4 * 1024);
        if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
        const notificationId =
            body.value && typeof body.value === "object" && !Array.isArray(body.value)
                ? (body.value as { notificationId?: unknown }).notificationId
                : undefined;
        if (typeof notificationId !== "string" || notificationId.length > 128) {
            return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 });
        }
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
