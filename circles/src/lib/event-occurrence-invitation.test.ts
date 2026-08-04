import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventOccurrenceInvitationSchema } from "@/models/models";
import { mergeEventOccurrenceInvitees } from "@/lib/event-occurrence-invitation";

const seriesId = "507f1f77bcf86cd799439011";
const occurrenceKey = new Date("2026-08-12T17:00:00.000Z").getTime();
const baseInvitation = {
    seriesId,
    occurrenceKey,
    userDid: "did:example:invitee",
    invitedBy: "did:example:organiser",
    circleId: "circle-id",
    message: "  Bring the agenda  ",
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: new Date(),
};

const parsed = eventOccurrenceInvitationSchema.parse(baseInvitation);
assert.equal(parsed.message, "Bring the agenda", "messages are trimmed");
assert.equal(eventOccurrenceInvitationSchema.safeParse({ ...baseInvitation, seriesId: "bad" }).success, false);
assert.equal(eventOccurrenceInvitationSchema.safeParse({ ...baseInvitation, occurrenceKey: -1 }).success, false);
assert.equal(eventOccurrenceInvitationSchema.safeParse({ ...baseInvitation, occurrenceKey: 1.5 }).success, false);
assert.equal(
    eventOccurrenceInvitationSchema.safeParse({ ...baseInvitation, occurrenceKey: Number.MAX_SAFE_INTEGER }).success,
    false,
    "out-of-Date-range safe integers are rejected",
);
assert.equal(eventOccurrenceInvitationSchema.safeParse({ ...baseInvitation, message: "x".repeat(501) }).success, false);

const seriesInvitation = {
    userDid: "did:example:series",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};
const occurrenceInvitation = {
    userDid: "did:example:series",
    message: "Exact meeting",
    sentAt: new Date("2026-08-02T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
};
const rows = mergeEventOccurrenceInvitees(
    [seriesInvitation, { ...seriesInvitation, userDid: "did:example:pending" }],
    [occurrenceInvitation, { ...occurrenceInvitation, userDid: "did:example:none" }],
    [
        { userDid: "did:example:series", status: "going" },
        { userDid: "did:example:none", status: "none" },
        { userDid: "did:example:neighbour", status: "interested" },
    ],
);
assert.equal(rows.find((row) => row.userDid === "did:example:series")?.scope, "occurrence");
assert.equal(rows.find((row) => row.userDid === "did:example:series")?.response, "going");
assert.equal(rows.find((row) => row.userDid === "did:example:pending")?.response, "pending");
assert.equal(rows.find((row) => row.userDid === "did:example:none")?.response, "not_attending");
assert.equal(
    rows.some((row) => row.userDid === "did:example:neighbour"),
    false,
);

const indexSource = readFileSync("src/lib/data/event-occurrence-invitation-indexes.ts", "utf8");
assert.match(indexSource, /seriesId: 1,[\s\S]*occurrenceKey: 1,[\s\S]*userDid: 1/);
assert.match(indexSource, /unique: true/);

const persistenceSource = readFileSync("src/lib/data/eventOccurrenceInvitation.ts", "utf8");
assert.match(persistenceSource, /updateOne\(/);
assert.match(persistenceSource, /\$setOnInsert/);
assert.match(persistenceSource, /upsertedCount === 1/);

const actionsSource = readFileSync("src/app/circles/[handle]/events/actions.ts", "utf8");
const targetSource = actionsSource.match(
    /async function resolveManageableEventOccurrenceInvitationTarget[\s\S]*?\n}\n\nexport async function inviteUsersToEventOccurrenceAction/,
)?.[0];
assert.ok(targetSource);
assert.match(targetSource, /ObjectId\.isValid\(seriesId\)/);
assert.match(targetSource, /isValidEventOccurrenceKey\(occurrenceKey\)/);
assert.match(targetSource, /if \(!event\.recurrence\)/);
assert.match(targetSource, /event\.stage === "cancelled"/);
assert.match(targetSource, /isRouteCircleEventHost/);
assert.match(targetSource, /canManageEvent\(actorDid, event\)/);
assert.match(targetSource, /isGeneratedEventOccurrence/);
assert.match(targetSource, /occurrence\?\.status === "cancelled"/);

const inviteSource = actionsSource.match(
    /export async function inviteUsersToEventOccurrenceAction[\s\S]*?\n}\n\nexport async function getEventOccurrenceInviteesAction/,
)?.[0];
assert.ok(inviteSource);
assert.match(inviteSource, /getAuthenticatedUserDid\(\)/);
assert.match(inviteSource, /getEligibleInviteCandidatesForCircle/);
assert.match(inviteSource, /insertEventOccurrenceInvitation/);
assert.match(inviteSource, /if \(!result\.inserted\)/);
assert.match(inviteSource, /notifyEventOccurrenceInvitation/);
assert.doesNotMatch(inviteSource, /inviteExternalUserToEventAction/);

