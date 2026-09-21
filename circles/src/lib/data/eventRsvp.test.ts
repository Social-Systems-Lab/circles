import { beforeEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test";
import { ObjectId } from "mongodb";
import { silenceConsole, useFakeNow, useSpyCleanup } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

// The real constant is a whitelist of public profile fields; a small stand-in is enough to prove it is applied.
const SAFE_CIRCLE_PROJECTION = { _id: 1, did: 1, name: 1, handle: 1 };
mock.module("@/lib/data/circle", () => ({ SAFE_CIRCLE_PROJECTION }));

const rsvps = await import("./eventRsvp");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const consoleSpy = silenceConsole("error");
const trackSpy = useSpyCleanup();

const seedRsvp = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.EventRsvps.docs.push({ _id, eventId: "event-1", circleId: "c1", userDid: "did:user", status: "going", ...overrides });
    return _id;
};
const seedUser = (did: string, overrides: Record<string, unknown> = {}) =>
    db.Circles.docs.push({ _id: new ObjectId(), did, circleType: "user", name: did, handle: did.replace("did:", ""), email: `${did}@example.com`, passwordResetToken: "secret", ...overrides });

beforeEach(() => {
    db.EventRsvps.docs = [];
    db.EventRsvps.onAggregate = undefined;
    db.Circles.docs = [];
});

describe("getRsvp", () => {
    test("returns the user's RSVP for the event with its id as a string", async () => {
        const id = seedRsvp({ status: "interested" });

        expect(await rsvps.getRsvp("event-1", "did:user")).toMatchObject({ _id: id.toString(), status: "interested", userDid: "did:user" });
    });

    test("returns null without an RSVP", async () => {
        expect(await rsvps.getRsvp("event-1", "did:user")).toBeNull();
    });

    test("ignores other events and other users", async () => {
        seedRsvp({ eventId: "event-2" });
        seedRsvp({ userDid: "did:other" });

        expect(await rsvps.getRsvp("event-1", "did:user")).toBeNull();
    });

    test("returns null, and logs, when the lookup fails", async () => {
        trackSpy(spyOn(db.EventRsvps, "findOne").mockRejectedValue(new Error("db down")));

        expect(await rsvps.getRsvp("event-1", "did:user")).toBeNull();
        expect(consoleSpy.error).toHaveBeenCalledWith("Error getting RSVP:", expect.any(Error));
    });
});

describe("upsertRsvp", () => {
    test("creates an RSVP and reports success", async () => {
        expect(await rsvps.upsertRsvp("event-1", "c1", "did:user", "going")).toBe(true);

        expect(db.EventRsvps.docs[0]).toMatchObject({
            eventId: "event-1",
            circleId: "c1",
            userDid: "did:user",
            status: "going",
            selectedRoles: [],
            isPublic: true,
            createdAt: NOW,
            updatedAt: NOW,
        });
    });

    test("keeps one RSVP per user and event, changing its status and keeping its creation time", async () => {
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going");
        setSystemTime(new Date(NOW.getTime() + 60_000));

        await rsvps.upsertRsvp("event-1", "c1", "did:user", "interested");

        expect(db.EventRsvps.docs).toHaveLength(1);
        expect(db.EventRsvps.docs[0]).toMatchObject({ status: "interested", createdAt: NOW, updatedAt: new Date(NOW.getTime() + 60_000) });
    });

    test("keeps RSVPs of different users and events apart", async () => {
        await rsvps.upsertRsvp("event-1", "c1", "did:a", "going");
        await rsvps.upsertRsvp("event-1", "c1", "did:b", "going");
        await rsvps.upsertRsvp("event-2", "c1", "did:a", "going");

        expect(db.EventRsvps.docs).toHaveLength(3);
    });

    test("stores the roles the user picked", async () => {
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going", ["driver", "cook"]);

        expect(db.EventRsvps.docs[0].selectedRoles).toEqual(["driver", "cook"]);
    });

    test.each([[true], [false]])("stores an explicit visibility of %p", async (isPublic) => {
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going", undefined, isPublic);

        expect(db.EventRsvps.docs[0].isPublic).toBe(isPublic);
    });

    test("defaults to public when visibility is not a boolean", async () => {
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going", undefined, "no" as never);

        expect(db.EventRsvps.docs[0].isPublic).toBe(true);
    });

    test("trims the message", async () => {
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going", undefined, undefined, "  see you there  ");

        expect(db.EventRsvps.docs[0].message).toBe("see you there");
    });

    test.each([[undefined], [""], ["   "]])("stores no message for %p", async (message) => {
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going", undefined, undefined, message);

        expect(db.EventRsvps.docs[0].message).toBeUndefined();
    });

    test("replaces an earlier message when the new one is empty", async () => {
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going", undefined, undefined, "hello");
        await rsvps.upsertRsvp("event-1", "c1", "did:user", "going", undefined, undefined, "");

        expect(db.EventRsvps.docs[0].message).toBeUndefined();
    });

    test("returns false, and logs, when the database fails", async () => {
        trackSpy(spyOn(db.EventRsvps, "updateOne").mockRejectedValue(new Error("db down")));

        expect(await rsvps.upsertRsvp("event-1", "c1", "did:user", "going")).toBe(false);
        expect(consoleSpy.error).toHaveBeenCalledWith("Error upserting RSVP:", expect.any(Error));
    });

    test("returns false when the write is not acknowledged", async () => {
        trackSpy(spyOn(db.EventRsvps, "updateOne").mockResolvedValue({ acknowledged: false } as never));

        expect(await rsvps.upsertRsvp("event-1", "c1", "did:user", "going")).toBe(false);
    });
});

