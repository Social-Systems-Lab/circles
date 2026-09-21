import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow, useSpyCleanup } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const isSuperAdminDid = mock(async (_did: string | undefined): Promise<boolean> => true);
mock.module("@/lib/auth/superadmin", () => ({ isSuperAdminDid }));

const auditEvents: Record<string, unknown>[] = [];
const appendPlatformAuditEvent = mock(async (event: Record<string, unknown>) => {
    auditEvents.push(event);
    return { ...event, _id: "audit-id" };
});
mock.module("@/lib/data/platform-audit", () => ({ appendPlatformAuditEvent }));

const { changeCircleModerationStatus } = await import("./circle-lifecycle");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const trackSpy = useSpyCleanup();

const seedCircle = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({ _id, circleType: "circle", ...overrides });
    return _id;
};
const stored = (id: ObjectId) => db.Circles.byId(id)!;
const change = (circleId: ObjectId | string, status: string, reason = "policy breach", actorDid = "did:admin") =>
    changeCircleModerationStatus({ circleId: circleId.toString(), actorDid, status: status as never, reason });

beforeEach(() => {
    db.Circles.docs = [];
    auditEvents.length = 0;
    isSuperAdminDid.mockReset();
    isSuperAdminDid.mockResolvedValue(true);
    appendPlatformAuditEvent.mockClear();
});

