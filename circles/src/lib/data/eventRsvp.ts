import { EventRsvps, Circles } from "./db";
import { ObjectId } from "mongodb";
import { EventRsvp, Circle } from "@/models/models";
import { SAFE_CIRCLE_PROJECTION } from "./circle";

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
): Promise<boolean> => {
    try {
        const now = new Date();
        const update: any = {
            eventId,
            circleId,
            userDid,
            status,
            selectedRoles: selectedRoles || [],
            // default to true if not provided to preserve existing public behavior
            isPublic: typeof isPublic === "boolean" ? isPublic : true,
            message: message && message.trim().length > 0 ? message.trim() : undefined,
            updatedAt: now,
        };
        const result = await EventRsvps.updateOne(
            { eventId, userDid },
            { $set: update, $setOnInsert: { createdAt: now } },
            { upsert: true },
        );
        return result.acknowledged === true;
    } catch (error) {
        console.error("Error upserting RSVP:", error);
        return false;
    }
};

/**
 * Cancel a user's RSVP (delete document).
 */
export const cancelRsvp = async (eventId: string, userDid: string): Promise<boolean> => {
    try {
        const result = await EventRsvps.deleteOne({ eventId, userDid });
        return result.deletedCount > 0;
    } catch (error) {
        console.error("Error cancelling RSVP:", error);
        return false;
    }
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
