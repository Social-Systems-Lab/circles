import type { Event, EventGuestInvitation } from "@/models/models";

export const MAX_GUEST_INVITE_RECIPIENTS = 10;
export const GUEST_INVITATION_PATH = "/event-invitations";
export const GUEST_INVITATION_TOKEN = /^[a-f0-9]{64}$/;

export type GuestInvitationPreview = Pick<
    Event,
    "title" | "description" | "location" | "isVirtual" | "isHybrid" | "virtualUrl" | "startAt" | "endAt" | "allDay"
>;

export const guestResponseLabel = {
    pending: "Awaiting response",
    going: "Attending",
    interested: "Interested",
    declined: "Not interested",
} as const;

export function isGuestResponse(value: unknown): value is Exclude<EventGuestInvitation["status"], "pending"> {
    return value === "going" || value === "interested" || value === "declined";
}

export function guestInvitationDetails(
    event: Pick<Event, "title" | "description" | "location" | "isHybrid" | "isVirtual" | "virtualUrl">,
): EventGuestInvitation["details"] {
    const address = [event.location?.street, event.location?.city, event.location?.region, event.location?.country]
        .filter(Boolean)
        .join(", ");
    let meetingUrl = "";
    if ((event.isVirtual || event.isHybrid) && event.virtualUrl) {
        try {
            const url = new URL(event.virtualUrl);
            const kamooniHost = url.hostname === "kamooni.org" || url.hostname.endsWith(".kamooni.org");
            const circleContent = /^\/(?:circles|chat|private-media|storage)(?:\/|$)/i.test(url.pathname);
            if (url.protocol === "https:" && !url.username && !url.password && !(kamooniHost && circleContent)) {
                meetingUrl = url.href;
            }
        } catch {
            // Historical events can contain incomplete meeting URLs.
        }
    }

    const description = (event.description || "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\bhttps?:\/\/[^\s<>]+/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    return {
        title: event.title,
        description: description.length > 500 ? `${description.slice(0, 497).trimEnd()}…` : description,
        location:
            (event.isHybrid ? [address, "Online"].filter(Boolean).join(" / ") : event.isVirtual ? "Online" : address) ||
            "Location to be confirmed",
        meetingUrl,
    };
}

export function guestInvitationPreviewKey(event: GuestInvitationPreview): string {
    return JSON.stringify([
        guestInvitationDetails(event),
        new Date(event.startAt).getTime(),
        new Date(event.endAt).getTime(),
        !!event.allDay,
    ]);
}

export function formatGuestInvitationWhen(startAt: Date, endAt: Date, allDay = false): string {
    const format = new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "long",
        timeStyle: allDay ? undefined : "short",
        timeZone: "UTC",
    });
    const range = format.formatRange(new Date(startAt), new Date(endAt));
    return `${range} ${allDay ? "(all day)" : "UTC"}`;
}

export type EventGuestInviteeRow = Pick<EventGuestInvitation, "email" | "status"> & { deliveryConfirmed: boolean };
