import { EventOccurrenceRsvps } from "./db";
import type { EventOccurrenceRsvpStatus } from "@/models/models";
import { buildEventOccurrenceRsvpUpsert } from "@/lib/event-occurrence";

export async function upsertEventOccurrenceRsvp(
    seriesId: string,
    occurrenceKey: number,
    userDid: string,
    status: EventOccurrenceRsvpStatus,
): Promise<boolean> {
    const operation = buildEventOccurrenceRsvpUpsert(seriesId, occurrenceKey, userDid, status, new Date());
    const result = await EventOccurrenceRsvps.updateOne(operation.filter, operation.update, operation.options);
    return result.acknowledged;
}
