import { NextRequest, NextResponse } from "next/server";
import { Notifications } from "@/lib/data/db";
import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";

export async function POST(req: NextRequest) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { notificationId } = await req.json();
        if (!notificationId) {
            return NextResponse.json({ error: "Notification ID is required" }, { status: 400 });
        }

        const result = await Notifications.updateOne(
            { _id: new ObjectId(notificationId), userId: userDid },
            { $set: { isRead: true } },
        );

        if (result.matchedCount === 0) {
            return NextResponse.json({ error: "Notification not found or user mismatch" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
