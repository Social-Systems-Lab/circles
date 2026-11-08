import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
    acquireEventParticipationLock,
    buildParticipationMutationLockAcquireFilter,
    buildParticipationMutationLockReleaseFilter,
    type EventParticipationLockStore,
} from "./event-participation-lock";
import {
    acquireEventDeletionClaim,
    buildEventDeletionClaimAcquireFilter,
    type EventDeletionClaimStore,
} from "./event-deletion-claim";
import { cancelRsvp, upsertRsvp, type UpsertRsvpResult } from "./eventRsvp";

type StoredEvent = {
    _id: ObjectId;
    deletionClaim?: { token: string; claimedAt: Date };
    participationMutationLock?: {
        token: string;
        acquiredAt: Date;
        actorDid: string;
        operation: string;
    };
};

type StoredRsvp = {
    eventId: string;
    userDid: string;
    status: string;
    [key: string]: unknown;
};

const createFixture = () => {
    const eventId = new ObjectId();
    const canonicalEventId = eventId.toHexString();
    const events = new Map<string, StoredEvent>([[canonicalEventId, { _id: eventId }]]);
    const rsvps = new Map<string, StoredRsvp>();
    const eventById = (id: ObjectId) => events.get(id.toHexString());

    const lockStore: EventParticipationLockStore = {
        tryAcquire: async (id, lock) => {
            const event = eventById(id);
            const filter = buildParticipationMutationLockAcquireFilter(id);
            if (
                !event ||
                filter.deletionClaim.$exists !== false ||
                filter.participationMutationLock.$exists !== false ||
                event.deletionClaim ||
                event.participationMutationLock
            ) {
                return false;
            }
            event.participationMutationLock = lock;
            return true;
        },
        inspect: async (id) => {
            const event = eventById(id);
            if (!event) return { status: "missing" };
            return {
                status: "found",
                hasDeletionClaim: Boolean(event.deletionClaim),
                hasParticipationLock: Boolean(event.participationMutationLock),
            };
        },
        tryRelease: async (id, token) => {
            const event = eventById(id);
            const filter = buildParticipationMutationLockReleaseFilter(id, token);
            if (!event || !filter._id.equals(event._id) || event.participationMutationLock?.token !== token) {
                return false;
            }
            delete event.participationMutationLock;
            return true;
        },
    };

    const deletionStore: EventDeletionClaimStore = {
        acquire: async (id, token, claimedAt) => {
            const objectId = new ObjectId(id);
            const event = eventById(objectId);
            const filter = buildEventDeletionClaimAcquireFilter(objectId);
            if (
                !event ||
                filter.deletionClaim.$exists !== false ||
                filter.participationMutationLock.$exists !== false ||
                event.deletionClaim ||
                event.participationMutationLock
            ) {
                return false;
            }
            event.deletionClaim = { token, claimedAt };
            return true;
        },
        release: async (id, token) => {
            const event = eventById(new ObjectId(id));
            if (event?.deletionClaim?.token !== token) return false;
            delete event.deletionClaim;
            return true;
        },
    };

    return {
        eventId,
        canonicalEventId,
        events,
        rsvps,
        lockStore,
        deletionStore,
        eventById,
    };
};

const rsvpKey = (eventId: string, userDid: string) => `${eventId}:${userDid}`;

