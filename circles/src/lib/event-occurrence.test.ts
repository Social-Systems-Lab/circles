import assert from "node:assert/strict";
import { eventOccurrenceSchema, type EventOccurrence, type Recurrence } from "@/models/models";
import {
    buildEventOccurrenceCancellationUpsert,
    expandRecurringOccurrenceDisplays,
    formatEventOccurrenceId,
    getRecurringOccurrenceStarts,
    isEventOccurrenceId,
    isGeneratedEventOccurrence,
    isValidEventOccurrenceKey,
    parseEventOccurrenceId,
    resolveEventOccurrence,
    resolveGeneratedEventOccurrence,
    shouldShowCancelEventOccurrence,
} from "@/lib/event-occurrence";

const seriesId = "507f1f77bcf86cd799439011";
const startAt = new Date("2026-01-05T10:15:00.000Z");
const endAt = new Date("2026-01-05T11:45:00.000Z");
const daily: Recurrence = { frequency: "daily", interval: 1, count: 3 };

const occurrenceId = formatEventOccurrenceId(seriesId, startAt);
assert.equal(occurrenceId, `${seriesId}_${startAt.getTime()}`, "format preserves the existing millisecond URL format");
assert.deepEqual(
    parseEventOccurrenceId(occurrenceId),
    {
        seriesId,
        occurrenceId,
        occurrenceTimestamp: startAt.getTime(),
        occurrenceKey: startAt.getTime(),
        originalStartAt: startAt,
    },
    "formatting and parsing round trip the occurrence identity",
);

assert.equal(parseEventOccurrenceId(`not-an-object-id_${startAt.getTime()}`), null, "invalid ObjectIds are rejected");
assert.equal(parseEventOccurrenceId(seriesId), null, "non-recurring IDs are not parsed as occurrences");
assert.equal(parseEventOccurrenceId(`${seriesId}_`), null, "missing timestamps are rejected");
assert.equal(parseEventOccurrenceId(`${seriesId}_tomorrow`), null, "malformed timestamps are rejected");
assert.equal(parseEventOccurrenceId(`${seriesId}_-1`), null, "negative timestamps are rejected");
assert.equal(parseEventOccurrenceId(`${seriesId}_Infinity`), null, "non-finite timestamps are rejected");
assert.equal(parseEventOccurrenceId(`${seriesId}_999999999999999999999`), null, "nonsensical timestamps are rejected");
assert.equal(isEventOccurrenceId(occurrenceId), true, "valid generated-route syntax is recognized");
assert.equal(isEventOccurrenceId(seriesId), false, "a non-recurring event ID is not an occurrence ID");
assert.equal(isValidEventOccurrenceKey(startAt.getTime()), true, "a generated occurrence key is valid");
assert.equal(isValidEventOccurrenceKey(-1), false, "a negative occurrence key is invalid");
assert.equal(isValidEventOccurrenceKey(Number.NaN), false, "a non-finite occurrence key is invalid");

assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: daily }, new Date("2026-01-06T10:15:00.000Z")),
    true,
    "daily generated occurrences validate",
);
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: daily }, new Date("2026-01-06T22:15:00.000Z")),
    false,
    "timestamps between generated occurrences are rejected",
);

const weekly: Recurrence = { frequency: "weekly", interval: 1, count: 3 };
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: weekly }, new Date("2026-01-12T10:15:00.000Z")),
    true,
    "weekly generated occurrences validate",
);

const monthly: Recurrence = { frequency: "monthly", interval: 1, count: 3 };
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: monthly }, new Date("2026-02-05T10:15:00.000Z")),
    true,
    "monthly generated occurrences validate",
);
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: monthly }, new Date("2026-01-20T10:15:00.000Z")),
    false,
    "dates between monthly occurrences are rejected",
);

const yearly: Recurrence = { frequency: "yearly", interval: 1, count: 3 };
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: yearly }, new Date("2027-01-05T10:15:00.000Z")),
    true,
    "yearly generated occurrences validate",
);
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: yearly }, new Date("2026-07-05T10:15:00.000Z")),
    false,
    "dates between yearly occurrences are rejected",
);

const everyOtherDay: Recurrence = { frequency: "daily", interval: 2, count: 3 };
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: everyOtherDay }, new Date("2026-01-07T10:15:00.000Z")),
    true,
    "intervals greater than one are respected",
);
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: everyOtherDay }, new Date("2026-01-06T10:15:00.000Z")),
    false,
    "dates skipped by an interval are rejected",
);

assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: daily }, new Date("2026-01-07T10:15:00.000Z")),
    true,
    "the count boundary is included",
);
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: daily }, new Date("2026-01-08T10:15:00.000Z")),
    false,
    "timestamps after the count boundary are rejected",
);

