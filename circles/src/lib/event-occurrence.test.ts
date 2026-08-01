import assert from "node:assert/strict";
import type { Recurrence } from "@/models/models";
import {
    formatEventOccurrenceId,
    getRecurringOccurrenceStarts,
    isEventOccurrenceId,
    isGeneratedEventOccurrence,
    parseEventOccurrenceId,
    resolveEventOccurrence,
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

console.log("event occurrence tests passed");
