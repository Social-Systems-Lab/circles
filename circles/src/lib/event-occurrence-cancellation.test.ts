import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actionsSource = readFileSync("src/app/circles/[handle]/events/actions.ts", "utf8");
const actionMatch = actionsSource.match(
    /export async function cancelEventOccurrenceAction[\s\S]*?\n}\n\n\/\*\*\n \* Change event stage/,
);
assert.ok(actionMatch, "the focused occurrence cancellation action exists");
const actionSource = actionMatch[0];

assert.match(actionSource, /getAuthenticatedUserDid\(\)/, "the action requires authentication");
assert.match(actionSource, /ObjectId\.isValid\(seriesId\)/, "the action validates the base series ObjectId");
assert.match(actionSource, /isValidEventOccurrenceKey\(occurrenceKey\)/, "the action validates the occurrence key");
assert.match(actionSource, /if \(!event\.recurrence\)/, "the action rejects non-recurring events");
assert.match(actionSource, /isRouteCircleEventHost/, "the action enforces route-host ownership");
assert.match(actionSource, /canManageEvent\(userDid, event\)/, "the action reuses event-management permission checks");
assert.match(actionSource, /isGeneratedEventOccurrence/, "the action rejects occurrences outside the recurrence rule");
assert.match(actionSource, /cancelEventOccurrence\(seriesId, occurrenceKey\)/, "the action performs one sparse upsert");
assert.match(
    actionSource,
    /revalidateEventHostPaths\(hostCircles, occurrenceId\)/,
    "host lists and detail paths are revalidated",
);
assert.doesNotMatch(actionSource, /EventRsvps\.(delete|update)/, "occurrence cancellation does not mutate RSVPs");
assert.doesNotMatch(
    actionSource,
    /EventInvitations\.(delete|update)/,
    "occurrence cancellation does not mutate invitations",
);
assert.doesNotMatch(actionSource, /changeEventStage/, "occurrence cancellation does not mutate the series stage");

const detailSource = readFileSync("src/components/modules/events/event-detail.tsx", "utf8");
assert.match(detailSource, />\s*Cancel this occurrence\s*</, "the organiser control is clearly occurrence-scoped");
assert.match(detailSource, /Cancel this occurrence\?/, "the confirmation title is occurrence-scoped");
assert.match(detailSource, /This will cancel only the meeting on \{occurrenceDateLabel\}/, "confirmation names one date");
assert.match(
    detailSource,
    /Other meetings in the series[\s\S]*will not be affected\./,
    "confirmation copy says neighbouring meetings are unaffected",
);
assert.match(detailSource, />Keep meeting</, "the confirmation provides a non-destructive exit");
assert.match(detailSource, /Cancel occurrence/, "the confirmation action is occurrence-scoped");
assert.match(detailSource, /This occurrence is cancelled\./, "cancelled occurrence state is rendered");
assert.match(detailSource, /RSVP changes are unavailable/, "RSVP controls are suppressed on cancelled occurrences");
assert.match(detailSource, /Edit series/, "series editing remains clearly distinct");
assert.match(detailSource, /Cancel series/, "whole-series cancellation remains clearly distinct");

console.log("event occurrence cancellation tests passed");
