import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import type { Event } from "@/models/models";

/**
 * Regular event RSVP writes use this lock. Occurrence RSVP and invitation writers do not yet.
 * The event system is not safe to deploy until every participation writer uses this lock.
 */
export type EventParticipationMutationLock = NonNullable<Event["participationMutationLock"]>;

export type EventParticipationLockInspection =
    | { status: "found"; hasDeletionClaim: boolean; hasParticipationLock: boolean }
    | { status: "missing" };

export type EventParticipationLockStore = {
    tryAcquire: (eventId: ObjectId, lock: EventParticipationMutationLock) => Promise<boolean>;
    inspect: (eventId: ObjectId) => Promise<EventParticipationLockInspection>;
    tryRelease: (eventId: ObjectId, token: string) => Promise<boolean>;
};

export type AcquireEventParticipationLockResult =
    | { status: "acquired"; token: string }
    | { status: "event-unavailable" }
    | { status: "deletion-in-progress" }
    | { status: "participation-busy" };

export type ReleaseEventParticipationLockResult =
    | { status: "released" }
    | { status: "token-mismatch" }
    | { status: "not-held" }
    | { status: "event-unavailable" }
    | { status: "release-failed" };

export const buildParticipationMutationLockAcquireFilter = (eventId: ObjectId) => ({
    _id: eventId,
    deletionClaim: { $exists: false },
    participationMutationLock: { $exists: false },
});

export const buildParticipationMutationLockReleaseFilter = (eventId: ObjectId, token: string) => ({
    _id: eventId,
    "participationMutationLock.token": token,
});

const defaultStore: EventParticipationLockStore = {
    tryAcquire: async (eventId, lock) => {
        const { Events } = await import("./db");
        const result = await Events.findOneAndUpdate(
            buildParticipationMutationLockAcquireFilter(eventId),
            { $set: { participationMutationLock: lock } },
            { projection: { _id: 1 } },
        );
        return Boolean(result);
    },
    inspect: async (eventId) => {
        const { Events } = await import("./db");
        const event = await Events.findOne(
            { _id: eventId },
            { projection: { deletionClaim: 1, participationMutationLock: 1 } },
        );
        if (!event) return { status: "missing" };
        return {
            status: "found",
            hasDeletionClaim: Boolean(event.deletionClaim),
            hasParticipationLock: Boolean(event.participationMutationLock),
        };
    },
    tryRelease: async (eventId, token) => {
        const { Events } = await import("./db");
        const result = await Events.updateOne(buildParticipationMutationLockReleaseFilter(eventId, token), {
            $unset: { participationMutationLock: "" },
        });
        return result.modifiedCount === 1;
    },
};

export async function acquireEventParticipationLock(
    eventId: string,
    actorDid: string,
    operation: string,
    dependencies: {
        store?: EventParticipationLockStore;
        token?: string;
        acquiredAt?: Date;
    } = {},
): Promise<AcquireEventParticipationLockResult> {
    if (!ObjectId.isValid(eventId) || !actorDid || !operation) return { status: "event-unavailable" };

    const canonicalEventId = new ObjectId(eventId);
    const token = dependencies.token ?? randomUUID();
    const lock: EventParticipationMutationLock = {
        token,
        acquiredAt: dependencies.acquiredAt ?? new Date(),
        actorDid,
        operation,
    };
    const store = dependencies.store ?? defaultStore;

    try {
        if (await store.tryAcquire(canonicalEventId, lock)) return { status: "acquired", token };
    } catch (error) {
        console.error("Failed to acquire Event participation mutation lock:", error);
        return { status: "event-unavailable" };
    }

    try {
        const inspection = await store.inspect(canonicalEventId);
        if (inspection.status === "missing") return { status: "event-unavailable" };
        if (inspection.hasDeletionClaim) return { status: "deletion-in-progress" };
        if (inspection.hasParticipationLock) return { status: "participation-busy" };
        return { status: "event-unavailable" };
    } catch (error) {
        console.error("Failed to inspect Event participation mutation lock state:", error);
        return { status: "event-unavailable" };
    }
}

export async function releaseEventParticipationLock(
    eventId: string,
    token: string,
    store: EventParticipationLockStore = defaultStore,
): Promise<ReleaseEventParticipationLockResult> {
    if (!ObjectId.isValid(eventId) || !token) return { status: "token-mismatch" };
    const canonicalEventId = new ObjectId(eventId);

    try {
        if (await store.tryRelease(canonicalEventId, token)) return { status: "released" };
    } catch (error) {
        console.error("Failed to release Event participation mutation lock:", error);
        return { status: "release-failed" };
    }

    try {
        const inspection = await store.inspect(canonicalEventId);
        if (inspection.status === "missing") return { status: "event-unavailable" };
        if (!inspection.hasParticipationLock) return { status: "not-held" };
        return { status: "token-mismatch" };
    } catch (error) {
        console.error("Failed to inspect Event participation mutation lock after release:", error);
        return { status: "release-failed" };
    }
}
