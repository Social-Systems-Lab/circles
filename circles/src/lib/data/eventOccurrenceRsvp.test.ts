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
import { upsertEventOccurrenceRsvp, type EventOccurrenceRsvpResult } from "./eventOccurrenceRsvp";

type StoredEvent = {
    _id: ObjectId;
    deletionClaim?: { token: string; claimedAt: Date };
    participationMutationLock?: {
        token: string;
        acquiredAt: Date;
        actorDid: string;
        operation: string;
    };
    startAt: Date;
    stage: "draft" | "review" | "open" | "cancelled";
    recurrence?: { frequency: "daily"; interval: number; count: number };
};

const createFixture = (overrides: Partial<StoredEvent> = {}) => {
    const seriesId = new ObjectId();
    const occurrenceKey = new Date("2026-11-10T10:00:00.000Z").getTime();
    const canonicalSeriesId = seriesId.toHexString();
    const event: StoredEvent = {
        _id: seriesId,
        startAt: new Date(occurrenceKey),
        stage: "open",
        recurrence: { frequency: "daily", interval: 1, count: 7 },
        ...overrides,
    };
    const events = new Map<string, StoredEvent>([[canonicalSeriesId, event]]);
    const occurrenceRsvps = new Map<string, Record<string, unknown>>();
    const eventById = (id: ObjectId) => events.get(id.toHexString());

    const lockStore: EventParticipationLockStore = {
        tryAcquire: async (id, lock) => {
            const stored = eventById(id);
            const filter = buildParticipationMutationLockAcquireFilter(id);
            if (
                !stored ||
                filter.deletionClaim.$exists !== false ||
                filter.participationMutationLock.$exists !== false ||
                stored.deletionClaim ||
                stored.participationMutationLock
            ) {
                return false;
            }
            stored.participationMutationLock = lock;
            return true;
        },
        inspect: async (id) => {
            const stored = eventById(id);
            if (!stored) return { status: "missing" };
            return {
                status: "found",
                hasDeletionClaim: Boolean(stored.deletionClaim),
                hasParticipationLock: Boolean(stored.participationMutationLock),
            };
        },
        tryRelease: async (id, token) => {
            const stored = eventById(id);
            const filter = buildParticipationMutationLockReleaseFilter(id, token);
            if (!stored || !filter._id.equals(stored._id) || stored.participationMutationLock?.token !== token) {
                return false;
            }
            delete stored.participationMutationLock;
            return true;
        },
    };

    const deletionStore: EventDeletionClaimStore = {
        acquire: async (id, token, claimedAt) => {
            const objectId = new ObjectId(id);
            const stored = eventById(objectId);
            const filter = buildEventDeletionClaimAcquireFilter(objectId);
            if (
                !stored ||
                filter.deletionClaim.$exists !== false ||
                filter.participationMutationLock.$exists !== false ||
                stored.deletionClaim ||
                stored.participationMutationLock
            ) {
                return false;
            }
            stored.deletionClaim = { token, claimedAt };
            return true;
        },
        release: async (id, token) => {
            const stored = eventById(new ObjectId(id));
            if (stored?.deletionClaim?.token !== token) return false;
            delete stored.deletionClaim;
            return true;
        },
    };

    return {
        seriesId,
        canonicalSeriesId,
        occurrenceKey,
        event,
        events,
        occurrenceRsvps,
        lockStore,
        deletionStore,
        eventById,
    };
};

const dependencies = (fixture: ReturnType<typeof createFixture>, token: string) => ({
    lockStore: fixture.lockStore,
    lockToken: token,
    findEvent: async () => fixture.event,
    findOccurrence: async () => null,
    writeOccurrenceRsvp: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const set = update.$set as Record<string, unknown>;
        const key = `${String(filter.seriesId)}:${String(filter.occurrenceKey)}:${String(filter.userDid)}`;
        fixture.occurrenceRsvps.set(key, set);
        return { acknowledged: true };
    },
});

