import type { Circle, EventInvitation, EventOccurrenceInvitation, EventOccurrenceRsvp } from "@/models/models";

export type EventOccurrenceInviteeResponse = "pending" | "going" | "interested" | "not_attending";
export type EffectiveEventOccurrenceRsvpStatus = "going" | "interested";

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

export function mergeEventOccurrenceInviteCandidates(
    current: Circle[],
    additions: Circle[],
): Circle[] {
    const candidatesByDid = new Map(current.filter((candidate) => candidate.did).map((candidate) => [candidate.did!, candidate]));
    for (const candidate of additions) {
        if (candidate.did) candidatesByDid.set(candidate.did, candidate);
    }
    return Array.from(candidatesByDid.values());
}

export function getEffectiveEventOccurrenceParticipants(
    exactRsvps: Pick<EventOccurrenceRsvp, "userDid" | "status">[],
    legacyRsvps: { userDid: string; status: EffectiveEventOccurrenceRsvpStatus }[],
    organiserDid: string,
): {
    statusByDid: Map<string, EffectiveEventOccurrenceRsvpStatus>;
    notAttendingDids: Set<string>;
} {
    const exactByDid = new Map(exactRsvps.map((rsvp) => [rsvp.userDid, rsvp.status]));
    const statusByDid = new Map<string, EffectiveEventOccurrenceRsvpStatus>();
    const notAttendingDids = new Set<string>();

    for (const rsvp of exactRsvps) {
        if (rsvp.userDid === organiserDid) continue;
        if (rsvp.status === "none") notAttendingDids.add(rsvp.userDid);
        else statusByDid.set(rsvp.userDid, rsvp.status);
    }
    for (const rsvp of legacyRsvps) {
        if (rsvp.userDid !== organiserDid && !exactByDid.has(rsvp.userDid)) {
            statusByDid.set(rsvp.userDid, rsvp.status);
        }
    }
    return { statusByDid, notAttendingDids };
}