async function main() {
    const success = createFixture();
    const successfulRsvp = await upsertRsvp(
        success.canonicalEventId,
        "circle-id",
        "did:rsvp",
        "going",
        ["greeter"],
        false,
        "  See you there  ",
        {
            lockStore: success.lockStore,
            lockToken: "rsvp-success",
            writeRsvp: async (filter, update) => {
                assert.equal(filter.eventId, success.canonicalEventId);
                assert.equal(filter.userDid, "did:rsvp");
                assert.equal(update.status, "going");
                assert.deepEqual(update.selectedRoles, ["greeter"]);
                assert.equal(update.isPublic, false);
                assert.equal(update.message, "See you there");
                success.rsvps.set(rsvpKey(success.canonicalEventId, "did:rsvp"), {
                    ...(update as unknown as StoredRsvp),
                });
                return { acknowledged: true };
            },
        },
    );
    assert.deepEqual(successfulRsvp, { status: "success" });
    assert.equal(success.eventById(success.eventId)?.participationMutationLock, undefined);

    const cancel = createFixture();
    cancel.rsvps.set(rsvpKey(cancel.canonicalEventId, "did:cancel"), {
        eventId: cancel.canonicalEventId,
        userDid: "did:cancel",
        status: "going",
    });
    const cancelResult = await cancelRsvp(cancel.canonicalEventId, "did:cancel", {
        lockStore: cancel.lockStore,
        lockToken: "rsvp-cancel",
        deleteRsvp: async (filter) => {
            const deleted = cancel.rsvps.delete(rsvpKey(String(filter.eventId), String(filter.userDid)));
            return { acknowledged: true, deletedCount: deleted ? 1 : 0 };
        },
    });
    assert.deepEqual(cancelResult, { status: "success" });
    assert.equal(cancel.rsvps.size, 0);
    assert.equal(cancel.eventById(cancel.eventId)?.participationMutationLock, undefined);

    const competing = createFixture();
    const heldLock = await acquireEventParticipationLock(competing.canonicalEventId, "did:first", "event-rsvp", {
        store: competing.lockStore,
        token: "first-writer",
    });
    assert.equal(heldLock.status, "acquired");
    let competingWriteRan = false;
    const competingResult = await upsertRsvp(
        competing.canonicalEventId,
        "circle-id",
        "did:second",
        "interested",
        undefined,
        undefined,
        undefined,
        {
            lockStore: competing.lockStore,
            lockToken: "second-writer",
            writeRsvp: async () => {
                competingWriteRan = true;
                return { acknowledged: true };
            },
        },
    );
    assert.deepEqual(competingResult, { status: "temporarily-busy" });
    assert.equal(competingWriteRan, false, "a competing writer does not mutate RSVP records");

    const deletionClaimed = createFixture();
    deletionClaimed.eventById(deletionClaimed.eventId)!.deletionClaim = {
        token: "deletion",
        claimedAt: new Date(),
    };
    assert.deepEqual(
        await upsertRsvp(
            deletionClaimed.canonicalEventId,
            "circle-id",
            "did:blocked",
            "going",
            undefined,
            undefined,
            undefined,
            {
                lockStore: deletionClaimed.lockStore,
            },
        ),
        { status: "deletion-in-progress" },
    );

    const writerFirst = createFixture();
    assert.equal(
        (
            await acquireEventParticipationLock(writerFirst.canonicalEventId, "did:writer", "event-rsvp", {
                store: writerFirst.lockStore,
                token: "writer-first",
            })
        ).status,
        "acquired",
    );
    assert.deepEqual(
        await acquireEventDeletionClaim(writerFirst.canonicalEventId, {
            store: writerFirst.deletionStore,
            token: "deletion-second",
        }),
        { status: "not-acquired" },
        "writer lock prevents a deletion claim",
    );

    const ambiguousWrite = createFixture();
    const originalAmbiguousError = console.error;
    console.error = () => undefined;
    let ambiguousWriteResult: UpsertRsvpResult;
    try {
        ambiguousWriteResult = await upsertRsvp(
            ambiguousWrite.canonicalEventId,
            "circle-id",
            "did:uncertain",
            "going",
            undefined,
            undefined,
            undefined,
            {
                lockStore: ambiguousWrite.lockStore,
                lockToken: "ambiguous-write",
                writeRsvp: async () => {
                    throw new Error("write outcome unknown");
                },
            },
        );
    } finally {
        console.error = originalAmbiguousError;
    }
    assert.equal(ambiguousWriteResult.status, "mutation-uncertain");
    assert.equal(
        ambiguousWrite.eventById(ambiguousWrite.eventId)?.participationMutationLock?.token,
        "ambiguous-write",
        "an ambiguous write retains the lock",
    );

    const releaseFailure = createFixture();
    const releaseFailureStore: EventParticipationLockStore = {
        ...releaseFailure.lockStore,
        tryRelease: async () => {
            throw new Error("release outcome unknown");
        },
    };
    const originalError = console.error;
    console.error = () => undefined;
    let releaseFailureResult: UpsertRsvpResult;
    try {
        releaseFailureResult = await upsertRsvp(
            releaseFailure.canonicalEventId,
            "circle-id",
            "did:release",
            "going",
            undefined,
            undefined,
            undefined,
            {
                lockStore: releaseFailureStore,
                lockToken: "release-failure",
                writeRsvp: async () => ({ acknowledged: true }),
            },
        );
    } finally {
        console.error = originalError;
    }
    assert.equal(releaseFailureResult.status, "release-failed");
    assert.equal(
        releaseFailure.eventById(releaseFailure.eventId)?.participationMutationLock?.token,
        "release-failure",
        "release failure retains the lock",
    );

    console.log("event RSVP lock integration tests passed");
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
