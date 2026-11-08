import { EventOccurrences, EventOccurrenceRsvps, Events } from "./db";
import { ObjectId } from "mongodb";
import type { EventOccurrenceRsvpStatus } from "@/models/models";
import { buildEventOccurrenceRsvpUpsert, isGeneratedEventOccurrence } from "@/lib/event-occurrence";
import {
    acquireEventParticipationLock,
    releaseEventParticipationLock,
    type EventParticipationLockStore,
} from "./event-participation-lock";

type OccurrenceRsvpWriteResult = { acknowledged: boolean };

export type EventOccurrenceRsvpDependencies = {
    lockStore?: EventParticipationLockStore;
    lockToken?: string;
    findEvent?: (seriesId: string) => Promise<{
        recurrence?: {
            frequency: "daily" | "weekly" | "monthly" | "yearly";
            interval?: number;
            count?: number;
            endDate?: Date;
        };
        startAt: Date;
        stage: "draft" | "review" | "open" | "cancelled";
    } | null>;
    findOccurrence?: (seriesId: string, occurrenceKey: number) => Promise<{ status: "cancelled" } | null>;
    writeOccurrenceRsvp?: (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
    ) => Promise<OccurrenceRsvpWriteResult>;
};

export type EventOccurrenceRsvpResult =
    | { status: "success" }
    | { status: "event-unavailable" }
    | { status: "temporarily-busy" }
    | { status: "deletion-in-progress" }
    | { status: "occurrence-unavailable" }
    | { status: "occurrence-cancelled" }
    | { status: "mutation-uncertain" }
    | { status: "release-failed" };

export async function upsertEventOccurrenceRsvp(
    seriesId: string,
    occurrenceKey: number,
    userDid: string,
    status: EventOccurrenceRsvpStatus,
    dependencies: EventOccurrenceRsvpDependencies = {},
): Promise<EventOccurrenceRsvpResult> {
    if (!ObjectId.isValid(seriesId) || !Number.isSafeInteger(occurrenceKey) || occurrenceKey < 0) {
        return { status: "occurrence-unavailable" };
    }

    const canonicalSeriesId = new ObjectId(seriesId).toHexString();
    const operation = buildEventOccurrenceRsvpUpsert(canonicalSeriesId, occurrenceKey, userDid, status, new Date());
    const lock = await acquireEventParticipationLock(
        canonicalSeriesId,
        userDid,
        status === "none" ? "event-occurrence-rsvp-cancel" : "event-occurrence-rsvp-upsert",
        {
            store: dependencies.lockStore,
            token: dependencies.lockToken,
        },
    );
    if (lock.status === "participation-busy") return { status: "temporarily-busy" };
    if (lock.status === "deletion-in-progress") return { status: "deletion-in-progress" };
    if (lock.status !== "acquired") return { status: "event-unavailable" };

    let mutated = false;
    const release = async (): Promise<EventOccurrenceRsvpResult | null> => {
        const released = await releaseEventParticipationLock(canonicalSeriesId, lock.token, dependencies.lockStore);
        return released.status === "released" ? null : { status: "release-failed" };
    };

    try {
        const event = await (dependencies.findEvent
            ? dependencies.findEvent(canonicalSeriesId)
            : Events.findOne(
                  { _id: new ObjectId(canonicalSeriesId) },
                  { projection: { recurrence: 1, startAt: 1, stage: 1 } },
              ));
        if (!event) return { status: "event-unavailable" };
        if (!event.recurrence || event.stage === "cancelled")
            return (await release()) ?? { status: "occurrence-unavailable" };
        if (
            !isGeneratedEventOccurrence(
                { startAt: event.startAt, recurrence: event.recurrence as any },
                new Date(occurrenceKey),
            )
        ) {
            return (await release()) ?? { status: "occurrence-unavailable" };
        }

        const occurrence = await (dependencies.findOccurrence
            ? dependencies.findOccurrence(canonicalSeriesId, occurrenceKey)
            : EventOccurrences.findOne({ seriesId: canonicalSeriesId, occurrenceKey }, { projection: { status: 1 } }));
        if (occurrence?.status === "cancelled") return (await release()) ?? { status: "occurrence-cancelled" };

        mutated = true;
        const result = await (dependencies.writeOccurrenceRsvp
            ? dependencies.writeOccurrenceRsvp(operation.filter, operation.update)
            : EventOccurrenceRsvps.updateOne(operation.filter, operation.update, operation.options));
        if (!result.acknowledged) return { status: "mutation-uncertain" };
    } catch (error) {
        console.error("Occurrence RSVP mutation or revalidation failed:", error);
        if (mutated) return { status: "mutation-uncertain" };
        return (await release()) ?? { status: "occurrence-unavailable" };
    }

    return (await release()) ?? { status: "success" };
}
