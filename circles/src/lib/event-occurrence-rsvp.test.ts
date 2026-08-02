import assert from "node:assert/strict";
import { eventOccurrenceRsvpSchema, type EventDisplay } from "@/models/models";
import {
    applyEventOccurrenceRsvpState,
    buildEventOccurrenceRsvpUpsert,
    filterEventsForOccurrenceParticipation,
} from "@/lib/event-occurrence";
import {
    EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_KEYS,
    EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_OPTIONS,
} from "@/lib/data/event-occurrence-rsvp-indexes";

const seriesId = "507f1f77bcf86cd799439011";
const occurrenceKey = new Date("2026-02-02T10:00:00.000Z").getTime();
const userDid = "did:example:one";
const otherDid = "did:example:two";
const legacyDisplay = {
    _id: seriesId,
    attendees: 4,
    userRsvpStatus: "going",
} as EventDisplay;

assert.deepEqual(
    EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_KEYS,
    { seriesId: 1, occurrenceKey: 1, userDid: 1 },
    "one occurrence RSVP is uniquely keyed per series, occurrence, and user",
);
assert.equal(EVENT_OCCURRENCE_RSVP_UNIQUE_INDEX_OPTIONS.unique, true, "the occurrence RSVP index is unique");
assert.equal(
    eventOccurrenceRsvpSchema.safeParse({
        seriesId,
        occurrenceKey,
        userDid,
        status: "going",
        createdAt: new Date(),
        updatedAt: new Date(),
    }).success,
    true,
    "a valid occurrence RSVP record is accepted",
);
assert.equal(
    eventOccurrenceRsvpSchema.safeParse({
        seriesId,
        occurrenceKey: Number.MAX_SAFE_INTEGER + 1,
        userDid,
        status: "going",
        createdAt: new Date(),
        updatedAt: new Date(),
    }).success,
    false,
    "an unsafe occurrence key is rejected",
);
assert.equal(
    eventOccurrenceRsvpSchema.safeParse({
        seriesId,
        occurrenceKey: 8_640_000_000_000_001,
        userDid,
        status: "going",
        createdAt: new Date(),
        updatedAt: new Date(),
    }).success,
    false,
    "a safe integer outside the JavaScript Date range is rejected",
);

const previousKey = occurrenceKey - 7 * 86400000;
const nextKey = occurrenceKey + 7 * 86400000;
const occurrenceDisplays = [previousKey, occurrenceKey, nextKey].map(
    (key) =>
        ({
            _id: `${seriesId}_${key}`,
            seriesId,
            occurrenceKey: key,
            isRecurringInstance: true,
            createdBy: otherDid,
        }) as EventDisplay,
);
const participatingSeries = new Set([seriesId]);
const legacyGoingSeries = new Set([seriesId]);
assert.deepEqual(
    filterEventsForOccurrenceParticipation(
        occurrenceDisplays,
        participatingSeries,
        new Set(),
        new Map([[`${seriesId}:${occurrenceKey}`, "going"]]),
    ).map((event) => event.occurrenceKey),
    [occurrenceKey],
    "Going on the middle occurrence includes only the middle occurrence",
);
assert.deepEqual(
    filterEventsForOccurrenceParticipation(
        occurrenceDisplays,
        participatingSeries,
        new Set(),
        new Map([
            [`${seriesId}:${previousKey}`, "going"],
            [`${seriesId}:${nextKey}`, "going"],
        ]),
    ).map((event) => event.occurrenceKey),
    [previousKey, nextKey],
    "two Going occurrence records include exactly those two dates",
);
assert.deepEqual(
    filterEventsForOccurrenceParticipation(occurrenceDisplays, new Set(), new Set(), new Map()),
    [],
    "Interested and None records do not qualify an occurrence as participating",
);
assert.equal(
    filterEventsForOccurrenceParticipation(occurrenceDisplays, participatingSeries, legacyGoingSeries, new Map())
        .length,
    3,
    "legacy series-level Going keeps every generated occurrence",
);
assert.equal(
    filterEventsForOccurrenceParticipation(
        occurrenceDisplays,
        participatingSeries,
        new Set(),
        new Map([[`${seriesId}:${occurrenceKey}`, "none"]]),
        new Set([seriesId]),
    ).length,
    3,
    "a series included for another reason is not reduced to occurrence RSVP dates",
);

