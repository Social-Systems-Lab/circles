import assert from "node:assert/strict";
import {
    buildMonotonicLegacyCursorUpdate,
    buildReadStateV2InitializationOperation,
    resolveHistoricalReadBoundary,
} from "./chat-read-state-v2";
import { resolveTopicMigrationFallback } from "./topic-read-state";

const historicalId = "64a000000000000000000010";
const postBoundaryId = "64a000000000000000000020";
const updatedAt = new Date("2026-04-30T10:00:00.500Z");
const oldNullState = { _id: "state-1", lastReadMessageId: null, updatedAt };

const run = async () => {
    const resolvedNullBoundary = await resolveHistoricalReadBoundary(oldNullState, async (boundaryTime) => {
        assert.equal(boundaryTime, updatedAt);
        return historicalId;
    });
    assert.equal(resolvedNullBoundary, historicalId, "old null rows freeze the newest historical message");
    assert.equal(historicalId > resolvedNullBoundary!, false, "historical messages do not resurrect");
    assert.equal(postBoundaryId > resolvedNullBoundary!, true, "messages after the historical boundary are unread");

    const migrationA = buildReadStateV2InitializationOperation(oldNullState, historicalId, new Date("2026-08-10"));
    const migrationB = buildReadStateV2InitializationOperation(oldNullState, postBoundaryId, new Date("2026-08-11"));
    const stored: any = { ...oldNullState };
    const applyCas = (operation: ReturnType<typeof buildReadStateV2InitializationOperation>) => {
        if (stored.readStateVersion === 2) return false;
        if (stored.lastReadMessageId !== operation.filter.lastReadMessageId) return false;
        if (stored.updatedAt !== operation.filter.updatedAt) return false;
        Object.assign(stored, operation.update.$set);
        return true;
    };
    assert.equal(applyCas(migrationA), true, "the first atomic initializer wins");
    assert.equal(applyCas(migrationB), false, "a concurrent later initializer cannot replace the fallback");
    assert.equal(stored.topicFallbackMessageId, historicalId);

    stored.lastReadMessageId = postBoundaryId; // Simulate an overlapping old binary after V2 initialization.
    assert.equal(
        resolveTopicMigrationFallback(stored),
        historicalId,
        "an old writer cannot drift an initialized V2 topic fallback",
    );

    const newerLegacy = buildMonotonicLegacyCursorUpdate(postBoundaryId, new Date("2026-08-12"));
    const olderLegacy = buildMonotonicLegacyCursorUpdate(historicalId, new Date("2026-08-13"));
    let legacyCursor: string | null = null;
    const applyMax = (operation: ReturnType<typeof buildMonotonicLegacyCursorUpdate>) => {
        const candidate = (operation as any).$max?.legacyLastReadMessageId || null;
        if (candidate && (!legacyCursor || candidate > legacyCursor)) legacyCursor = candidate;
    };
    applyMax(newerLegacy);
    applyMax(olderLegacy);
    assert.equal(legacyCursor, postBoundaryId, "a stale legacy write cannot regress a newer cursor");
    assert.equal(
        stored.topicFallbackMessageId,
        historicalId,
        "legacy cursor updates never touch the immutable fallback",
    );

    console.log("chat read state v2 tests passed");
};

void run();