const throughTuesday: Recurrence = {
    frequency: "daily",
    interval: 1,
    endDate: new Date("2026-01-06T23:59:59.999Z"),
};
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: throughTuesday }, new Date("2026-01-06T10:15:00.000Z")),
    true,
    "an occurrence on the end-date boundary is included",
);
assert.equal(
    isGeneratedEventOccurrence({ startAt, recurrence: throughTuesday }, new Date("2026-01-07T10:15:00.000Z")),
    false,
    "timestamps after the end date are rejected",
);

assert.deepEqual(
    getRecurringOccurrenceStarts(
        { startAt, recurrence: daily },
        { from: startAt, to: new Date("2026-01-10T10:15:00.000Z") },
    ).map((date) => date.toISOString()),
    ["2026-01-05T10:15:00.000Z", "2026-01-06T10:15:00.000Z", "2026-01-07T10:15:00.000Z"],
    "range expansion respects recurrence count",
);

const resolved = resolveEventOccurrence(seriesId, { startAt, endAt }, new Date("2026-01-06T10:15:00.000Z"));
assert.equal(
    resolved.endAt.getTime() - resolved.startAt.getTime(),
    endAt.getTime() - startAt.getTime(),
    "duration is preserved",
);

const movedStart = new Date("2026-01-06T14:00:00.000Z");
const moved = resolveEventOccurrence(seriesId, { startAt, endAt }, new Date("2026-01-06T10:15:00.000Z"), {
    startAt: movedStart,
});
assert.equal(moved.startAt.toISOString(), movedStart.toISOString(), "a hypothetical override controls effective time");
assert.equal(moved.originalStartAt.toISOString(), "2026-01-06T10:15:00.000Z", "original identity remains immutable");
assert.equal(
    moved.occurrenceKey,
    new Date("2026-01-06T10:15:00.000Z").getTime(),
    "a move does not change occurrence key",
);
assert.equal(
    moved.occurrenceId,
    `${seriesId}_${new Date("2026-01-06T10:15:00.000Z").getTime()}`,
    "a move does not change the route ID",
);
assert.equal(
    moved.endAt.getTime() - moved.startAt.getTime(),
    endAt.getTime() - startAt.getTime(),
    "a moved occurrence preserves duration",
);

