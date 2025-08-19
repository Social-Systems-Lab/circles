import { Events } from "@/lib/data/db";
import { getCircleByHandle } from "@/lib/data/circle";

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

function slugifyForFilename(s: string): string {
    const base = s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "");
    return base || "events";
}

export async function GET(req: Request, ctx: { params: { handle: string } }): Promise<Response> {
    try {
        const { handle } = ctx.params;
        if (!handle) {
            return new Response("Invalid parameters", { status: 400 });
        }

        const circle = await getCircleByHandle(handle);
        if (!circle || !circle._id) {
            return new Response("Circle not found", { status: 404 });
        }

        // Only include published, upcoming events for this circle
        const now = new Date();
        const circleIdStr = String(circle._id);
        const events = await Events.find({
            circleId: circleIdStr,
            stage: "published",
            endAt: { $gte: now },
        })
            .sort({ startAt: 1 })
            .limit(500)
            .toArray();

        const origin = new URL(req.url).origin;
        const hostname = new URL(origin).hostname;
        const calName = `${circle.name || circle.handle || "Circle"} Events`;
        const calDesc = `Upcoming events for ${circle.name || circle.handle || "this circle"} on Circles`;

        const lines: string[] = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Circles//Events Feed//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            `X-WR-CALNAME:${escapeICS(calName)}`,
            `X-WR-CALDESC:${escapeICS(calDesc)}`,
        ];

        const dtStamp = toUTCStringBasic(new Date());

        for (const ev of events) {
            const isAllDay = !!ev.allDay;
            const uid = `event-${String(ev._id)}@${hostname}`;
            const summary = escapeICS(ev.title);
            const description = escapeICS(ev.description);
            const eventUrl = `${origin}/circles/${handle}/events/${String(ev._id)}`;

            lines.push("BEGIN:VEVENT");
            lines.push(`UID:${uid}`);
            lines.push(`DTSTAMP:${dtStamp}`);

            if (isAllDay) {
                lines.push(`DTSTART;VALUE=DATE:${toDateOnly(new Date(ev.startAt))}`);
                lines.push(`DTEND;VALUE=DATE:${toDateOnly(addDays(new Date(ev.endAt), 1))}`);
            } else {
                lines.push(`DTSTART:${toUTCStringBasic(new Date(ev.startAt))}`);
                lines.push(`DTEND:${toUTCStringBasic(new Date(ev.endAt))}`);
            }

            lines.push(`SUMMARY:${summary}`);
            if (description) lines.push(`DESCRIPTION:${description}`);

            // Virtual URL as URL (if available)
            if (ev.virtualUrl) lines.push(`URL:${escapeICS(ev.virtualUrl)}`);
            // Canonical URL to event page (always include)
            lines.push(`URL:${escapeICS(eventUrl)}`);

            // Location (prefer "Online" for virtual)
            if (ev.isVirtual) {
                lines.push("LOCATION:Online");
            } else if (ev.location) {
                const parts = [ev.location.street, ev.location.city, ev.location.region, ev.location.country].filter(
                    Boolean,
                );
                lines.push(`LOCATION:${escapeICS(parts.join(", "))}`);
            }

            lines.push("END:VEVENT");
        }

        lines.push("END:VCALENDAR");

        const ics = foldLines(lines);
        const filename = `${slugifyForFilename(circle.handle || circle.name || "events")}.ics`;

        return new Response(ics, {
            status: 200,
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Content-Disposition": `inline; filename="${filename}"`,
                "Cache-Control": "public, max-age=300, s-maxage=300",
            },
        });
    } catch (err) {
        console.error("Error generating ICS feed:", err);
        return new Response("Failed to generate ICS feed", { status: 500 });
    }
}
