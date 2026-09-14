import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    EVENT_OCCURRENCE_UNIQUE_INDEX_KEYS,
    EVENT_OCCURRENCE_UNIQUE_INDEX_OPTIONS,
} from "@/lib/data/event-occurrence-indexes";

assert.deepEqual(
    EVENT_OCCURRENCE_UNIQUE_INDEX_KEYS,
    { seriesId: 1, occurrenceKey: 1 },
    "occurrence state is uniquely keyed by series and immutable occurrence key",
);
assert.equal(EVENT_OCCURRENCE_UNIQUE_INDEX_OPTIONS.unique, true, "the occurrence compound index is unique");

const eventDataSource = readFileSync("src/lib/data/event.ts", "utf8");
assert.match(
    eventDataSource,
    /EventOccurrences\.deleteMany\(\{ seriesId: eventId \}\)/,
    "whole-series deletion removes sparse occurrence state",
);
assert.match(
    eventDataSource,
    /findOccurrences: async \(query\) => EventOccurrences\.find\(query\)\.toArray\(\)/,
    "the production recurrence dependency reads EventOccurrences with the supplied query",
);
assert.match(
    eventDataSource,
    /const occurrenceQuery = \{\s*seriesId: \{ \$in: recurringSeriesIds \},\s*occurrenceKey: \{ \$gte: range\.from\.getTime\(\), \$lte: range\.to\.getTime\(\) \},\s*\};[\s\S]*dependencies\.findOccurrences\(occurrenceQuery\)/,
    "recurrence enrichment uses the production seam with series-bound and range-bound occurrence identity",
);
assert.equal(
    (eventDataSource.match(/dependencies\.findOccurrences\(occurrenceQuery\)/g) || []).length,
    1,
    "recurrence enrichment has one batched occurrence-loading seam rather than per-Event queries",
);

console.log("event occurrence data tests passed");
