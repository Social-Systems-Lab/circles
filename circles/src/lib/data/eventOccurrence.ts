import { EventOccurrences } from "./db";
import { buildEventOccurrenceCancellationUpsert } from "@/lib/event-occurrence";

export async function cancelEventOccurrence(
    seriesId: string,
    occurrenceKey: number,
    now = new Date(),
): Promise<boolean> {
    const operation = buildEventOccurrenceCancellationUpsert(seriesId, occurrenceKey, now);
    const result = await EventOccurrences.updateOne(operation.filter, operation.update, operation.options);
    return result.acknowledged;
}
