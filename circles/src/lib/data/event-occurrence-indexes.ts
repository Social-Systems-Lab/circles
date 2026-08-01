import type { CreateIndexesOptions, IndexSpecification } from "mongodb";

export const EVENT_OCCURRENCE_UNIQUE_INDEX_KEYS = {
    seriesId: 1,
    occurrenceKey: 1,
} as const satisfies IndexSpecification;

export const EVENT_OCCURRENCE_UNIQUE_INDEX_OPTIONS: CreateIndexesOptions = {
    unique: true,
    name: "event_occurrence_series_key_unique",
};
