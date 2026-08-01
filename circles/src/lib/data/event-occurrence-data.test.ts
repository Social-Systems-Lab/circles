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
    /EventOccurrences\.find\(\{[\s\S]*seriesId: \{ \$in: recurringSeriesIds \}[\s\S]*occurrenceKey: \{ \$gte:/,
    "list reads batch occurrence state by series IDs and range",
);
assert.equal(
    (eventDataSource.match(/EventOccurrences\.find\(\{/g) || []).length,
    1,
    "list expansion uses one batched occurrence query rather than one query per generated occurrence",
);

console.log("event occurrence data tests passed");
