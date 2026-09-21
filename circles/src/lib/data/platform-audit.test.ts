import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { createDbMock, mockDb } from "@/test/mock-db";

const db = mockDb();

const { appendPlatformAuditEvent } = await import("./platform-audit");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const event = { eventType: "circle.moderation_status_changed", actorDid: "did:admin", targetType: "circle", targetId: "c1" } as const;

beforeEach(() => {
    db.PlatformAuditEvents.docs = [];
});

describe("appendPlatformAuditEvent", () => {
    test("stores the event with the time it occurred", async () => {
        await appendPlatformAuditEvent(event);

        expect(db.PlatformAuditEvents.docs).toHaveLength(1);
        expect(db.PlatformAuditEvents.docs[0]).toMatchObject({ ...event, occurredAt: NOW });
    });

    test("returns the stored record with its id as a string", async () => {
        const result = await appendPlatformAuditEvent(event);

        expect(result).toMatchObject({ ...event, occurredAt: NOW });
        expect(result._id).toBeString();
        expect(db.PlatformAuditEvents.docs[0]._id.equals(new ObjectId(result._id))).toBe(true);
    });

    test("keeps optional details", async () => {
        const details = { previousStatus: "active", status: "paused", reason: "spam" };

        await appendPlatformAuditEvent({ ...event, details });

        expect(db.PlatformAuditEvents.docs[0].details).toEqual(details);
    });

    test("overrides an occurredAt smuggled in by the caller", async () => {
        await appendPlatformAuditEvent({ ...event, occurredAt: new Date(0) } as never);

        expect(db.PlatformAuditEvents.docs[0].occurredAt).toEqual(NOW);
    });

    test("appends rather than replaces", async () => {
        await appendPlatformAuditEvent(event);
        await appendPlatformAuditEvent({ ...event, targetId: "c2" });

        expect(db.PlatformAuditEvents.docs.map((doc) => doc.targetId)).toEqual(["c1", "c2"]);
    });

    test("propagates storage errors", async () => {
        const failing = createDbMock();
        failing.PlatformAuditEvents.insertOne = async () => {
            throw new Error("write failed");
        };
        db.PlatformAuditEvents.insertOne = failing.PlatformAuditEvents.insertOne;

        await expect(appendPlatformAuditEvent(event)).rejects.toThrow("write failed");
    });
});
