import { ObjectId } from "mongodb";
import { Events } from "@/lib/data/db";
import { getCircleByHandle, isCirclePublished } from "@/lib/data/circle";
import type { Event as EventModel, Location } from "@/models/models";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { canReadEventContent } from "@/lib/data/event-host-read-policy";
import { getEventIcsRouteOverrides } from "@/lib/data/ics-route-test-dependencies";

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
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
}

// RFC 5545 line folding at 75 octets (approximate by characters here)
function foldLine(line: string): string {
    const max = 75;
    if (line.length <= max) return line;
    const parts: string[] = [];
    let i = 0;
    while (i < line.length) {
        const chunk = line.slice(i, i + max);
        parts.push(i === 0 ? chunk : ` ${chunk}`);
        i += max;
    }
    return parts.join("\r\n");
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
    findEvent: (id: ObjectId) => Promise<EventModel | null>;
    contentPolicyDependencies?: Parameters<typeof canReadEventContent>[2];
};

const defaultDependencies: EventIcsDependencies = {
    authenticate: getAuthenticatedUserDid,
    findCircle: getCircleByHandle,
    findEvent: async (id) => (await Events.findOne({ _id: id })) as EventModel | null,
};

function createEventIcsGetHandler(dependencies: EventIcsDependencies = defaultDependencies) {
    return async function GET(
        req: Request,
        ctx: { params: Promise<{ handle: string; eventId: string }> },
    ): Promise<Response> {
        try {
            const deps = { ...dependencies, ...getEventIcsRouteOverrides() };
            const { handle, eventId } = await ctx.params;
            if (!handle || !eventId || !ObjectId.isValid(eventId)) {
                return notFound();
            }

            const viewerDid = await deps.authenticate();
            const circle = await deps.findCircle(handle);
            if (!circle || !circle._id || !isCirclePublished(circle)) {
                return notFound();
            }

            const event = await deps.findEvent(new ObjectId(eventId));
            if (!event) {
                return notFound();
            }

            if (
                !(await canReadEventContent(
                    event,
                    { viewerDid, routeHostId: String(circle._id), requiredStage: "open" },
                    deps.contentPolicyDependencies,
                ))
            ) {
                return notFound();
            }

            const origin = new URL(req.url).origin;
            const eventUrl = `${origin}/circles/${handle}/events/${eventId}`;

            const isAllDay = !!event.allDay;
            const dtStamp = toUTCStringBasic(new Date());
            const uid = `event-${eventId}@${new URL(origin).hostname}`;
            const summary = escapeICS(event.title);
            const description = escapeICS(event.description);
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
                lines.push(`DTSTART;VALUE=DATE:${toDateOnly(event.startAt)}`);
                lines.push(`DTEND;VALUE=DATE:${toDateOnly(addDays(new Date(event.endAt), 1))}`);
            } else {
                lines.push(`DTSTART:${toUTCStringBasic(new Date(event.startAt))}`);
                lines.push(`DTEND:${toUTCStringBasic(new Date(event.endAt))}`);
            }

            lines.push(`SUMMARY:${summary}`);
            if (description) lines.push(`DESCRIPTION:${description}`);
            if (locStr) lines.push(`LOCATION:${escapeICS(locStr)}`);
            if (event.virtualUrl) lines.push(`URL:${escapeICS(event.virtualUrl)}`);
            // Always include canonical URL to the event page
            lines.push(`URL:${escapeICS(eventUrl)}`);
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
