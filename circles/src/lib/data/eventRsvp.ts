import { EventRsvps, Circles } from "./db";
import { ObjectId } from "mongodb";
import { EventRsvp, Circle } from "@/models/models";
import { SAFE_CIRCLE_PROJECTION } from "./circle";
import {
    acquireEventParticipationLock,
    releaseEventParticipationLock,
    type AcquireEventParticipationLockResult,
    type EventParticipationLockStore,
    type ReleaseEventParticipationLockResult,
} from "./event-participation-lock";

type RsvpWriteResult = { acknowledged: boolean; deletedCount?: number };

export type EventRsvpMutationDependencies = {
    lockStore?: EventParticipationLockStore;
    lockToken?: string;
    writeRsvp?: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<RsvpWriteResult>;
    deleteRsvp?: (filter: Record<string, unknown>) => Promise<RsvpWriteResult>;
};

type EventRsvpLockFailure =
    | { status: "temporarily-busy" }
    | { status: "deletion-in-progress" }
    | { status: "event-unavailable" }
    | { status: "mutation-uncertain"; error?: unknown }
    | { status: "release-failed"; error?: unknown };

export type UpsertRsvpResult = { status: "success" } | EventRsvpLockFailure;
export type CancelRsvpResult = { status: "success" } | { status: "not-found" } | EventRsvpLockFailure;

const mapAcquireFailure = (
    result: Exclude<AcquireEventParticipationLockResult, { status: "acquired" }>,
): EventRsvpLockFailure => {
    if (result.status === "participation-busy") return { status: "temporarily-busy" };
    if (result.status === "deletion-in-progress") return { status: "deletion-in-progress" };
    return { status: "event-unavailable" };
};

const releaseLock = async (
    eventId: string,
    token: string,
    store: EventParticipationLockStore | undefined,
): Promise<ReleaseEventParticipationLockResult> => {
    try {
        return await releaseEventParticipationLock(eventId, token, store);
    } catch (error) {
        return { status: "release-failed" };
    }
};

/**
 * Get a user's RSVP for an event.
 */
export const getRsvp = async (eventId: string, userDid: string): Promise<EventRsvp | null> => {
    try {
        const rsvp = await EventRsvps.findOne({ eventId, userDid });
        if (rsvp) {
            (rsvp as any)._id = rsvp._id?.toString?.();
        }
        return (rsvp as EventRsvp) || null;
    } catch (error) {
        console.error("Error getting RSVP:", error);
        return null;
    }
};

/**
 * Upsert an RSVP for an event.
 */
export const upsertRsvp = async (
    eventId: string,
    circleId: string,
    userDid: string,
    status: "going" | "interested" | "cancelled" | "waitlist",
    selectedRoles?: string[],
    isPublic?: boolean,
    message?: string,
    dependencies: EventRsvpMutationDependencies = {},
): Promise<UpsertRsvpResult> => {
    if (!ObjectId.isValid(eventId)) return { status: "event-unavailable" };
    const canonicalEventId = new ObjectId(eventId).toHexString();
    const now = new Date();
    const update: Record<string, unknown> = {
        eventId: canonicalEventId,
        circleId,
        userDid,
        status,
        selectedRoles: selectedRoles || [],
        isPublic: typeof isPublic === "boolean" ? isPublic : true,
        message: message && message.trim().length > 0 ? message.trim() : undefined,
        updatedAt: now,
    };
    const filter = { eventId: canonicalEventId, userDid };
    const lock = await acquireEventParticipationLock(canonicalEventId, userDid, "event-rsvp-upsert", {
        store: dependencies.lockStore,
        token: dependencies.lockToken,
    });
    if (lock.status !== "acquired") return mapAcquireFailure(lock);

    try {
        const result = await (dependencies.writeRsvp
            ? dependencies.writeRsvp(filter, update)
            : EventRsvps.updateOne(filter, { $set: update, $setOnInsert: { createdAt: now } }, { upsert: true }));
        if (!result.acknowledged) return { status: "mutation-uncertain" };
    } catch (error) {
        console.error("RSVP mutation outcome is uncertain:", error);
        return { status: "mutation-uncertain", error };
    }

    const released = await releaseLock(canonicalEventId, lock.token, dependencies.lockStore);
    if (released.status !== "released") {
        console.error("RSVP mutation succeeded but Event participation lock release failed:", released.status);
        return { status: "release-failed" };
    }
    return { status: "success" };
};

