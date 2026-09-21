import { beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const { upsertEventOccurrenceRsvp } = await import("./eventOccurrenceRsvp");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const OCCURRENCE = Date.UTC(2026, 6, 1, 18, 0, 0);

beforeEach(() => {
    db.EventOccurrenceRsvps.docs = [];
});

describe("upsertEventOccurrenceRsvp", () => {
    test("stores a new RSVP for the user and occurrence", async () => {
        expect(await upsertEventOccurrenceRsvp("series-1", OCCURRENCE, "did:user", "going")).toBe(true);

        expect(db.EventOccurrenceRsvps.docs).toHaveLength(1);
        expect(db.EventOccurrenceRsvps.docs[0]).toMatchObject({
            seriesId: "series-1",
            occurrenceKey: OCCURRENCE,
            userDid: "did:user",
            status: "going",
            createdAt: NOW,
            updatedAt: NOW,
        });
    });

    test("changes the status of an existing RSVP without creating a second one", async () => {
        await upsertEventOccurrenceRsvp("series-1", OCCURRENCE, "did:user", "going");
        const later = new Date(NOW.getTime() + 60_000);
        setSystemTime(later);

        await upsertEventOccurrenceRsvp("series-1", OCCURRENCE, "did:user", "interested");

        expect(db.EventOccurrenceRsvps.docs).toHaveLength(1);
        expect(db.EventOccurrenceRsvps.docs[0]).toMatchObject({ status: "interested", createdAt: NOW, updatedAt: later });
    });

    test("keeps RSVPs of different users and occurrences separate", async () => {
        await upsertEventOccurrenceRsvp("series-1", OCCURRENCE, "did:a", "going");
        await upsertEventOccurrenceRsvp("series-1", OCCURRENCE, "did:b", "going");
        await upsertEventOccurrenceRsvp("series-1", OCCURRENCE + 1, "did:a", "going");
        await upsertEventOccurrenceRsvp("series-2", OCCURRENCE, "did:a", "going");

        expect(db.EventOccurrenceRsvps.docs).toHaveLength(4);
    });

    test("reports whether the database acknowledged the write", async () => {
        db.EventOccurrenceRsvps.updateOne = (async () => ({ acknowledged: false })) as never;

        expect(await upsertEventOccurrenceRsvp("series-1", OCCURRENCE, "did:user", "going")).toBe(false);
    });
});
