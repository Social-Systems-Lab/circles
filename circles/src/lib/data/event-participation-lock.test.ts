import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
    acquireEventParticipationLock,
    buildParticipationMutationLockAcquireFilter,
    buildParticipationMutationLockReleaseFilter,
    releaseEventParticipationLock,
    type EventParticipationLockStore,
    type ReleaseEventParticipationLockResult,
} from "./event-participation-lock";
import {
    acquireEventDeletionClaim,
    buildEventDeletionClaimAcquireFilter,
    type EventDeletionClaimStore,
} from "./event-deletion-claim";

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

const createEventStore = (initial?: StoredEvent) => {
    const events = new Map<string, StoredEvent>();
    if (initial) events.set(initial._id.toHexString(), initial);

    const eventById = (eventId: ObjectId) => events.get(eventId.toHexString());
    const participationStore: EventParticipationLockStore = {
        tryAcquire: async (eventId, lock) => {
            const event = eventById(eventId);
            const filter = buildParticipationMutationLockAcquireFilter(eventId);
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
        inspect: async (eventId) => {
            const event = eventById(eventId);
            if (!event) return { status: "missing" };
            return {
                status: "found",
                hasDeletionClaim: Boolean(event.deletionClaim),
                hasParticipationLock: Boolean(event.participationMutationLock),
            };
        },
        tryRelease: async (eventId, token) => {
            const event = eventById(eventId);
            const filter = buildParticipationMutationLockReleaseFilter(eventId, token);
            if (!event || !filter._id.equals(event._id) || event.participationMutationLock?.token !== token) {
                return false;
            }
            delete event.participationMutationLock;
            return true;
        },
    };

    const deletionStore: EventDeletionClaimStore = {
        acquire: async (eventId, token, claimedAt) => {
            const objectId = new ObjectId(eventId);
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
        release: async (eventId, token) => {
            const event = eventById(new ObjectId(eventId));
            if (event?.deletionClaim?.token !== token) return false;
            delete event.deletionClaim;
            return true;
        },
    };

    return { events, participationStore, deletionStore };
};

async function main() {
    const eventId = new ObjectId();
    const canonicalEventId = eventId.toHexString();
    const event = { _id: eventId };
    const state = createEventStore(event);

    assert.deepEqual(buildParticipationMutationLockAcquireFilter(eventId), {
        _id: eventId,
        deletionClaim: { $exists: false },
        participationMutationLock: { $exists: false },
    });
    assert.deepEqual(buildEventDeletionClaimAcquireFilter(eventId), {
        _id: eventId,
        deletionClaim: { $exists: false },
        participationMutationLock: { $exists: false },
    });

    const firstWriter = await acquireEventParticipationLock(canonicalEventId, "did:writer:one", "event-rsvp", {
        store: state.participationStore,
        token: "writer-one",
    });
    assert.deepEqual(firstWriter, { status: "acquired", token: "writer-one" });
    assert.equal(state.events.get(canonicalEventId)?.participationMutationLock?.actorDid, "did:writer:one");
    assert.equal(state.events.get(canonicalEventId)?.participationMutationLock?.operation, "event-rsvp");

    const secondWriter = await acquireEventParticipationLock(canonicalEventId, "did:writer:two", "event-invite", {
        store: state.participationStore,
        token: "writer-two",
    });
    assert.deepEqual(secondWriter, { status: "participation-busy" }, "competing writers are rejected");

    const deletionAfterWriter = await acquireEventDeletionClaim(canonicalEventId, {
        store: state.deletionStore,
        token: "deletion-after-writer",
    });
    assert.deepEqual(
        deletionAfterWriter,
        { status: "not-acquired" },
        "an active participation lock blocks deletion claim acquisition",
    );

    assert.deepEqual(await releaseEventParticipationLock(canonicalEventId, "wrong-token", state.participationStore), {
        status: "token-mismatch",
    });
    assert.equal(state.events.get(canonicalEventId)?.participationMutationLock?.token, "writer-one");
    assert.deepEqual(await releaseEventParticipationLock(canonicalEventId, "writer-one", state.participationStore), {
        status: "released",
    });

    const deletionFirstState = createEventStore({ _id: new ObjectId(eventId) });
    const deletionFirst = await acquireEventDeletionClaim(canonicalEventId, {
        store: deletionFirstState.deletionStore,
        token: "deletion-first",
    });
    assert.deepEqual(deletionFirst, { status: "claimed", token: "deletion-first" });
    assert.deepEqual(
        await acquireEventParticipationLock(canonicalEventId, "did:writer", "occurrence-rsvp", {
            store: deletionFirstState.participationStore,
            token: "writer-after-deletion",
        }),
        { status: "deletion-in-progress" },
        "an active deletion claim blocks participation lock acquisition",
    );

    const missingEvent = await acquireEventParticipationLock(new ObjectId().toHexString(), "did:writer", "event-rsvp", {
        store: state.participationStore,
    });
    assert.deepEqual(missingEvent, { status: "event-unavailable" }, "missing events are reported explicitly");

    const releaseFailureState = createEventStore({ _id: new ObjectId(eventId) });
    await acquireEventParticipationLock(canonicalEventId, "did:writer", "occurrence-invite", {
        store: releaseFailureState.participationStore,
        token: "release-failure",
    });
    const originalError = console.error;
    console.error = () => undefined;
    let failedRelease: ReleaseEventParticipationLockResult;
    try {
        failedRelease = await releaseEventParticipationLock(canonicalEventId, "release-failure", {
            ...releaseFailureState.participationStore,
            tryRelease: async () => {
                throw new Error("release outcome unknown");
            },
        });
    } finally {
        console.error = originalError;
    }
    assert.deepEqual(failedRelease, { status: "release-failed" });
    assert.equal(
        releaseFailureState.events.get(canonicalEventId)?.participationMutationLock?.token,
        "release-failure",
        "an ambiguous release failure retains the lock",
    );

    console.log("event participation lock tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
