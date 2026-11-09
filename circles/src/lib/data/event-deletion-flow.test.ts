import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const section = (source: string, start: string, end: string) => {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.ok(startIndex >= 0 && endIndex > startIndex, `${start} and ${end} delimit a section`);
    return source.slice(startIndex, endIndex);
};

const actions = read("src/app/circles/[handle]/events/actions.ts");
const eventData = read("src/lib/data/event.ts");
const eventDetail = read("src/components/modules/events/event-detail.tsx");
const eventNotifications = read("src/lib/data/eventNotifications.ts");

const deleteAction = section(
    actions,
    "export async function deleteEventAction",
    "/**\n * Cancel one generated occurrence",
);
const authenticate = deleteAction.indexOf("getAuthenticatedUserDid()");
const hostCheck = deleteAction.indexOf("assertEventHostCirclesWritable(");
const routeCheck = deleteAction.indexOf("isRouteCircleEventHost(");
const manageCheck = deleteAction.indexOf("canManageEvent(");
const eligibility = deleteAction.indexOf("evaluateEventDeletionEligibility(");
const cleanup = deleteAction.indexOf("prepareEventDeletionCleanup(");
assert.ok(
    authenticate >= 0 &&
        authenticate < hostCheck &&
        hostCheck < routeCheck &&
        routeCheck < manageCheck &&
        manageCheck < eligibility &&
        eligibility < cleanup,
    "authentication, host authorization and participation eligibility precede cleanup",
);
assert.doesNotMatch(deleteAction, /deleteCircleOwnedMedia/, "Event deletion does not delete MinIO media");
assert.match(deleteAction, /event\.seriesId \|\| event\._id\?\.toString\(\)/);
assert.match(deleteAction, /deleteEventDb\(canonicalEventId\)/);

const cancelAction = section(actions, "export async function changeEventStageAction", "/**\n * RSVP - going");
assert.doesNotMatch(cancelAction, /deleteEventDb\(/, "the cancellation pathway never physically deletes an Event");
assert.match(cancelAction, /event\.seriesId \|\| event\._id\?\.toString\(\)/);
assert.match(cancelAction, /changeEventStageDb\(canonicalEventId, newStage\)/);

const dataDelete = section(eventData, "export const deleteEvent", "/**\n * Change the stage of an event.");
assert.match(dataDelete, /evaluateEventDeletionEligibility\(/);
assert.doesNotMatch(dataDelete, /EventRsvps\.deleteMany|EventInvitations\.deleteMany/);
assert.doesNotMatch(dataDelete, /EventOccurrenceRsvps\.deleteMany|EventOccurrenceInvitations\.deleteMany/);
assert.match(dataDelete, /runDerivedResourceVectorSafeMutation\(/);

assert.match(eventDetail, /deleteEventAction\(circleHandle, eventId\)/);
assert.match(
    eventDetail,
    /canEdit && \(event\.stage === "draft" \|\| event\.stage === "open"\)/,
    "Delete is offered for draft and published Events",
);
assert.match(eventDetail, /Delete this event\?/);
assert.match(eventDetail, /Cancel this event\?/);
assert.match(eventDetail, /router\.push\(`\/circles\/\$\{circleHandle\}\/events`\)/);
assert.match(eventDetail, /Images are retained for separate cleanup/);

assert.match(
    eventNotifications,
    /resolveEventCancellationRecipientDids\(/,
    "cancellation uses deduplicated affected-user recipients",
);
for (const collection of [
    "EventRsvps.find",
    "EventInvitations.find",
    "EventOccurrenceRsvps.find",
    "EventOccurrenceInvitations.find",
]) {
    assert.ok(eventNotifications.includes(collection), `${collection} contributes cancellation recipients`);
}

console.log("event deletion flow regression tests passed");
