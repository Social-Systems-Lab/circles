import type { Location } from "@/models/models";

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

export function locationToString(loc?: Location): string | undefined {
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

export function eventCalendarResponse({
    title,
    description,
    location,
    startAt,
    endAt,
    allDay,
    uid,
    url,
}: {
    title: string;
    description?: string;
    location?: string;
    startAt: Date;
    endAt: Date;
    allDay?: boolean;
    uid: string;
    url?: string;
}): Response {
    const dtStamp = toUTCStringBasic(new Date());
    const summary = escapeICS(title);
    const escapedDescription = escapeICS(description);

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

    if (allDay) {
        // All-day: DTEND is exclusive per RFC 5545, so add one day
        lines.push(`DTSTART;VALUE=DATE:${toDateOnly(new Date(startAt))}`);
        lines.push(`DTEND;VALUE=DATE:${toDateOnly(addDays(new Date(endAt), 1))}`);
    } else {
        lines.push(`DTSTART:${toUTCStringBasic(new Date(startAt))}`);
        lines.push(`DTEND:${toUTCStringBasic(new Date(endAt))}`);
    }

    lines.push(`SUMMARY:${summary}`);
    if (escapedDescription) lines.push(`DESCRIPTION:${escapedDescription}`);
    if (location) lines.push(`LOCATION:${escapeICS(location)}`);
    if (url) lines.push(`URL:${url}`);
    lines.push("END:VEVENT");
    lines.push("END:VCALENDAR");

    const ics = foldLines(lines);
    const filename = `${slugifyForFilename(title)}.ics`;

    return new Response(ics, {
        status: 200,
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, no-store",
        },
    });
}
