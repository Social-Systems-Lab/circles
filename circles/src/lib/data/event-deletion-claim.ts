import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import {
    evaluateEventDeletionEligibilityForAction,
    type EventDeletionEligibility,
    type EventDeletionPolicyDependencies,
} from "./event-deletion-policy";

/**
 * Phase 1 only: this claim serializes competing deletion attempts and fences the source delete.
 * Participation writers do not yet consult the claim, so it does not fully close the participation race.
 */
export type EventDeletionClaim = {
    token: string;
    claimedAt: Date;
};

export type EventDeletionClaimStore = {
    acquire: (eventId: string, token: string, claimedAt: Date) => Promise<boolean>;
    release: (eventId: string, token: string) => Promise<boolean>;
};

export type EventDeletionClaimStart =
    | { status: "claimed"; token: string }
    | { status: "not-acquired" }
    | { status: "participation-blocked"; released: boolean }
    | { status: "preflight-failed"; error: unknown; released: boolean };

export const buildEventDeletionClaimAcquireFilter = (eventId: ObjectId) => ({
    _id: eventId,
    deletionClaim: { $exists: false },
    participationMutationLock: { $exists: false },
});

const defaultClaimStore: EventDeletionClaimStore = {
    acquire: async (eventId, token, claimedAt) => {
        const { Events } = await import("./db");
        const result = await Events.findOneAndUpdate(
            buildEventDeletionClaimAcquireFilter(new ObjectId(eventId)),
            { $set: { deletionClaim: { token, claimedAt } } },
            { projection: { _id: 1 } },
        );
        return Boolean(result);
    },
    release: async (eventId, token) => {
        const { Events } = await import("./db");
        const result = await Events.updateOne(
            { _id: new ObjectId(eventId), "deletionClaim.token": token },
            { $unset: { deletionClaim: "" } },
        );
        return result.modifiedCount === 1;
    },
};

export async function acquireEventDeletionClaim(
    eventId: string,
    dependencies: {
        store?: EventDeletionClaimStore;
        token?: string;
        claimedAt?: Date;
    } = {},
): Promise<{ status: "claimed"; token: string } | { status: "not-acquired" | "invalid" }> {
    if (!ObjectId.isValid(eventId)) return { status: "invalid" };

    const token = dependencies.token ?? randomUUID();
    const claimedAt = dependencies.claimedAt ?? new Date();
    const acquired = await (dependencies.store ?? defaultClaimStore).acquire(
        new ObjectId(eventId).toHexString(),
        token,
        claimedAt,
    );
    return acquired ? { status: "claimed", token } : { status: "not-acquired" };
}

export async function releaseEventDeletionClaim(
    eventId: string,
    token: string,
    store: EventDeletionClaimStore = defaultClaimStore,
): Promise<boolean> {
    if (!ObjectId.isValid(eventId) || !token) return false;
    try {
        return await store.release(new ObjectId(eventId).toHexString(), token);
    } catch (error) {
        console.error("Failed to release Event deletion claim:", error);
        return false;
    }
}

export async function startClaimedEventDeletion(
    eventId: string,
    embeddedInvitations: readonly unknown[] | undefined,
    dependencies: {
        store?: EventDeletionClaimStore;
        policyDependencies?: EventDeletionPolicyDependencies;
        token?: string;
        claimedAt?: Date;
    } = {},
): Promise<EventDeletionClaimStart> {
    const acquired = await acquireEventDeletionClaim(eventId, dependencies);
    if (acquired.status !== "claimed") return { status: "not-acquired" };

    const eligibility = await evaluateEventDeletionEligibilityForAction(
        eventId,
        embeddedInvitations,
        dependencies.policyDependencies,
    );
    if (eligibility.status === "preflight-failed") {
        const released = await releaseEventDeletionClaim(
            eventId,
            acquired.token,
            dependencies.store ?? defaultClaimStore,
        );
        return { status: "preflight-failed", error: eligibility.error, released };
    }
    if (!eligibility.eligibility.allowed) {
        const released = await releaseEventDeletionClaim(
            eventId,
            acquired.token,
            dependencies.store ?? defaultClaimStore,
        );
        return { status: "participation-blocked", released };
    }

    return acquired;
}

export type EventDeletionClaimFailureKind = "pre-destructive" | "participation-blocked" | "ambiguous-destructive";

export const shouldReleaseEventDeletionClaim = (failure: EventDeletionClaimFailureKind): boolean =>
    failure !== "ambiguous-destructive";

export async function deleteEventRecordWithClaim(
    eventId: string,
    claimToken: string,
    deleteEvent: (eventId: string, claimToken: string) => Promise<boolean> = async (id, token) => {
        const { Events } = await import("./db");
        const result = await Events.deleteOne({
            _id: new ObjectId(id),
            "deletionClaim.token": token,
        });
        return result.deletedCount === 1;
    },
): Promise<boolean> {
    if (!ObjectId.isValid(eventId) || !claimToken) return false;
    return deleteEvent(new ObjectId(eventId).toHexString(), claimToken);
}

export function claimFailureKindAfterEligibility(
    eligibility: EventDeletionEligibility | undefined,
): EventDeletionClaimFailureKind {
    if (!eligibility) return "ambiguous-destructive";
    return eligibility.allowed ? "ambiguous-destructive" : "participation-blocked";
}
