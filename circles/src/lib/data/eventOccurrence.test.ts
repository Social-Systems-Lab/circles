import { beforeEach, describe, expect, mock, test } from "bun:test";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const { cancelEventOccurrence } = await import("./eventOccurrence");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const OCCURRENCE = Date.UTC(2026, 6, 1, 18, 0, 0);

beforeEach(() => {
    db.EventOccurrences.docs = [];
});

describe("cancelEventOccurrence", () => {
    test("records a cancelled occurrence for the series", async () => {
        expect(await cancelEventOccurrence("series-1", OCCURRENCE, NOW)).toBe(true);

        expect(db.EventOccurrences.docs).toHaveLength(1);
        expect(db.EventOccurrences.docs[0]).toMatchObject({
            seriesId: "series-1",
            occurrenceKey: OCCURRENCE,
            originalStartAt: new Date(OCCURRENCE),
            status: "cancelled",
            createdAt: NOW,
            updatedAt: NOW,
        });
    });

    test("uses the current time when none is given", async () => {
        await cancelEventOccurrence("series-1", OCCURRENCE);

        expect(db.EventOccurrences.docs[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW });
    });

    test("is idempotent: cancelling again keeps a single record and its creation time", async () => {
        await cancelEventOccurrence("series-1", OCCURRENCE, NOW);
        const later = new Date(NOW.getTime() + 60_000);

        expect(await cancelEventOccurrence("series-1", OCCURRENCE, later)).toBe(true);

        expect(db.EventOccurrences.docs).toHaveLength(1);
        expect(db.EventOccurrences.docs[0]).toMatchObject({ createdAt: NOW, updatedAt: later, status: "cancelled" });
    });

    test("keeps occurrences of the same series and different series apart", async () => {
        await cancelEventOccurrence("series-1", OCCURRENCE, NOW);
        await cancelEventOccurrence("series-1", OCCURRENCE + 86_400_000, NOW);
        await cancelEventOccurrence("series-2", OCCURRENCE, NOW);

        expect(db.EventOccurrences.docs).toHaveLength(3);
    });

    test("cancels an occurrence that was previously modified rather than replacing it", async () => {
        db.EventOccurrences.docs = [
            { seriesId: "series-1", occurrenceKey: OCCURRENCE, status: "modified", title: "Special edition", createdAt: NOW },
        ];

        await cancelEventOccurrence("series-1", OCCURRENCE, new Date(NOW.getTime() + 1000));

        expect(db.EventOccurrences.docs).toHaveLength(1);
        expect(db.EventOccurrences.docs[0]).toMatchObject({ status: "cancelled", title: "Special edition" });
    });

    test("reports whether the database acknowledged the write", async () => {
        db.EventOccurrences.updateOne = (async () => ({ acknowledged: false })) as never;

        expect(await cancelEventOccurrence("series-1", OCCURRENCE, NOW)).toBe(false);
    });
});
