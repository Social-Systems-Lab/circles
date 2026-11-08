import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const actions = fs.readFileSync(path.join(process.cwd(), "src/app/circles/[handle]/events/actions.ts"), "utf8");
const eventData = fs.readFileSync(path.join(process.cwd(), "src/lib/data/event.ts"), "utf8");
const eventDetail = fs.readFileSync(path.join(process.cwd(), "src/components/modules/events/event-detail.tsx"), "utf8");
const cleanupData = fs.readFileSync(path.join(process.cwd(), "src/lib/data/event-deletion-cleanup.ts"), "utf8");

const section = (source: string, startText: string, endText: string) => {
    const start = source.indexOf(startText);
    const end = source.indexOf(endText, start + startText.length);
    assert.ok(start >= 0, `${startText} exists`);
    assert.ok(end >= 0, `${endText} exists after ${startText}`);
    return source.slice(start, end);
};

const helper = section(actions, "const deleteAuthorizedEvent", "// ----- Actions -----");
const eligibility = helper.indexOf("evaluateEventDeletionEligibilityForAction(");
const preparation = helper.indexOf("prepareEventDeletionCleanup(event)");
const lifecycle = helper.indexOf("orchestrateEventDestructiveLifecycle({");
const cleanup = helper.indexOf("cleanupEventNoticeboardPosts(event)");
const preparedCleanup = helper.indexOf("executePreparedEventDeletionCleanup(prepared)");
const sourceDelete = helper.indexOf("deleteEventDb(canonicalEventId)");
for (const marker of [eligibility, preparation, lifecycle, cleanup, preparedCleanup, sourceDelete]) {
    assert.ok(marker >= 0, "safe deletion helper contains the required seam");
}
assert.ok(eligibility < preparation, "eligibility is checked before ownership preparation");
assert.match(
    helper,
    /eligibility\.status === "preflight-failed"[\s\S]*?return \{[\s\S]*?status: "preflight-failed"/,
    "eligibility lookup errors are classified as read-only preflight failures",
);
assert.ok(preparation < lifecycle, "ownership validation precedes destructive lifecycle work");
assert.ok(cleanup < sourceDelete && sourceDelete < preparedCleanup, "post/media cleanup follows source deletion");

const deleteAction = section(
    actions,
    "export async function deleteEventAction",
    "/**\n * Cancel one generated occurrence",
);
const authenticate = deleteAction.indexOf("getAuthenticatedUserDid(");
const hostCheck = deleteAction.indexOf("isRouteCircleEventHost(");
const manageCheck = deleteAction.indexOf("canManageEvent(");
const safeDelete = deleteAction.indexOf("deleteAuthorizedEvent(");
assert.ok(
    authenticate >= 0 && authenticate < hostCheck && hostCheck < manageCheck && manageCheck < safeDelete,
    "authentication, route-host authorization, and canManageEvent precede deletion",
);

const dataDelete = section(eventData, "export const deleteEvent", "/**\n * Change the stage of an event.");
const dataPolicy = dataDelete.indexOf("evaluateEventDeletionEligibility(");
const dataVectorDelete = dataDelete.indexOf("runDerivedResourceVectorSafeMutation(");
const dataMutation = dataDelete.indexOf("EventRsvps.deleteMany(");
assert.ok(dataPolicy >= 0 && dataPolicy < dataVectorDelete && dataPolicy < dataMutation);

const stage = section(
    actions,
    "export async function changeEventStageAction",
    "/**\n * RSVP - going / interested / waitlist",
);
const withdrawal = stage.indexOf('currentStage === "open" && newStage === "cancelled"');
const sharedDeletion = stage.indexOf("deleteAuthorizedEvent(", withdrawal);
assert.ok(withdrawal >= 0 && sharedDeletion > withdrawal, "open-to-cancelled uses the shared safe deletion path");
assert.match(
    stage,
    /shouldRunOrdinaryEventCancellation\(deletion\.status\)[\s\S]*?continuing with cancellation/,
    "blocked and read-only preflight failures fall through to ordinary cancellation",
);
assert.match(
    stage,
    /deletion\.status === "failed"[\s\S]*?return \{ success: false/,
    "possibly destructive deletion failures do not silently continue",
);
assert.equal(
    stage.includes("EventRsvps.countDocuments("),
    false,
    "the old event-level-only withdrawal guard is removed",
);

assert.match(helper, /deleteEventDb\(canonicalEventId\)/);
assert.match(helper, /afterSourceMutation:[\s\S]*?executePreparedEventDeletionCleanup\(prepared\)/);
assert.match(helper, /deleted-cleanup-incomplete/);
assert.match(cleanupData, /if \(classified\.kind === "public"\) return false/);
assert.match(cleanupData, /record\.resourceId &&[\s\S]*?record\.resourceId\) === normalizeId\(eventId\)/);
for (const field of [
    'ChatRooms.findOne({ "picture.url"',
    "ChatConversations.findOne",
    "MembershipRequests.findOne({ picture: url }",
    "{ picture: url }",
    "{ cover: url }",
]) {
    assert.ok(cleanupData.includes(field), `shared-media protection covers ${field}`);
}
assert.match(
    actions,
    /existingImageUrls[\s\S]*existingImageUrls\.has\(media\.fileInfo\.url\)/,
    "foreign existing-media URLs are rejected during event updates",
);

assert.match(eventDetail, /\{canEdit && \([\s\S]*?Delete series[\s\S]*?Delete event/);
assert.match(eventDetail, /deleteEventAction\(circleHandle, eventId\)/);
assert.match(eventDetail, /router\.push\(`\/circles\/\$\{circleHandle\}\/events`\)/);
assert.match(eventDetail, /cleanupComplete === false/);
assert.match(eventDetail, /Event deleted with cleanup warning/);
assert.match(eventDetail, /AlertDialogTitle[\s\S]*Delete this event series\?/);
assert.match(eventDetail, /Events with RSVPs, invitations, or recurring participation cannot/);
assert.match(
    eventDetail,
    /Public images are retained for separate\s+cleanup/,
    "the confirmation does not claim public images are deleted",
);
assert.match(eventDetail, /disabled=\{isPending\}[\s\S]*?Deleting…/);

console.log("event deletion call graph tests passed");
