import { NextRequest, NextResponse } from "next/server";
import { Circles, Notifications } from "@/lib/data/db";
import { sendEmail } from "@/lib/data/email";
import { ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
    const AUTH_TOKEN = process.env.CRON_SECRET;
    const bearerToken = req.headers.get("authorization");

    if (!bearerToken || bearerToken.split(" ")[1] !== AUTH_TOKEN) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const users = await Circles.find({ agreedToEmailUpdates: true }).toArray();

        for (const user of users) {
            const unreadNotifications = await Notifications.find({
                userId: user.did,
                isRead: false,
                lastEmailedAt: { $exists: false },
                createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24 hours ago
            }).toArray();

            if (unreadNotifications.length > 0) {
                await sendEmail({
                    to: user.email!,
                    templateAlias: "notification-reminder",
                    templateModel: {
                        name: user.name,
                        notifications: unreadNotifications.map((n) => n.content),
                    },
                });

                const notificationIds = unreadNotifications.map((n) => n._id);
                await Notifications.updateMany(
                    { _id: { $in: notificationIds } },
                    { $set: { lastEmailedAt: new Date() } },
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error in email reminder cron job:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
