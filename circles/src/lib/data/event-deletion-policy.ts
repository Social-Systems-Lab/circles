import { ObjectId } from "mongodb";
import type { EventStage } from "@/models/models";

export const ACTIVE_EVENT_RSVP_STATUSES = ["going", "interested", "waitlist"] as const;
export const ACTIVE_EVENT_OCCURRENCE_RSVP_STATUSES = ["going", "interested"] as const;

export type EventDeletionBlocker =
    | "event-rsvps"
    | "event-invitations"
    | "occurrence-rsvps"
    | "occurrence-invitations"
    | "legacy-invitations"
    | "stage";

export type EventDeletionEligibility =
    | { allowed: true; blockers: [] }
    | { allowed: false; blockers: EventDeletionBlocker[] };

export type EventDeletionPolicyDependencies = {
    hasActiveEventRsvp: (eventId: string) => Promise<boolean>;
    hasEventInvitation: (eventId: string) => Promise<boolean>;
    hasActiveOccurrenceRsvp: (seriesId: string) => Promise<boolean>;
    hasOccurrenceInvitation: (seriesId: string) => Promise<boolean>;
};

export function buildEventDeletionFilters(eventId: string) {
    return {
        eventRsvp: { eventId, status: { $in: [...ACTIVE_EVENT_RSVP_STATUSES] } },
        eventInvitation: { eventId },
        occurrenceRsvp: { seriesId: eventId, status: { $in: [...ACTIVE_EVENT_OCCURRENCE_RSVP_STATUSES] } },
        occurrenceInvitation: { seriesId: eventId },
    };
}

export const isDeletableEventStage = (stage: EventStage | undefined): boolean => stage === "draft" || stage === "open";

const defaultDependencies: EventDeletionPolicyDependencies = {
    hasActiveEventRsvp: async (eventId) => {
        const { EventRsvps } = await import("./db");
        return Boolean(
            await EventRsvps.findOne(buildEventDeletionFilters(eventId).eventRsvp, { projection: { _id: 1 } }),
        );
    },
    hasEventInvitation: async (eventId) => {
        const { EventInvitations } = await import("./db");
        return Boolean(
            await EventInvitations.findOne(buildEventDeletionFilters(eventId).eventInvitation, {
                projection: { _id: 1 },
            }),
        );
    },
    hasActiveOccurrenceRsvp: async (seriesId) => {
        const { EventOccurrenceRsvps } = await import("./db");
        return Boolean(
            await EventOccurrenceRsvps.findOne(buildEventDeletionFilters(seriesId).occurrenceRsvp, {
                projection: { _id: 1 },
            }),
        );
    },
    hasOccurrenceInvitation: async (seriesId) => {
        const { EventOccurrenceInvitations } = await import("./db");
        return Boolean(
            await EventOccurrenceInvitations.findOne(buildEventDeletionFilters(seriesId).occurrenceInvitation, {
                projection: { _id: 1 },
            }),
        );
    },
};

export async function evaluateEventDeletionEligibility(
    eventId: string,
    embeddedInvitations: readonly unknown[] | undefined = [],
    stage?: EventStage,
    dependencies: EventDeletionPolicyDependencies = defaultDependencies,
): Promise<EventDeletionEligibility> {
    if (!ObjectId.isValid(eventId)) {
        return { allowed: false, blockers: [] };
    }

    const canonicalEventId = new ObjectId(eventId).toHexString();
    const [eventRsvps, eventInvitations, occurrenceRsvps, occurrenceInvitations] = await Promise.all([
        dependencies.hasActiveEventRsvp(canonicalEventId),
        dependencies.hasEventInvitation(canonicalEventId),
        dependencies.hasActiveOccurrenceRsvp(canonicalEventId),
        dependencies.hasOccurrenceInvitation(canonicalEventId),
    ]);

    const blockers: EventDeletionBlocker[] = [];
    if (eventRsvps) blockers.push("event-rsvps");
    if (eventInvitations) blockers.push("event-invitations");
    if (occurrenceRsvps) blockers.push("occurrence-rsvps");
    if (occurrenceInvitations) blockers.push("occurrence-invitations");
    if (Array.isArray(embeddedInvitations) && embeddedInvitations.length > 0) blockers.push("legacy-invitations");
    if (!isDeletableEventStage(stage)) blockers.push("stage");

    return blockers.length === 0 ? { allowed: true, blockers: [] } : { allowed: false, blockers };
}

export const eventDeletionBlockedMessage =
    "Only draft or published events without RSVPs or invitations can be deleted. Cancel events with participation to preserve attendance history.";