const inviteeReadSource = actionsSource.match(
    /export async function getEventOccurrenceInviteesAction[\s\S]*?\n}\n\n\/\*\*/,
)?.[0];
assert.ok(inviteeReadSource);
assert.match(inviteeReadSource, /isRouteCircleEventHost/, "the invitee-list read preserves route-host validation");
assert.match(
    inviteeReadSource,
    /if \(!\(await canManageEvent\(userDid, event\)\)\) \{[\s\S]*?return \{ rows: \[\] \}/,
    "ordinary authenticated viewers receive no occurrence invitee rows",
);
assert.match(
    inviteeReadSource,
    /canManageEvent\(userDid, event\)[\s\S]*EventInvitations\.find/,
    "a manager reaches the combined invitee-list query",
);

const eventDataSource = readFileSync("src/lib/data/event.ts", "utf8");
const manageSource = eventDataSource.match(/export async function canManageEvent[\s\S]*?\n}/)?.[0];
assert.ok(manageSource);
assert.match(manageSource, /event\.createdBy === userDid[\s\S]*return true/, "the creator may invite");
assert.match(manageSource, /features\.events\.review/, "a reviewer in a host may invite");
assert.match(manageSource, /features\.events\.moderate/, "a moderator in a host may invite");
assert.match(manageSource, /checks\.some\(Boolean\)/, "one host management permission is sufficient");
assert.match(
    eventDataSource,
    /recurringInstance[\s\S]*EventOccurrenceInvitations\.findOne\([\s\S]*seriesId:[\s\S]*occurrenceKey:[\s\S]*userDid/,
    "private visibility checks the exact occurrence identity and invitee",
);
assert.match(
    eventDataSource,
    /const occurrenceInvitation = recurringInstance\s*\?[\s\S]*?: null/,
    "base series routes do not use occurrence invitations",
);
assert.match(eventDataSource, /EventOccurrenceInvitations\.deleteMany\(\{ seriesId: eventId \}\)/);

const notificationSource = readFileSync("src/lib/data/notifications.ts", "utf8");
assert.match(notificationSource, /notifyEventOccurrenceInvitation/);
assert.match(notificationSource, /eventId: occurrenceId/);
assert.match(notificationSource, /invitationMessage/);

const detailSource = readFileSync("src/components/modules/events/event-detail.tsx", "utf8");
assert.match(detailSource, />Invite to this meeting</);
assert.match(detailSource, /event\.stage === "open"[\s\S]*isRecurringOccurrence[\s\S]*!isOccurrenceCancelled/);
assert.match(detailSource, /OccurrenceInviteeList/);
assert.match(
    detailSource,
    /isRecurringOccurrence && canInvite \?[\s\S]*<OccurrenceInviteeList/,
    "the occurrence invitee list renders only behind the management gate",
);
assert.match(
    detailSource,
    /isRecurringOccurrence && event\.occurrenceInvitationMessage/,
    "an invitee's own occurrence message remains independent of the management gate",
);

console.log("event occurrence invitation tests passed");