const cancelledStart = new Date("2026-01-06T10:15:00.000Z");
const cancellation: EventOccurrence = {
    seriesId,
    occurrenceKey: cancelledStart.getTime(),
    originalStartAt: cancelledStart,
    status: "cancelled",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
assert.equal(
    eventOccurrenceSchema.safeParse(cancellation).success,
    true,
    "an occurrence model with a valid ObjectId seriesId is accepted",
);
assert.equal(
    eventOccurrenceSchema.safeParse({ ...cancellation, seriesId: "not-an-object-id" }).success,
    false,
    "an occurrence model with a malformed seriesId is rejected",
);
assert.equal(
    eventOccurrenceSchema.safeParse({ ...cancellation, originalStartAt: startAt }).success,
    false,
    "the occurrence model rejects disagreement between originalStartAt and occurrenceKey",
);

const untouched = resolveGeneratedEventOccurrence(seriesId, { startAt, endAt, recurrence: daily }, startAt);
assert.ok(untouched, "an untouched generated occurrence resolves");
assert.equal(untouched.occurrenceStatus, undefined, "an untouched occurrence has no persisted status");
assert.equal(untouched.isOccurrenceCancelled, undefined, "an untouched occurrence is not marked cancelled");

const cancelled = resolveGeneratedEventOccurrence(
    seriesId,
    { startAt, endAt, recurrence: daily },
    cancelledStart,
    cancellation,
);
assert.ok(cancelled, "a generated occurrence with matching persisted state resolves");
assert.equal(cancelled.occurrenceStatus, "cancelled", "matching persisted cancellation is overlaid");
assert.equal(cancelled.isOccurrenceCancelled, true, "matching persisted cancellation sets the typed flag");

const mismatchedSeries = resolveGeneratedEventOccurrence(
    seriesId,
    { startAt, endAt, recurrence: daily },
    cancelledStart,
    { ...cancellation, seriesId: "507f1f77bcf86cd799439012" },
);
assert.equal(
    mismatchedSeries?.occurrenceStatus,
    undefined,
    "an otherwise valid cancellation with the wrong valid ObjectId seriesId is ignored safely",
);

const mismatchedKey = resolveGeneratedEventOccurrence(seriesId, { startAt, endAt, recurrence: daily }, cancelledStart, {
    ...cancellation,
    occurrenceKey: startAt.getTime(),
    originalStartAt: startAt,
});
assert.equal(mismatchedKey?.occurrenceStatus, undefined, "a mismatched occurrence key is ignored safely");

const mismatchedOriginalStart = resolveGeneratedEventOccurrence(
    seriesId,
    { startAt, endAt, recurrence: daily },
    cancelledStart,
    { ...cancellation, originalStartAt: startAt },
);
assert.equal(
    mismatchedOriginalStart?.occurrenceStatus,
    undefined,
    "an originalStartAt and occurrenceKey disagreement is ignored safely",
);

const outOfRuleStart = new Date("2026-01-06T22:15:00.000Z");
assert.equal(
    resolveGeneratedEventOccurrence(seriesId, { startAt, endAt, recurrence: daily }, outOfRuleStart, {
        ...cancellation,
        occurrenceKey: outOfRuleStart.getTime(),
        originalStartAt: outOfRuleStart,
    }),
    null,
    "persisted state cannot make an out-of-rule occurrence valid",
);

const seriesDisplay = {
    _id: seriesId,
    startAt,
    endAt,
    recurrence: daily,
    stage: "open" as const,
};
const expanded = expandRecurringOccurrenceDisplays(
    seriesDisplay,
    { from: startAt, to: new Date("2026-01-07T10:15:00.000Z") },
    [cancellation],
);
assert.equal(expanded.length, 3, "a sparse cancellation does not change expansion count");
assert.deepEqual(
    expanded.map((occurrence) => occurrence.occurrenceId),
    [
        formatEventOccurrenceId(seriesId, startAt),
        formatEventOccurrenceId(seriesId, cancelledStart),
        formatEventOccurrenceId(seriesId, new Date("2026-01-07T10:15:00.000Z")),
    ],
    "a sparse cancellation does not change generated occurrence IDs",
);
assert.deepEqual(
    expanded.map((occurrence) => occurrence.isOccurrenceCancelled),
    [undefined, true, undefined],
    "exactly one generated occurrence carries cancellation state",
);
assert.deepEqual(
    expanded.map((occurrence) => occurrence.stage),
    ["open", "open", "open"],
    "occurrence cancellation does not change the series event stage",
);
assert.equal(
    expanded[1].occurrenceStatus,
    cancelled?.occurrenceStatus,
    "expanded and direct occurrence resolution carry the same cancellation state",
);

const manageableOccurrence = {
    seriesId,
    occurrenceKey: cancelledStart.getTime(),
    isRecurringInstance: true,
    isOccurrenceCancelled: false,
    stage: "open" as const,
};
assert.equal(
    shouldShowCancelEventOccurrence(manageableOccurrence, true),
    true,
    "an organiser can cancel an active generated occurrence",
);
assert.equal(
    shouldShowCancelEventOccurrence({ ...manageableOccurrence, isRecurringInstance: false }, true),
    false,
    "the occurrence cancellation control is hidden for a base or non-recurring event",
);
assert.equal(
    shouldShowCancelEventOccurrence(manageableOccurrence, false),
    false,
    "the occurrence cancellation control is hidden from unauthorised users",
);
assert.equal(
    shouldShowCancelEventOccurrence({ ...manageableOccurrence, isOccurrenceCancelled: true }, true),
    false,
    "the occurrence cancellation control disappears after cancellation",
);
assert.equal(
    shouldShowCancelEventOccurrence({ ...manageableOccurrence, stage: "cancelled" }, true),
    false,
    "the occurrence cancellation control is hidden when the whole series is cancelled",
);

const firstCancellationAt = new Date("2026-01-02T10:00:00.000Z");
const repeatedCancellationAt = new Date("2026-01-03T10:00:00.000Z");
const firstUpsert = buildEventOccurrenceCancellationUpsert(seriesId, cancelledStart.getTime(), firstCancellationAt);
const repeatedUpsert = buildEventOccurrenceCancellationUpsert(
    seriesId,
    cancelledStart.getTime(),
    repeatedCancellationAt,
);
const firstStoredRecord = { ...firstUpsert.update.$setOnInsert, ...firstUpsert.update.$set };
const repeatedStoredRecord = { ...firstStoredRecord, ...repeatedUpsert.update.$set };
assert.deepEqual(firstUpsert.filter, repeatedUpsert.filter, "repeated cancellation targets the same sparse record");
assert.equal(firstUpsert.options.upsert, true, "cancellation uses an idempotent upsert");
assert.equal(
    repeatedStoredRecord.createdAt,
    firstCancellationAt,
    "repeated cancellation preserves the original createdAt",
);
assert.equal(repeatedStoredRecord.updatedAt, repeatedCancellationAt, "repeated cancellation advances updatedAt");
assert.equal(repeatedStoredRecord.status, "cancelled", "the sparse record stores cancelled status");
assert.equal(
    repeatedStoredRecord.originalStartAt.getTime(),
    cancelledStart.getTime(),
    "the sparse record preserves the immutable original occurrence identity",
);

console.log("event occurrence tests passed");
