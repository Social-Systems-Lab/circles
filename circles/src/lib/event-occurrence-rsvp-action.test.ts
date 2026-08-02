import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actionsSource = readFileSync("src/app/circles/[handle]/events/actions.ts", "utf8");
const targetHelper = actionsSource.match(
    /async function resolveEventOccurrenceRsvpTarget[\s\S]*?\n}\n\nconst parseRequestedStage/,
);
assert.ok(targetHelper, "the shared occurrence RSVP validator exists");
assert.match(targetHelper[0], /ObjectId\.isValid\(seriesId\)/, "series IDs are validated");
assert.match(targetHelper[0], /isValidEventOccurrenceKey\(occurrenceKey\)/, "occurrence keys are validated");
assert.match(targetHelper[0], /features\.events\.rsvp/, "existing RSVP permission rules are reused");
assert.match(targetHelper[0], /if \(!event\.recurrence\)/, "non-recurring events are rejected");
assert.match(targetHelper[0], /event\.stage === "cancelled"/, "cancelled series are rejected");
assert.match(targetHelper[0], /isRouteCircleEventHost/, "route-host identity is validated");
assert.match(targetHelper[0], /isGeneratedEventOccurrence/, "out-of-rule occurrences are rejected");
assert.match(targetHelper[0], /occurrence\?\.status === "cancelled"/, "cancelled occurrences are rejected");

assert.match(actionsSource, /export async function rsvpEventOccurrenceAction/, "the occurrence RSVP action exists");
assert.match(actionsSource, /getAuthenticatedUserDid\(\)/, "occurrence RSVP actions require authentication");
assert.match(actionsSource, /canParticipate\(user\)/, "existing participation eligibility is reused");
assert.match(
    actionsSource,
    /upsertEventOccurrenceRsvp\(seriesId, occurrenceKey, userDid, status\)/,
    "Going and Interested use the sparse occurrence RSVP upsert",
);
assert.match(actionsSource, /export async function cancelEventOccurrenceRsvpAction/, "the removal action exists");
assert.match(
    actionsSource,
    /upsertEventOccurrenceRsvp\(seriesId, occurrenceKey, userDid, "none"\)/,
    "removal stores an explicit none tombstone",
);

const detailSource = readFileSync("src/components/modules/events/event-detail.tsx", "utf8");
assert.match(detailSource, /For this meeting only/, "occurrence RSVP scope is prominent and concise");
assert.match(detailSource, />\s*Attend\s*</, "an unselected recurring occurrence offers Attend");
assert.match(detailSource, />\s*Attending\s*</, "Going is rendered as a clear Attending status");
assert.match(detailSource, />\s*Not attending\s*</, "occurrence RSVP removal uses occurrence-scoped wording");
assert.match(detailSource, /rsvpEventOccurrenceAction/, "recurring occurrence UI uses the occurrence RSVP action");
assert.match(
    detailSource,
    /cancelEventOccurrenceRsvpAction/,
    "recurring occurrence removal uses the occurrence action",
);
assert.match(detailSource, /: await rsvpEventAction/, "non-recurring RSVP continues using the legacy action");
assert.match(detailSource, /: await cancelRsvpAction/, "non-recurring removal continues using the legacy action");
assert.match(
    detailSource,
    /if \(!isRecurringOccurrence\)[\s\S]*?>\s*Attend\s*</,
    "an unselected non-recurring event offers Attend",
);
assert.match(
    detailSource,
    /if \(!isRecurringOccurrence\)[\s\S]*?>\s*Attending\s*</,
    "non-recurring Going is rendered as Attending",
);
assert.match(
    detailSource,
    /if \(!isRecurringOccurrence\)[\s\S]*?>\s*Not attending\s*</,
    "non-recurring removal says Not attending",
);
assert.match(
    detailSource,
    /isRecurringOccurrence && !isOccurrenceCancelled && \([\s\S]*?For this meeting only/,
    "the occurrence-only scope pill remains gated to recurring occurrences",
);
assert.match(detailSource, /isOccurrenceCancelled \?/, "cancelled occurrences keep RSVP controls disabled");

const eventDataSource = readFileSync("src/lib/data/event.ts", "utf8");
assert.match(
    eventDataSource,
    /EventOccurrenceRsvps\.deleteMany\(\{ seriesId: eventId \}\)/,
    "series deletion cleans occurrence RSVPs",
);

const calendarSource = readFileSync("src/components/modules/events/calendar.tsx", "utf8");
assert.match(
    calendarSource,
    /ext\?\.isRecurringInstance \? ext\?\.userRsvpStatus : "none"/,
    "calendar RSVP labels are limited to generated occurrences",
);
assert.match(calendarSource, /occurrenceRsvpStatus === "going"[\s\S]*Attending/, "calendar shows Attending for Going");

const timelineSource = readFileSync("src/components/modules/events/event-timeline.tsx", "utf8");
assert.match(
    timelineSource,
    /!isCancelled && e\.userRsvpStatus === "going"[\s\S]*Attending/,
    "timeline shows Attending for any non-cancelled event with Going status",
);
assert.match(
    timelineSource,
    /!isCancelled && e\.userRsvpStatus === "interested"[\s\S]*Interested/,
    "timeline shows Interested for any non-cancelled event with Interested status",
);
assert.doesNotMatch(
    timelineSource,
    /e\.isRecurringInstance && e\.userRsvpStatus === (?:"going"|"interested")/,
    "timeline RSVP labels are not restricted to recurring instances",
);
assert.match(
    eventDataSource,
    /EventOccurrenceRsvps\.find\(\{[\s\S]*seriesId: \{ \$in: recurringSeriesIds \}/,
    "list reads batch occurrence RSVPs",
);
assert.match(
    eventDataSource,
    /EventOccurrenceRsvps\.find\(\{ userDid \}\)\.toArray\(\)/,
    "participating reads batch all of the user's occurrence overrides for precedence filtering",
);
assert.match(
    eventDataSource,
    /const visibleEvents = filterToParticipatingOccurrences[\s\S]*?: expandedEvents;/,
    "ordinary circle lists bypass the personal participating filter",
);

console.log("event occurrence RSVP action tests passed");
