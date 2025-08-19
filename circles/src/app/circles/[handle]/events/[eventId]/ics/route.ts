import { ObjectId } from "mongodb";
import { Events } from "@/lib/data/db";
import { getCircleByHandle } from "@/lib/data/circle";
import type { Event as EventModel, Location } from "@/models/models";

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

export async function GET(req: Request, ctx: { params: { handle: string; eventId: string } }): Promise<Response> {
    try {
        const { handle, eventId } = ctx.params;
        if (!handle || !eventId || !ObjectId.isValid(eventId)) {
            return new Response("Invalid parameters", { status: 400 });
        }

        const circle = await getCircleByHandle(handle);
        if (!circle || !circle._id) {
            return new Response("Circle not found", { status: 404 });
        }

        const event = (await Events.findOne({ _id: new ObjectId(eventId) })) as EventModel | null;
        if (!event) {
            return new Response("Event not found", { status: 404 });
        }

        // Ensure event belongs to the circle and is open
        if (event.circleId !== String(circle._id) || event.stage !== "open") {
            return new Response("Event not accessible", { status: 404 });
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
                "Cache-Control": "public, max-age=300, s-maxage=300",
            },
        });
    } catch (err) {
        console.error("Error generating ICS:", err);
        return new Response("Failed to generate ICS", { status: 500 });
    }
}
