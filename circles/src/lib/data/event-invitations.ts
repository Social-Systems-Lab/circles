import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { isAuthorized } from "@/lib/auth/auth";
import { formatEventOccurrenceId, isValidEventOccurrenceKey } from "@/lib/event-occurrence";
import { getEventDetailHref } from "@/lib/event-route";
import type { Event, EventInvitation, UserPrivate } from "@/models/models";
import { getCircleById, isCirclePublished } from "./circle";
import { features } from "./constants";
import { EventInvitations, EventOccurrenceInvitations, EventOccurrenceRsvps } from "./db";
import { sendEmail } from "./email";
import { getEventById, normalizeEventHostCircleIds } from "./event";
import { getMember } from "./member";

export async function insertEventInvitation(eventId: string, circleId: string, userDid: string): Promise<boolean> {
    // Older invitations have generated Mongo IDs. Keep their status and use the unique _id for new writes.
    if (await EventInvitations.findOne({ eventId, userDid }, { projection: { _id: 1 } })) return false;

    const identity = createHash("sha256")
        .update(JSON.stringify([eventId, userDid]))
        .digest("hex");
    const _id = new ObjectId(identity.slice(0, 24));
    const now = new Date();
    const invitation: Omit<EventInvitation, "_id"> = {
        eventId,
        circleId,
        userDid,
        status: "pending",
        createdAt: now,
        updatedAt: now,
    };
    const result = await EventInvitations.updateOne({ _id }, { $setOnInsert: invitation }, { upsert: true });
    return result.upsertedCount === 1;
}

async function readPendingInvitation(eventId: string, circleId: string, userDid: string) {
    // The event reader checks private invitations, every host's visibility and occurrence validity.
    const event = await getEventById(eventId, userDid);
    if (!event || event.stage !== "open" || event.isOccurrenceCancelled) return null;
    const endTime = new Date(event.endAt).getTime() + (event.allDay ? 86_400_000 : 0);
    if (!(endTime > Date.now())) return null;
    if (event.userRsvpStatus && event.userRsvpStatus !== "none") return null;
    if (
        event.seriesId &&
        (await EventOccurrenceRsvps.findOne(
            { seriesId: event.seriesId, occurrenceKey: event.occurrenceKey, userDid },
            { projection: { _id: 1 } },
        ))
    ) {
        // An explicit "none" RSVP means the member is no longer attending this occurrence.
        return null;
    }

    const host = await findEventInvitationHost(event, circleId, userDid, true);
    if (!host) return null;
    const href = getEventDetailHref({ ...event, _id: eventId }, { id: host._id, handle: host.handle });
    return href ? { event, href: href.replace("#circle-tabs", "#event-rsvp") } : null;
}

export async function findEventInvitationHost(event: Event, circleId: string, userDid: string, requireRsvp: boolean) {
    const hosts = normalizeEventHostCircleIds(event);
    for (const hostId of new Set([circleId, ...hosts])) {
        if (!hosts.includes(hostId)) continue;
        if (!(await isAuthorized(userDid, hostId, features.events.view))) continue;
        if (requireRsvp && !(await isAuthorized(userDid, hostId, features.events.rsvp))) continue;
        const host = await getCircleById(hostId);
        if (!host?.handle || !host.enabledModules?.includes("events")) continue;
        if (!isCirclePublished(host) && host.createdBy !== userDid) {
            const membership = await getMember(userDid, hostId);
            if (!membership?.userGroups?.includes("admins")) continue;
        }
        return host;
    }
    return null;
}

export async function listPendingEventInvitations(userDid: string) {
    const [eventInvitations, occurrenceInvitations] = await Promise.all([
        EventInvitations.find({ userDid }, { projection: { eventId: 1, circleId: 1, status: 1 } }).toArray(),
        EventOccurrenceInvitations.find(
            { userDid },
            { projection: { seriesId: 1, occurrenceKey: 1, circleId: 1 } },
        ).toArray(),
    ]);
    const answeredEventIds = new Set(
        eventInvitations.filter(({ status }) => status !== "pending").map(({ eventId }) => eventId),
    );
    const targets = new Map<string, string>();
    for (const { eventId, circleId } of eventInvitations) {
        if (!answeredEventIds.has(eventId)) targets.set(eventId, circleId);
    }
    for (const { seriesId, occurrenceKey, circleId } of occurrenceInvitations) {
        if (ObjectId.isValid(seriesId) && isValidEventOccurrenceKey(occurrenceKey)) {
            targets.set(formatEventOccurrenceId(seriesId, new Date(occurrenceKey)), circleId);
        }
    }

    const invitations = await Promise.all(
        Array.from(targets, async ([id, circleId]) => {
            const invitation = await readPendingInvitation(id, circleId, userDid);
            if (!invitation) return null;
            const { event, href } = invitation;
            return {
                id,
                href,
                title: event.title,
                startAt: event.startAt,
                allDay: event.allDay,
                organiser: event.author?.name,
            };
        }),
    );
    return invitations
        .filter((invitation) => invitation !== null)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export async function emailNewEventInvitation(eventId: string, circleId: string, user: UserPrivate): Promise<void> {
    try {
        if (!user.did || user.circleType !== "user" || !user.email || user.isEmailVerified !== true) return;
        const invitation = await readPendingInvitation(eventId, circleId, user.did);
        if (!invitation) return;
        const { event, href } = invitation;
        const url = new URL(href, process.env.CIRCLES_URL);
        url.searchParams.set("respond", "1");
        const when = new Intl.DateTimeFormat("en-ZA", {
            dateStyle: "long",
            timeStyle: event.allDay ? undefined : "short",
            timeZone: "UTC",
        }).format(new Date(event.startAt));
        const address = [event.location?.street, event.location?.city, event.location?.region, event.location?.country]
            .filter(Boolean)
            .join(", ");
        const location = event.isHybrid
            ? [address, "Online"].filter(Boolean).join(" / ")
            : event.isVirtual
              ? "Online"
              : address;
        await sendEmail({
            to: user.email,
            templateAlias: "event-invitation",
            templateModel: {
                title: event.title,
                when: `${when} ${event.allDay ? "(all day)" : "UTC"}`,
                location: location || "See the event in Kamooni for location details",
                actionUrl: url.toString(),
            },
        });
    } catch {
        // Email is best effort. The invitation remains available in Kamooni.
        console.warn("Event invitation email could not be sent");
    }
}