/**
 * Cancel a user's RSVP (delete document).
 */
export const cancelRsvp = async (
    eventId: string,
    userDid: string,
    dependencies: EventRsvpMutationDependencies = {},
): Promise<CancelRsvpResult> => {
    if (!ObjectId.isValid(eventId)) return { status: "event-unavailable" };
    const canonicalEventId = new ObjectId(eventId).toHexString();
    const filter = { eventId: canonicalEventId, userDid };
    const lock = await acquireEventParticipationLock(canonicalEventId, userDid, "event-rsvp-cancel", {
        store: dependencies.lockStore,
        token: dependencies.lockToken,
    });
    if (lock.status !== "acquired") return mapAcquireFailure(lock);

    let deletedCount: number;
    try {
        const result = await (dependencies.deleteRsvp ? dependencies.deleteRsvp(filter) : EventRsvps.deleteOne(filter));
        if (!result.acknowledged) return { status: "mutation-uncertain" };
        deletedCount = result.deletedCount ?? 0;
    } catch (error) {
        console.error("RSVP cancellation outcome is uncertain:", error);
        return { status: "mutation-uncertain", error };
    }

    const released = await releaseLock(canonicalEventId, lock.token, dependencies.lockStore);
    if (released.status !== "released") {
        console.error("RSVP cancellation succeeded but Event participation lock release failed:", released.status);
        return { status: "release-failed" };
    }
    return deletedCount > 0 ? { status: "success" } : { status: "not-found" };
};

/**
 * Get counts for each RSVP status.
 */
export const getEventAttendees = async (
    eventId: string,
): Promise<{ going: number; interested: number; waitlist: number; cancelled: number }> => {
    try {
        const agg = await EventRsvps.aggregate([
            { $match: { eventId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]).toArray();

        const counts: Record<string, number> = {};
        agg.forEach((g) => {
            counts[g._id] = g.count;
        });

        return {
            going: counts["going"] || 0,
            interested: counts["interested"] || 0,
            waitlist: counts["waitlist"] || 0,
            cancelled: counts["cancelled"] || 0,
        };
    } catch (error) {
        console.error("Error getting attendee counts:", error);
        return { going: 0, interested: 0, waitlist: 0, cancelled: 0 };
    }
};

/**
 * Optionally list attendees (Circles) for a given status.
 */
export const listAttendees = async (eventId: string, status: "going" | "interested" | "waitlist") => {
    try {
        const rsvps = await EventRsvps.find({ eventId, status }).project({ userDid: 1, _id: 0 }).toArray();
        const dids = rsvps.map((r) => r.userDid).filter(Boolean);
        if (dids.length === 0) return [];

        const users = await Circles.find({ did: { $in: dids }, circleType: "user" })
            .project({ ...SAFE_CIRCLE_PROJECTION, _id: { $toString: "$_id" } as any })
            .toArray();

        return users as unknown as Circle[];
    } catch (error) {
        console.error("Error listing attendees:", error);
        return [];
    }
};

/**
 * List public attendees with optional messages for a given status.
 * Returns an array of { user: Circle; message?: string }.
 * Legacy RSVPs without isPublic are treated as public.
 */
export const listAttendeesWithDetails = async (
    eventId: string,
    status: "going" | "interested" | "waitlist",
): Promise<{ user: Circle; message?: string }[]> => {
    try {
        const rsvps = await EventRsvps.find({
            eventId,
            status,
            $or: [{ isPublic: { $exists: false } }, { isPublic: true }],
        })
            .project({ userDid: 1, message: 1, _id: 0 })
            .toArray();

        const dids = rsvps.map((r) => r.userDid).filter(Boolean);
        if (dids.length === 0) return [];

        const users = (await Circles.find({ did: { $in: dids }, circleType: "user" })
            .project({ ...SAFE_CIRCLE_PROJECTION, _id: { $toString: "$_id" } as any })
            .toArray()) as unknown as Circle[];

        const userByDid = new Map(users.map((u) => [u.did!, u]));
        const result: { user: Circle; message?: string }[] = [];
        for (const r of rsvps) {
            const u = userByDid.get(r.userDid);
            if (u) {
                result.push({ user: u, message: (r as any).message || undefined });
            }
        }
        return result;
    } catch (error) {
        console.error("Error listing attendees with details:", error);
        return [];
    }
};