describe("changeCircleModerationStatus", () => {
    describe("authorization and input", () => {
        test("requires a superadmin actor", async () => {
            const id = seedCircle();
            isSuperAdminDid.mockResolvedValue(false);

            await expect(change(id, "paused")).rejects.toThrow("Unauthorized: superadmin access required.");
            expect(isSuperAdminDid).toHaveBeenCalledWith("did:admin");
            expect(stored(id).moderationStatus).toBeUndefined();
            expect(auditEvents).toHaveLength(0);
        });

        test.each(["", "   ", "\n\t"])("requires a non-blank reason (%p)", async (reason) => {
            const id = seedCircle();

            await expect(change(id, "paused", reason)).rejects.toThrow("A moderation reason is required.");
            expect(auditEvents).toHaveLength(0);
        });

        test("checks authorization before validating the reason", async () => {
            const id = seedCircle();
            isSuperAdminDid.mockResolvedValue(false);

            await expect(change(id, "paused", "")).rejects.toThrow("Unauthorized");
        });

        test("throws when the circle does not exist", async () => {
            await expect(change(new ObjectId(), "paused")).rejects.toThrow("Circle not found.");
        });

        test("only moderates circles, not user profiles", async () => {
            const id = seedCircle({ circleType: "user" });

            await expect(change(id, "paused")).rejects.toThrow("Circle not found.");
            expect(stored(id).moderationStatus).toBeUndefined();
        });

        test("throws for a circle id that is not an ObjectId", async () => {
            await expect(change("not-an-id", "paused")).rejects.toThrow();
        });
    });

    describe("transitions", () => {
        test.each([
            ["active", "paused"],
            ["active", "suspended"],
            ["active", "removed"],
            ["paused", "active"],
            ["paused", "suspended"],
            ["paused", "removed"],
            ["suspended", "active"],
            ["suspended", "removed"],
        ])("allows %s -> %s", async (from, to) => {
            const id = seedCircle({ moderationStatus: from });

            const result = await change(id, to);

            expect(result).toEqual({ previousStatus: from, status: to, changedAt: NOW } as never);
            expect(stored(id).moderationStatus).toBe(to);
        });

        test.each([
            ["active", "active"],
            ["paused", "paused"],
            ["suspended", "paused"],
            ["removed", "active"],
            ["removed", "paused"],
            ["removed", "suspended"],
            ["removed", "removed"],
        ])("rejects %s -> %s", async (from, to) => {
            const id = seedCircle({ moderationStatus: from });

            await expect(change(id, to)).rejects.toThrow(`Invalid moderation transition: ${from} to ${to}.`);
            expect(stored(id).moderationStatus).toBe(from);
            expect(auditEvents).toHaveLength(0);
        });

        test("treats a circle without a moderation status as active", async () => {
            const id = seedCircle();

            expect(await change(id, "paused")).toMatchObject({ previousStatus: "active", status: "paused" });
            expect(stored(id).moderationStatus).toBe("paused");
        });

        test("rejects an unknown target status", async () => {
            const id = seedCircle();

            await expect(change(id, "banished")).rejects.toThrow("Invalid moderation transition: active to banished.");
        });
    });

    describe("recording the change", () => {
        test("stamps who changed the status and when", async () => {
            const id = seedCircle();

            await change(id, "suspended", "policy breach", "did:moderator");

            expect(stored(id)).toMatchObject({
                moderationStatus: "suspended",
                moderationStatusChangedAt: NOW,
                moderationStatusChangedBy: "did:moderator",
            });
        });

        test("writes an audit event before and after the change, with the trimmed reason", async () => {
            const id = seedCircle({ moderationStatus: "paused" });

            await change(id, "active", "  appeal upheld  ");

            const details = { previousStatus: "paused", status: "active", reason: "appeal upheld" };
            expect(auditEvents).toEqual([
                {
                    eventType: "circle.moderation_status_change_requested",
                    actorDid: "did:admin",
                    targetType: "circle",
                    targetId: id.toString(),
                    details,
                },
                {
                    eventType: "circle.moderation_status_changed",
                    actorDid: "did:admin",
                    targetType: "circle",
                    targetId: id.toString(),
                    details,
                },
            ]);
        });

        test("records the request before applying the change, so a failure still leaves an audit trail", async () => {
            const id = seedCircle();
            trackSpy(spyOn(db.Circles, "updateOne").mockResolvedValue({ modifiedCount: 0 } as never));

            await expect(change(id, "paused")).rejects.toThrow(
                "Circle moderation status changed concurrently; retry the action.",
            );

            expect(auditEvents.map((event) => event.eventType)).toEqual(["circle.moderation_status_change_requested"]);
        });

        test("does not touch other circles", async () => {
            const id = seedCircle();
            const other = seedCircle();

            await change(id, "paused");

            expect(stored(other).moderationStatus).toBeUndefined();
        });
    });

    describe("concurrent changes", () => {
        test("only applies the change if the status is still the one that was observed", async () => {
            const id = seedCircle({ moderationStatus: "paused" });
            const updateOne = spyOn(db.Circles, "updateOne");
            trackSpy(updateOne);

            await change(id, "active");

            expect(updateOne.mock.calls[0][0]).toEqual({
                _id: id,
                $or: [{ moderationStatus: "paused" }],
            });
        });

        test("also matches circles with no status when the observed status is the default active", async () => {
            const id = seedCircle();
            const updateOne = spyOn(db.Circles, "updateOne");
            trackSpy(updateOne);

            await change(id, "paused");

            expect(updateOne.mock.calls[0][0]).toEqual({
                _id: id,
                $or: [{ moderationStatus: "active" }, { moderationStatus: { $exists: false } }],
            });
        });

        test("fails without a second audit event when another change wins the race", async () => {
            const id = seedCircle({ moderationStatus: "paused" });
            const realUpdateOne = db.Circles.updateOne.bind(db.Circles);
            trackSpy(
                spyOn(db.Circles, "updateOne").mockImplementation(async (...args: Parameters<typeof realUpdateOne>) => {
                    await realUpdateOne({ _id: id }, { $set: { moderationStatus: "suspended" } });
                    return realUpdateOne(...args);
                }),
            );

            await expect(change(id, "active")).rejects.toThrow("changed concurrently");

            expect(stored(id).moderationStatus).toBe("suspended");
            expect(auditEvents.map((event) => event.eventType)).toEqual(["circle.moderation_status_change_requested"]);
        });
    });
});
