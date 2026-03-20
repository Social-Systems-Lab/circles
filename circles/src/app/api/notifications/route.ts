import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUnreadNotificationCountForUser, listNotificationsForUser } from "@/lib/data/notifications";

export async function GET(req: Request) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawLimit = Number(searchParams.get("limit") || "50");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;

    try {
        const [notifications, unreadCount] = await Promise.all([
            listNotificationsForUser(userDid, limit),
            getUnreadNotificationCountForUser(userDid),
        ]);

        return NextResponse.json({
            notifications: notifications.map((notification: any) => ({
                ...notification,
                _id: notification._id?.toString?.() || notification._id,
            })),
            unreadCount,
        });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