describe("cancelRsvp", () => {
    test("deletes the RSVP and reports true", async () => {
        seedRsvp();

        expect(await rsvps.cancelRsvp("event-1", "did:user")).toBe(true);
        expect(db.EventRsvps.docs).toHaveLength(0);
    });

    test("reports false when there is nothing to cancel", async () => {
        expect(await rsvps.cancelRsvp("event-1", "did:user")).toBe(false);
    });

    test("only deletes that user's RSVP to that event", async () => {
        seedRsvp();
        seedRsvp({ userDid: "did:other" });
        seedRsvp({ eventId: "event-2" });

        await rsvps.cancelRsvp("event-1", "did:user");

        expect(db.EventRsvps.docs).toHaveLength(2);
    });

    test("reports false, and logs, when the database fails", async () => {
        trackSpy(spyOn(db.EventRsvps, "deleteOne").mockRejectedValue(new Error("db down")));

        expect(await rsvps.cancelRsvp("event-1", "did:user")).toBe(false);
        expect(consoleSpy.error).toHaveBeenCalledWith("Error cancelling RSVP:", expect.any(Error));
    });
});

describe("getEventAttendees", () => {
    test("counts RSVPs by status", async () => {
        db.EventRsvps.onAggregate = () => [
            { _id: "going", count: 4 },
            { _id: "interested", count: 2 },
            { _id: "waitlist", count: 1 },
            { _id: "cancelled", count: 3 },
        ];

        expect(await rsvps.getEventAttendees("event-1")).toEqual({ going: 4, interested: 2, waitlist: 1, cancelled: 3 });
    });

    test("reports zero for statuses nobody has", async () => {
        db.EventRsvps.onAggregate = () => [{ _id: "going", count: 1 }];

        expect(await rsvps.getEventAttendees("event-1")).toEqual({ going: 1, interested: 0, waitlist: 0, cancelled: 0 });
    });

    test("ignores statuses it does not know", async () => {
        db.EventRsvps.onAggregate = () => [{ _id: "maybe", count: 9 }];

        expect(await rsvps.getEventAttendees("event-1")).toEqual({ going: 0, interested: 0, waitlist: 0, cancelled: 0 });
    });

    test("groups the RSVPs of this event by status", async () => {
        db.EventRsvps.onAggregate = () => [];

        await rsvps.getEventAttendees("event-1");

        expect(db.EventRsvps.aggregations[0]).toEqual([{ $match: { eventId: "event-1" } }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
    });

    test("reports zero counts, and logs, when the query fails", async () => {
        db.EventRsvps.onAggregate = () => {
            throw new Error("db down");
        };

        expect(await rsvps.getEventAttendees("event-1")).toEqual({ going: 0, interested: 0, waitlist: 0, cancelled: 0 });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error getting attendee counts:", expect.any(Error));
    });
});

describe("listAttendees", () => {
    test("returns the profiles of everyone with that status", async () => {
        seedRsvp({ userDid: "did:a", status: "going" });
        seedRsvp({ userDid: "did:b", status: "going" });
        seedRsvp({ userDid: "did:c", status: "interested" });
        ["did:a", "did:b", "did:c"].forEach((did) => seedUser(did));

        const attendees = await rsvps.listAttendees("event-1", "going");

        expect(attendees.map((user) => user.did).sort()).toEqual(["did:a", "did:b"]);
    });

    test("only exposes whitelisted profile fields", async () => {
        seedRsvp({ userDid: "did:a" });
        seedUser("did:a");

        const [attendee] = await rsvps.listAttendees("event-1", "going");

        expect(Object.keys(attendee).sort()).toEqual(["_id", "did", "handle", "name"]);
        expect(attendee).not.toHaveProperty("email");
        expect(attendee).not.toHaveProperty("passwordResetToken");
    });

    test("only returns personal profiles", async () => {
        seedRsvp({ userDid: "did:a" });
        db.Circles.docs.push({ _id: new ObjectId(), did: "did:a", circleType: "circle", name: "Not a user" });

        expect(await rsvps.listAttendees("event-1", "going")).toEqual([]);
    });

    test("returns nothing without asking for profiles when nobody has that status", async () => {
        const find = spyOn(db.Circles, "find");
        trackSpy(find);

        expect(await rsvps.listAttendees("event-1", "waitlist")).toEqual([]);
        expect(find).not.toHaveBeenCalled();
    });

    test("skips RSVPs of other events", async () => {
        seedRsvp({ eventId: "event-2", userDid: "did:a" });
        seedUser("did:a");

        expect(await rsvps.listAttendees("event-1", "going")).toEqual([]);
    });

    test("returns nothing, and logs, when the lookup fails", async () => {
        trackSpy(spyOn(db.EventRsvps, "find").mockImplementation(() => {
            throw new Error("db down");
        }));

        expect(await rsvps.listAttendees("event-1", "going")).toEqual([]);
        expect(consoleSpy.error).toHaveBeenCalledWith("Error listing attendees:", expect.any(Error));
    });
});

describe("listAttendeesWithDetails", () => {
    test("pairs each attendee with the message they left", async () => {
        seedRsvp({ userDid: "did:a", message: "Can't wait" });
        seedUser("did:a");

        const [entry] = await rsvps.listAttendeesWithDetails("event-1", "going");

        expect(entry.user.did).toBe("did:a");
        expect(entry.message).toBe("Can't wait");
    });

    test("leaves the message undefined when there is none", async () => {
        seedRsvp({ userDid: "did:a" });
        seedRsvp({ userDid: "did:b", message: "" });
        seedUser("did:a");
        seedUser("did:b");

        const entries = await rsvps.listAttendeesWithDetails("event-1", "going");

        expect(entries.map((entry) => entry.message)).toEqual([undefined, undefined]);
    });

    test("includes public RSVPs and older ones that predate the setting, but not private ones", async () => {
        seedRsvp({ userDid: "did:public", isPublic: true });
        seedRsvp({ userDid: "did:legacy" });
        seedRsvp({ userDid: "did:private", isPublic: false });
        ["did:public", "did:legacy", "did:private"].forEach((did) => seedUser(did));

        const entries = await rsvps.listAttendeesWithDetails("event-1", "going");

        expect(entries.map((entry) => entry.user.did).sort()).toEqual(["did:legacy", "did:public"]);
    });

    test("keeps the order of the RSVPs", async () => {
        ["did:c", "did:a", "did:b"].forEach((did) => {
            seedRsvp({ userDid: did });
            seedUser(did);
        });

        expect((await rsvps.listAttendeesWithDetails("event-1", "going")).map((entry) => entry.user.did)).toEqual(["did:c", "did:a", "did:b"]);
    });

    test("skips RSVPs whose user profile no longer exists", async () => {
        seedRsvp({ userDid: "did:gone" });
        seedRsvp({ userDid: "did:here" });
        seedUser("did:here");

        expect((await rsvps.listAttendeesWithDetails("event-1", "going")).map((entry) => entry.user.did)).toEqual(["did:here"]);
    });

    test("only exposes whitelisted profile fields", async () => {
        seedRsvp({ userDid: "did:a" });
        seedUser("did:a");

        const [entry] = await rsvps.listAttendeesWithDetails("event-1", "going");

        expect(entry.user).not.toHaveProperty("email");
        expect(entry.user).not.toHaveProperty("passwordResetToken");
    });

    test("only lists the requested status", async () => {
        seedRsvp({ userDid: "did:a", status: "interested" });
        seedUser("did:a");

        expect(await rsvps.listAttendeesWithDetails("event-1", "going")).toEqual([]);
    });

    test("returns nothing, and logs, when the lookup fails", async () => {
        trackSpy(spyOn(db.EventRsvps, "find").mockImplementation(() => {
            throw new Error("db down");
        }));

        expect(await rsvps.listAttendeesWithDetails("event-1", "going")).toEqual([]);
        expect(consoleSpy.error).toHaveBeenCalledWith("Error listing attendees with details:", expect.any(Error));
    });
});