async function main() {
    const success = createFixture();
    const successResult = await upsertEventOccurrenceRsvp(
        success.canonicalSeriesId,
        success.occurrenceKey,
        "did:rsvp",
        "going",
        {
            ...dependencies(success, "occurrence-success"),
            writeOccurrenceRsvp: async (filter, update) => {
                assert.equal(
                    success.eventById(success.seriesId)?.participationMutationLock?.operation,
                    "event-occurrence-rsvp-upsert",
                );
                const set = update.$set as Record<string, unknown>;
                success.occurrenceRsvps.set(
                    `${String(filter.seriesId)}:${String(filter.occurrenceKey)}:${String(filter.userDid)}`,
                    set,
                );
                return { acknowledged: true };
            },
        },
    );
    assert.deepEqual(successResult, { status: "success" });
    assert.equal(success.eventById(success.seriesId)?.participationMutationLock, undefined);
    const successRecord = [...success.occurrenceRsvps.values()][0];
    assert.equal(successRecord.seriesId, success.canonicalSeriesId, "RSVP is scoped to the parent series");
    assert.equal(successRecord.occurrenceKey, success.occurrenceKey);
    assert.equal(successRecord.status, "going");

    const none = createFixture();
    const noneResult = await upsertEventOccurrenceRsvp(none.canonicalSeriesId, none.occurrenceKey, "did:none", "none", {
        ...dependencies(none, "occurrence-none"),
        writeOccurrenceRsvp: async (filter, update) => {
            assert.equal(
                none.eventById(none.seriesId)?.participationMutationLock?.operation,
                "event-occurrence-rsvp-cancel",
            );
            const set = update.$set as Record<string, unknown>;
            none.occurrenceRsvps.set(
                `${String(filter.seriesId)}:${String(filter.occurrenceKey)}:${String(filter.userDid)}`,
                set,
            );
            return { acknowledged: true };
        },
    });
    assert.deepEqual(noneResult, { status: "success" });
    assert.equal([...none.occurrenceRsvps.values()][0].status, "none");

    const competing = createFixture();
    await acquireEventParticipationLock(competing.canonicalSeriesId, "did:first", "event-occurrence-rsvp-upsert", {
        store: competing.lockStore,
        token: "first-occurrence-writer",
    });
    let competingWriteRan = false;
    const competingResult = await upsertEventOccurrenceRsvp(
        competing.canonicalSeriesId,
        competing.occurrenceKey,
        "did:second",
        "interested",
        {
            ...dependencies(competing, "second-occurrence-writer"),
            writeOccurrenceRsvp: async () => {
                competingWriteRan = true;
                return { acknowledged: true };
            },
        },
    );
    assert.deepEqual(competingResult, { status: "temporarily-busy" });
    assert.equal(competingWriteRan, false);

    const deletionFirst = createFixture({
        deletionClaim: { token: "deletion", claimedAt: new Date() },
    });
    assert.deepEqual(
        await upsertEventOccurrenceRsvp(
            deletionFirst.canonicalSeriesId,
            deletionFirst.occurrenceKey,
            "did:blocked",
            "going",
            dependencies(deletionFirst, "blocked-occurrence-writer"),
        ),
        { status: "deletion-in-progress" },
    );

    const writerFirst = createFixture();
    assert.equal(
        (
            await acquireEventParticipationLock(
                writerFirst.canonicalSeriesId,
                "did:writer",
                "event-occurrence-rsvp-upsert",
                { store: writerFirst.lockStore, token: "writer-first" },
            )
        ).status,
        "acquired",
    );
    assert.deepEqual(
        await acquireEventDeletionClaim(writerFirst.canonicalSeriesId, {
            store: writerFirst.deletionStore,
            token: "deletion-second",
        }),
        { status: "not-acquired" },
    );

    const missing = createFixture();
    missing.events.clear();
    assert.deepEqual(
        await upsertEventOccurrenceRsvp(
            missing.canonicalSeriesId,
            missing.occurrenceKey,
            "did:missing",
            "going",
            dependencies(missing, "missing-occurrence-writer"),
        ),
        { status: "event-unavailable" },
    );

    const revalidationFailed = createFixture({ stage: "cancelled" });
    let revalidationWriteRan = false;
    assert.deepEqual(
        await upsertEventOccurrenceRsvp(
            revalidationFailed.canonicalSeriesId,
            revalidationFailed.occurrenceKey,
            "did:changed",
            "going",
            {
                ...dependencies(revalidationFailed, "revalidation-writer"),
                writeOccurrenceRsvp: async () => {
                    revalidationWriteRan = true;
                    return { acknowledged: true };
                },
            },
        ),
        { status: "occurrence-unavailable" },
    );
    assert.equal(revalidationWriteRan, false);
    assert.equal(revalidationFailed.eventById(revalidationFailed.seriesId)?.participationMutationLock, undefined);

    const cancelledOccurrence = createFixture();
    assert.deepEqual(
        await upsertEventOccurrenceRsvp(
            cancelledOccurrence.canonicalSeriesId,
            cancelledOccurrence.occurrenceKey,
            "did:cancelled",
            "going",
            {
                ...dependencies(cancelledOccurrence, "cancelled-occurrence"),
                findOccurrence: async () => ({ status: "cancelled" }),
            },
        ),
        { status: "occurrence-cancelled" },
    );
    assert.equal(cancelledOccurrence.eventById(cancelledOccurrence.seriesId)?.participationMutationLock, undefined);

    const ambiguous = createFixture();
    const originalError = console.error;
    console.error = () => undefined;
    let ambiguousResult: EventOccurrenceRsvpResult;
    try {
        ambiguousResult = await upsertEventOccurrenceRsvp(
            ambiguous.canonicalSeriesId,
            ambiguous.occurrenceKey,
            "did:ambiguous",
            "going",
            {
                ...dependencies(ambiguous, "ambiguous-occurrence"),
                writeOccurrenceRsvp: async () => {
                    throw new Error("write outcome unknown");
                },
            },
        );
    } finally {
        console.error = originalError;
    }
    assert.equal(ambiguousResult.status, "mutation-uncertain");
    assert.equal(ambiguous.eventById(ambiguous.seriesId)?.participationMutationLock?.token, "ambiguous-occurrence");

    const releaseFailure = createFixture();
    const releaseFailureStore: EventParticipationLockStore = {
        ...releaseFailure.lockStore,
        tryRelease: async () => {
            throw new Error("release outcome unknown");
        },
    };
    const originalReleaseError = console.error;
    console.error = () => undefined;
    let releaseFailureResult: EventOccurrenceRsvpResult;
    try {
        releaseFailureResult = await upsertEventOccurrenceRsvp(
            releaseFailure.canonicalSeriesId,
            releaseFailure.occurrenceKey,
            "did:release",
            "going",
            {
                ...dependencies(releaseFailure, "occurrence-release-failure"),
                lockStore: releaseFailureStore,
            },
        );
    } finally {
        console.error = originalReleaseError;
    }
    assert.equal(releaseFailureResult.status, "release-failed");
    assert.equal(
        releaseFailure.eventById(releaseFailure.seriesId)?.participationMutationLock?.token,
        "occurrence-release-failure",
    );

    console.log("event occurrence RSVP lock integration tests passed");
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