for (const status of ["none", "interested"] as const) {
    assert.deepEqual(
        filterEventsForOccurrenceParticipation(
            occurrenceDisplays,
            participatingSeries,
            legacyGoingSeries,
            new Map([[`${seriesId}:${occurrenceKey}`, status]]),
        ).map((event) => event.occurrenceKey),
        [previousKey, nextKey],
        `legacy Going with a middle occurrence ${status} excludes only the middle date`,
    );
}
assert.equal(
    filterEventsForOccurrenceParticipation(
        occurrenceDisplays,
        participatingSeries,
        legacyGoingSeries,
        new Map([[`${seriesId}:${occurrenceKey}`, "going"]]),
    ).length,
    3,
    "legacy Going with an occurrence Going override includes every date",
);
for (const status of ["none", "interested"] as const) {
    assert.deepEqual(
        filterEventsForOccurrenceParticipation(
            occurrenceDisplays,
            new Set(),
            new Set(),
            new Map([[`${seriesId}:${occurrenceKey}`, status]]),
        ),
        [],
        `an occurrence ${status} without legacy Going includes no dates`,
    );
}

assert.equal(
    applyEventOccurrenceRsvpState(legacyDisplay, [], userDid),
    legacyDisplay,
    "an untouched occurrence retains the read-only legacy series fallback",
);

const going = applyEventOccurrenceRsvpState(
    legacyDisplay,
    [
        { userDid, status: "going" },
        { userDid: otherDid, status: "interested" },
    ],
    userDid,
);
assert.equal(going.userRsvpStatus, "going", "the selected occurrence returns its own user status");
assert.equal(going.attendees, 1, "only occurrence-specific Going responses count as attendees");

const interested = applyEventOccurrenceRsvpState(
    legacyDisplay,
    [
        { userDid, status: "interested" },
        { userDid: otherDid, status: "going" },
    ],
    userDid,
);
assert.equal(interested.userRsvpStatus, "interested", "Interested is occurrence-specific");
assert.equal(interested.attendees, 1, "Interested does not increase the Going count");

const explicitNone = applyEventOccurrenceRsvpState(legacyDisplay, [{ userDid, status: "none" }], userDid);
assert.equal(explicitNone.userRsvpStatus, "none", "an explicit none tombstone suppresses the legacy Going fallback");
assert.equal(explicitNone.attendees, 0, "an explicit none tombstone does not count as Going");

const neighbouringUntouched = applyEventOccurrenceRsvpState(legacyDisplay, [], userDid);
assert.equal(neighbouringUntouched.userRsvpStatus, "going", "a neighbouring untouched occurrence keeps its fallback");
assert.equal(neighbouringUntouched.attendees, 4, "a neighbouring untouched occurrence keeps its fallback count");

const createdAt = new Date("2026-02-01T10:00:00.000Z");
const updatedAt = new Date("2026-02-01T11:00:00.000Z");
const goingUpsert = buildEventOccurrenceRsvpUpsert(seriesId, occurrenceKey, userDid, "going", createdAt);
const interestedUpsert = buildEventOccurrenceRsvpUpsert(seriesId, occurrenceKey, userDid, "interested", updatedAt);
const initialRecord = { ...goingUpsert.update.$setOnInsert, ...goingUpsert.update.$set };
const changedRecord = { ...initialRecord, ...interestedUpsert.update.$set };
assert.deepEqual(goingUpsert.filter, interestedUpsert.filter, "status changes update the same occurrence RSVP record");
assert.equal(goingUpsert.options.upsert, true, "Going uses an idempotent upsert");
assert.equal(changedRecord.status, "interested", "Going can change to Interested on the same record");
assert.equal(changedRecord.createdAt, createdAt, "status changes preserve createdAt");
assert.equal(changedRecord.updatedAt, updatedAt, "status changes advance updatedAt");

const noneUpsert = buildEventOccurrenceRsvpUpsert(seriesId, occurrenceKey, userDid, "none", updatedAt);
assert.deepEqual(noneUpsert.filter, goingUpsert.filter, "removal targets only the selected user and occurrence");
assert.equal(noneUpsert.update.$set.status, "none", "removal persists an explicit none tombstone");

const unrelatedRecords = [
    { seriesId, occurrenceKey: occurrenceKey - 7 * 86400000, userDid, status: "going" },
    { seriesId, occurrenceKey, userDid: otherDid, status: "going" },
];
assert.deepEqual(
    unrelatedRecords,
    [
        { seriesId, occurrenceKey: occurrenceKey - 7 * 86400000, userDid, status: "going" },
        { seriesId, occurrenceKey, userDid: otherDid, status: "going" },
    ],
    "neighbouring occurrences and other users remain unchanged",
);

console.log("event occurrence RSVP tests passed");
