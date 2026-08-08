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

export async function upsertEventOccurrenceInvitation(
    input: InsertOccurrenceInvitationInput,
    options: { resendExisting: boolean },
): Promise<{ status: "inserted" | "updated" | "existing" }> {
    if (!options.resendExisting) {
        const result = await insertEventOccurrenceInvitation(input);
        return { status: result.inserted ? "inserted" : "existing" };
    }

    const now = new Date();
    const update: any = {
        $set: {
            invitedBy: input.invitedBy,
            circleId: input.circleId,
            updatedAt: now,
            sentAt: now,
        },
        $setOnInsert: {
            seriesId: input.seriesId,
            occurrenceKey: input.occurrenceKey,
            userDid: input.userDid,
            createdAt: now,
        },
    };
    if (input.message) update.$set.message = input.message;
    else update.$unset = { message: "" };

    const result = await EventOccurrenceInvitations.updateOne(
        { seriesId: input.seriesId, occurrenceKey: input.occurrenceKey, userDid: input.userDid },
        update,
        { upsert: true },
    );
    return { status: result.upsertedCount === 1 ? "inserted" : "updated" };
}
