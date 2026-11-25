import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUnreadNotificationCountForUser, listNotificationsForUser } from "@/lib/data/notifications";
import { BELL_EXCLUDED_NOTIFICATION_TYPES } from "@/lib/notifications/bell-filter";
import { listPendingEventInvitations } from "@/lib/data/event-invitations";

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
            listNotificationsForUser(userDid, limit, { excludeTypes: BELL_EXCLUDED_NOTIFICATION_TYPES }),
            getUnreadNotificationCountForUser(userDid, { excludeTypes: BELL_EXCLUDED_NOTIFICATION_TYPES }),
        ]);
        const eventInviteIds = notifications.flatMap(({ type, content }) =>
            type === "event_invitation" && typeof content?.eventId === "string" ? [content.eventId] : [],
        );
        const pendingInvitations = await listPendingEventInvitations(userDid, eventInviteIds).catch(() => {
            console.error("Could not load pending event invitation actions");
            return [];
        });
        const eventRsvpById = new Map(pendingInvitations.map(({ id, href }) => [id, href]));

        return NextResponse.json({
            notifications: notifications.map((notification: any) => ({
                ...notification,
                _id: notification._id?.toString?.() || notification._id,
                eventRsvpHref:
                    notification.type === "event_invitation"
                        ? eventRsvpById.get(notification.content?.eventId)
                        : undefined,
            })),
            unreadCount,
        });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
