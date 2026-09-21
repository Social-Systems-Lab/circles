import { describe, expect, test } from "bun:test";
import { EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_KEYS, EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_OPTIONS } from "./event-occurrence-invitation-indexes";

describe("event-occurrence-invitation-indexes", () => {
    test("indexes the fields that identify the record, in order", () => {
        expect(EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_KEYS).toEqual({ seriesId: 1, occurrenceKey: 1, userDid: 1 });
        expect(Object.keys(EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_KEYS)).toEqual(["seriesId", "occurrenceKey", "userDid"]);
    });

    test("enforces uniqueness under a stable name", () => {
        expect(EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_OPTIONS).toEqual({ unique: true, name: "event_occurrence_invitation_series_key_user_unique" });
    });

    test("uses ascending order for every key", () => {
        expect(Object.values(EVENT_OCCURRENCE_INVITATION_UNIQUE_INDEX_KEYS).every((direction) => direction === 1)).toBe(true);
    });
});
