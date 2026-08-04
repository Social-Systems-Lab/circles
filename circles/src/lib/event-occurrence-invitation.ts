import type { EventInvitation, EventOccurrenceInvitation, EventOccurrenceRsvp } from "@/models/models";

export type EventOccurrenceInviteeResponse = "pending" | "going" | "interested" | "not_attending";

export type EventOccurrenceInviteeRecord = {
    userDid: string;
    scope: "series" | "occurrence";
    response: EventOccurrenceInviteeResponse;
    message?: string;
    sentAt?: Date;
    updatedAt?: Date;
};

export function getEventOccurrenceInviteeResponse(
    rsvp?: Pick<EventOccurrenceRsvp, "status">,
): EventOccurrenceInviteeResponse {
    if (!rsvp) return "pending";
    if (rsvp.status === "none") return "not_attending";
    return rsvp.status;
}

export function mergeEventOccurrenceInvitees(
    seriesInvitations: Pick<EventInvitation, "userDid" | "createdAt" | "updatedAt">[],
    occurrenceInvitations: Pick<EventOccurrenceInvitation, "userDid" | "message" | "sentAt" | "updatedAt">[],
    occurrenceRsvps: Pick<EventOccurrenceRsvp, "userDid" | "status">[],
): EventOccurrenceInviteeRecord[] {
    const rsvpsByDid = new Map(occurrenceRsvps.map((rsvp) => [rsvp.userDid, rsvp]));
    const rows = new Map<string, EventOccurrenceInviteeRecord>();

    for (const invitation of seriesInvitations) {
        rows.set(invitation.userDid, {
            userDid: invitation.userDid,
            scope: "series",
            response: getEventOccurrenceInviteeResponse(rsvpsByDid.get(invitation.userDid)),
            sentAt: invitation.createdAt,
            updatedAt: invitation.updatedAt,
        });
    }
    for (const invitation of occurrenceInvitations) {
        rows.set(invitation.userDid, {
            userDid: invitation.userDid,
            scope: "occurrence",
            response: getEventOccurrenceInviteeResponse(rsvpsByDid.get(invitation.userDid)),
            message: invitation.message,
            sentAt: invitation.sentAt,
            updatedAt: invitation.updatedAt,
        });
    }
    return Array.from(rows.values());
}
