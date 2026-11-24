import { ObjectId } from "mongodb";
import { EventOccurrenceInvitations, EventOccurrences, Events } from "@/lib/data/db";
import { getCircleByHandle, isCirclePublished } from "@/lib/data/circle";
import type { Event as EventModel, EventOccurrence, Location } from "@/models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { canReadEventContent } from "@/lib/data/event-host-read-policy";
import { getEventIcsRouteOverrides } from "@/lib/data/ics-route-test-dependencies";
import { parseEventOccurrenceId, resolveGeneratedEventOccurrence } from "@/lib/event-occurrence";

// Helpers for ICS formatting
function pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

function toUTCStringBasic(date: Date): string {
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function toDateOnly(date: Date): string {
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    return `${y}${m}${d}`;
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function escapeICS(text: string | undefined): string {
    if (!text) return "";
    return text
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
}

// RFC 5545 counts UTF-8 bytes, including the continuation space.
function foldLine(line: string): string {
    if (Buffer.byteLength(line) <= 75) return line;
    let folded = "";
    let bytes = 0;
    for (const character of line) {
        const length = Buffer.byteLength(character);
        if (bytes + length > 75) {
            folded += "\r\n ";
            bytes = 1;
        }
        folded += character;
        bytes += length;
    }
    return folded;
}

function foldLines(lines: string[]): string {
    return lines.map((l) => foldLine(l)).join("\r\n") + "\r\n";
}

function locationToString(loc?: Location): string | undefined {
    if (!loc) return undefined;
    const parts = [loc.street, loc.city, loc.region, loc.country].filter(Boolean);
    if (loc.lngLat && (loc.lngLat.lat || loc.lngLat.lng)) {
        parts.push(`(${loc.lngLat.lat}, ${loc.lngLat.lng})`);
    }
    return parts.length ? parts.join(", ") : undefined;
}

function slugifyForFilename(s: string): string {
    const base = s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "");
    return base || "event";
}

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

type EventIcsDependencies = {
    authenticate: typeof getAuthenticatedUserDid;
    findCircle: typeof getCircleByHandle;
    authorizeView: (viewerDid: string | undefined, circleId: string) => Promise<boolean>;
    findEvent: (id: ObjectId) => Promise<EventModel | null>;
    findOccurrence: (seriesId: string, occurrenceKey: number) => Promise<EventOccurrence | null>;
    hasOccurrenceInvitation: (seriesId: string, occurrenceKey: number, viewerDid: string) => Promise<boolean>;
    contentPolicyDependencies?: Parameters<typeof canReadEventContent>[2];
};

const defaultDependencies: EventIcsDependencies = {
    authenticate: getAuthenticatedUserDid,
    findCircle: getCircleByHandle,
    authorizeView: (viewerDid, circleId) => isAuthorized(viewerDid, circleId, features.events.view),
    findEvent: async (id) => (await Events.findOne({ _id: id })) as EventModel | null,
    findOccurrence: async (seriesId, occurrenceKey) => EventOccurrences.findOne({ seriesId, occurrenceKey }),
    hasOccurrenceInvitation: async (seriesId, occurrenceKey, userDid) =>
        Boolean(
            await EventOccurrenceInvitations.findOne({ seriesId, occurrenceKey, userDid }, { projection: { _id: 1 } }),
        ),
};

function createEventIcsGetHandler(dependencies: EventIcsDependencies = defaultDependencies) {
    return async function GET(
        req: Request,
        ctx: { params: Promise<{ handle: string; eventId: string }> },
    ): Promise<Response> {
        try {
            const deps = { ...dependencies, ...getEventIcsRouteOverrides() };
            const { handle, eventId } = await ctx.params;
            const occurrence = parseEventOccurrenceId(eventId);
            const lookupId = occurrence?.seriesId ?? eventId;
            if (!handle || !ObjectId.isValid(lookupId)) {
                return notFound();
            }

            const viewerDid = await deps.authenticate();
            const circle = await deps.findCircle(handle);
            if (!circle?._id || !isCirclePublished(circle) || !(await deps.authorizeView(viewerDid, String(circle._id)))) {
                return notFound();
            }

            const id = new ObjectId(lookupId);
            const seriesId = id.toHexString();
            const event = await deps.findEvent(id);
            if (!event) {
                return notFound();
            }

            const occurrenceInvitationEntitled =
                occurrence &&
                viewerDid &&
                event.visibility === "private" &&
                event.createdBy !== viewerDid &&
                (await deps.hasOccurrenceInvitation(seriesId, occurrence.occurrenceKey, viewerDid));
            if (
                !(await canReadEventContent(
                    event,
                    {
                        viewerDid,
                        routeHostId: String(circle._id),
                        requiredStage: "open",
                        preEntitledPrivateEventIds: occurrenceInvitationEntitled ? [seriesId] : [],
                    },
                    deps.contentPolicyDependencies,
                ))
            ) {
                return notFound();
            }

            let calendarEventId = seriesId;
            let { startAt, endAt } = event;
            if (occurrence) {
                if (!event.recurrence) return notFound();
                const state = await deps.findOccurrence(seriesId, occurrence.occurrenceKey);
                const resolved = resolveGeneratedEventOccurrence(
                    seriesId,
                    { startAt, endAt, recurrence: event.recurrence },
                    occurrence.originalStartAt,
                    state,
                );
                if (!resolved || resolved.isOccurrenceCancelled) return notFound();
                ({ startAt, endAt, occurrenceId: calendarEventId } = resolved);
            }

            const eventUrl = new URL(`/circles/${encodeURIComponent(handle)}/events/${calendarEventId}`, req.url);

            const isAllDay = !!event.allDay;
            const dtStamp = toUTCStringBasic(new Date());
            const uid = `event-${calendarEventId}@${eventUrl.hostname}`;
            const summary = escapeICS(event.title);
            const description = escapeICS([event.description, event.virtualUrl].filter(Boolean).join("\n\n"));
            const locStr = event.isVirtual ? "Online" : locationToString(event.location);

            const lines: string[] = [
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "PRODID:-//Circles//Events//EN",
                "CALSCALE:GREGORIAN",
                "METHOD:PUBLISH",
                "BEGIN:VEVENT",
                `UID:${uid}`,
                `DTSTAMP:${dtStamp}`,
            ];

            if (isAllDay) {
                // All-day: DTEND is exclusive per RFC 5545, so add one day
                lines.push(`DTSTART;VALUE=DATE:${toDateOnly(new Date(startAt))}`);
                lines.push(`DTEND;VALUE=DATE:${toDateOnly(addDays(new Date(endAt), 1))}`);
            } else {
                lines.push(`DTSTART:${toUTCStringBasic(new Date(startAt))}`);
                lines.push(`DTEND:${toUTCStringBasic(new Date(endAt))}`);
            }

            lines.push(`SUMMARY:${summary}`);
            if (description) lines.push(`DESCRIPTION:${description}`);
            if (locStr) lines.push(`LOCATION:${escapeICS(locStr)}`);
            lines.push(`URL:${eventUrl.href}`);
            lines.push("END:VEVENT");
            lines.push("END:VCALENDAR");

            const ics = foldLines(lines);
            const filename = `${slugifyForFilename(event.title)}.ics`;

            return new Response(ics, {
                status: 200,
                headers: {
                    "Content-Type": "text/calendar; charset=utf-8",
                    "Content-Disposition": `attachment; filename="${filename}"`,
                    "Cache-Control": "private, no-store",
                },
            });
        } catch (err) {
            console.error("Error generating ICS:", err);
            return notFound();
        }
    };
}

export const GET = createEventIcsGetHandler();
