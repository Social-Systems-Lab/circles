import { EventOccurrenceInvitations } from "./db";
import type { EventOccurrenceInvitation } from "@/models/models";

type InsertOccurrenceInvitationInput = Omit<EventOccurrenceInvitation, "_id" | "createdAt" | "updatedAt" | "sentAt">;

export async function insertEventOccurrenceInvitation(
    input: InsertOccurrenceInvitationInput,
): Promise<{ inserted: boolean }> {
    const now = new Date();
    const result = await EventOccurrenceInvitations.updateOne(
        { seriesId: input.seriesId, occurrenceKey: input.occurrenceKey, userDid: input.userDid },
        {
            $setOnInsert: {
                ...input,
                createdAt: now,
                updatedAt: now,
                sentAt: now,
            },
        },
        { upsert: true },
    );
    return { inserted: result.upsertedCount === 1 };
}
