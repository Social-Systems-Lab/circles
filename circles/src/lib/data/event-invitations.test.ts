import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Bun's mock API is available when run with bun test.
import { afterEach, beforeEach, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { validateInternalLoginRedirect } from "@/lib/auth/post-login-navigation";
import { middleware } from "@/middleware";
import { formatEventOccurrenceId } from "@/lib/event-occurrence";
import type { Circle, EventDisplay, EventInvitation, EventOccurrenceInvitation, UserPrivate } from "@/models/models";
import { canReadEventContent } from "./event-host-read-policy";
import type { EmailOptions } from "./email";

const circleId = new ObjectId().toString();
const secretHostId = new ObjectId().toString();
const eventId = new ObjectId().toString();
const startAt = new Date(Date.now() + 86_400_000);
const occurrenceStart = new Date(startAt.getTime() + 86_400_000);
const occurrenceId = formatEventOccurrenceId(eventId, occurrenceStart);
const recipient = {
    did: "did:example:recipient",
    email: "member@example.invalid",
    isEmailVerified: true,
    circleType: "user",
} as UserPrivate;
const userDid = recipient.did!;
const publicHost = { _id: circleId, circleType: "circle", handle: "public-host", enabledModules: ["events"] } as Circle;
const secretHost = { ...publicHost, _id: secretHostId, handle: "secret-host", visibility: "secret" } as Circle;
const makeEvent = (): EventDisplay => ({
    _id: eventId,
    circleId,
    title: "Park cleanup",
    description: "Bring gloves",
    createdBy: "did:example:organiser",
    createdAt: new Date(),
    stage: "open",
    visibility: "public",
    userGroups: [],
    startAt,
    endAt: new Date(startAt.getTime() + 3_600_000),
    location: { precision: 1, street: "1 Park Road", city: "Cape Town" },
    author: { name: "Alex", circleType: "user" },
    circle: publicHost,
});

let event: EventDisplay;
let invitations: EventInvitation[];
let occurrences: EventOccurrenceInvitation[];
let mail: EmailOptions[];
let failDelivery: boolean;
let secretMember: boolean;
let routePermitted: boolean;
let blockedHostId: string | undefined;
let occurrenceRsvp: boolean;

mock.module("./db", () => ({
    EventInvitations: {
        findOne: async ({ eventId, userDid }: Pick<EventInvitation, "eventId" | "userDid">) =>
            invitations.find((invite) => invite.eventId === eventId && invite.userDid === userDid),
        find: ({ userDid }: { userDid: string }) => ({
            toArray: async () => invitations.filter((invite) => invite.userDid === userDid),
        }),
        updateOne: async ({ _id }: { _id: ObjectId }, { $setOnInsert }: { $setOnInsert: EventInvitation }) => {
            if (invitations.some((invite) => String(invite._id) === String(_id))) return { upsertedCount: 0 };
            invitations.push({ ...$setOnInsert, _id });
            return { upsertedCount: 1 };
        },
    },
    EventOccurrenceInvitations: {
        find: ({ userDid }: { userDid: string }) => ({
            toArray: async () => occurrences.filter((invite) => invite.userDid === userDid),
        }),
    },
    EventOccurrenceRsvps: { findOne: async () => (occurrenceRsvp ? { status: "none" } : null) },
}));
mock.module("@/lib/auth/auth", () => ({
    isAuthorized: async (_did: string, hostId: string) => routePermitted && hostId !== blockedHostId,
}));
mock.module("./circle", () => ({
    getCircleById: async (id: string) => (id === circleId ? publicHost : secretHost),
    isCirclePublished: () => true,
}));
mock.module("./member", () => ({ getMember: async () => null }));
mock.module("./email", () => ({
    sendEmail: async (options: EmailOptions) => {
        mail.push(options);
        if (failDelivery) throw new Error("test transport unavailable");
    },
}));
mock.module("./event", () => ({
    normalizeEventHostCircleIds: (event: EventDisplay) => [event.circleId, ...(event.hostCircleIds ?? [])],
    getEventById: async (id: string, viewerDid: string) => {
        if (id !== eventId && id !== occurrenceId) return null;
        const occurrence = id === occurrenceId;
        const occurrenceEntitlement = occurrence && occurrences.some((invite) => invite.userDid === viewerDid);
        const allowed = await canReadEventContent(
            event,
            { viewerDid, preEntitledPrivateEventIds: occurrenceEntitlement ? [eventId] : [] },
            {
                findCircles: async (ids) =>
                    [publicHost, secretHost].filter((host) => ids.some((id) => String(id) === host._id)),
                findMemberships: async () => (secretMember ? [{ userDid, circleId: secretHostId }] : []),
                findPrivateEntitledEventIds: async () =>
                    invitations.filter((invite) => invite.userDid === viewerDid).map((invite) => invite.eventId),
            },
        );
        if (!allowed) return null;
        return occurrence
            ? {
                  ...event,
                  seriesId: eventId,
                  occurrenceKey: occurrenceStart.getTime(),
                  startAt: occurrenceStart,
                  endAt: new Date(occurrenceStart.getTime() + 3_600_000),
              }
            : event;
    },
}));

const { emailNewEventInvitation, insertEventInvitation, listPendingEventInvitations } = await import(
    "./event-invitations"
);

const previousOrigin = process.env.CIRCLES_URL;
beforeEach(() => {
    process.env.CIRCLES_URL = "https://kamooni.example.invalid";
    event = makeEvent();
    invitations = [];
    occurrences = [];
    mail = [];
    failDelivery = false;
    secretMember = false;
    routePermitted = true;
    blockedHostId = undefined;
    occurrenceRsvp = false;
});
afterEach(() => {
    if (previousOrigin === undefined) delete process.env.CIRCLES_URL;
    else process.env.CIRCLES_URL = previousOrigin;
});

async function invite() {
    const inserted = await insertEventInvitation(eventId, circleId, userDid);
    if (inserted) await emailNewEventInvitation(eventId, circleId, recipient);
    return inserted;
}

test("concurrent invitations persist one pending record and attempt one email", async () => {
    assert.deepEqual((await Promise.all([invite(), invite(), invite()])).sort(), [false, false, true]);
    assert.equal(invitations.length, 1);
    assert.equal(mail.length, 1);
    const [{ to, templateAlias, templateModel }] = mail;
    assert.equal(to, recipient.email);
    assert.equal(templateAlias, "event-invitation");
    assert.equal(templateModel.title, event.title);
    assert.match(templateModel.when, /UTC$/);
    assert.equal(templateModel.location, "1 Park Road, Cape Town");
    assert.equal(
        templateModel.actionUrl,
        `https://kamooni.example.invalid/circles/public-host/events/${eventId}?respond=1#event-rsvp`,
    );
});

test("delivery failure leaves an invitation in the Toolbox and does not retry on a duplicate", async () => {
    failDelivery = true;
    assert.equal(await invite(), true);
    assert.equal(await invite(), false);
    assert.equal(mail.length, 1);
    assert.deepEqual(await listPendingEventInvitations(userDid), [
        {
            id: eventId,
            href: `/circles/public-host/events/${eventId}#event-rsvp`,
            title: event.title,
            startAt,
            allDay: undefined,
            organiser: "Alex",
        },
    ]);
    assert.deepEqual(await listPendingEventInvitations("did:example:someone-else"), []);
});

test("accepted and declined legacy invitations are neither re-emailed nor displayed as pending", async () => {
    for (const status of ["accepted", "declined"] as const) {
        invitations = [
            { _id: new ObjectId(), eventId, circleId, userDid, status, createdAt: new Date(), updatedAt: new Date() },
        ];
        assert.equal(await invite(), false);
        assert.deepEqual(await listPendingEventInvitations(userDid), []);
    }
    assert.equal(mail.length, 0);
});

test("unverified addresses and members who already RSVP'd are skipped by the email sender", async () => {
    assert.equal(await insertEventInvitation(eventId, circleId, userDid), true);
    await emailNewEventInvitation(eventId, circleId, { ...recipient, isEmailVerified: false });
    assert.equal(mail.length, 0);
    assert.equal((await listPendingEventInvitations(userDid)).length, 1);

    event.userRsvpStatus = "interested";
    await emailNewEventInvitation(eventId, circleId, recipient);
    assert.equal(mail.length, 0);
    assert.deepEqual(await listPendingEventInvitations(userDid), []);
});

test("private event invitees can see the event only while they can read every host and open the RSVP route", async () => {
    event.visibility = "private";
    event.hostCircleIds = [secretHostId];
    assert.equal(await invite(), true);
    assert.equal(mail.length, 0, "the secret co-host bars delivery");
    assert.deepEqual(await listPendingEventInvitations(userDid), []);

    secretMember = true;
    routePermitted = false;
    assert.deepEqual(await listPendingEventInvitations(userDid), []);
    routePermitted = true;
    blockedHostId = circleId;
    await emailNewEventInvitation(eventId, circleId, recipient);
    assert.equal(mail.length, 1);
    assert.equal(
        mail[0].templateModel.actionUrl,
        `https://kamooni.example.invalid/circles/secret-host/events/${eventId}?respond=1#event-rsvp`,
    );
    assert.equal((await listPendingEventInvitations(userDid))[0]?.href, `/circles/secret-host/events/${eventId}#event-rsvp`);
    secretMember = false;
    assert.deepEqual(await listPendingEventInvitations(userDid), []);
});

test("authorized private invitations email once and disappear as soon as an existing RSVP is recorded", async () => {
    event.visibility = "private";
    assert.equal(await invite(), true);
    assert.equal(mail.length, 1);
    assert.equal((await listPendingEventInvitations(userDid)).length, 1);
    for (const status of ["going", "interested", "cancelled"] as const) {
        event.userRsvpStatus = status;
        assert.deepEqual(await listPendingEventInvitations(userDid), []);
    }
    assert.equal(await invite(), false);
    assert.equal(mail.length, 1);
});

test("invites to private occurrences use the meeting date and lose pending visibility on an RSVP", async () => {
    event.visibility = "private";
    const now = new Date();
    occurrences.push({
        seriesId: eventId,
        occurrenceKey: occurrenceStart.getTime(),
        userDid,
        circleId,
        invitedBy: event.createdBy,
        createdAt: now,
        updatedAt: now,
        sentAt: now,
    });
    await emailNewEventInvitation(occurrenceId, circleId, recipient);
    assert.equal(mail.length, 1);
    assert.match(mail[0].templateModel.actionUrl, new RegExp(`/events/${occurrenceId}\\?respond=1`));
    assert.deepEqual(
        (await listPendingEventInvitations(userDid)).map(({ id, startAt }) => [id, startAt]),
        [[occurrenceId, occurrenceStart]],
    );
    occurrenceRsvp = true;
    assert.deepEqual(await listPendingEventInvitations(userDid), []);
});

test("draft, review and cancelled events are excluded even when the invitee can read them", async () => {
    assert.equal(await insertEventInvitation(eventId, circleId, userDid), true);
    for (const stage of ["draft", "review", "cancelled"] as const) {
        event.stage = stage;
        await emailNewEventInvitation(eventId, circleId, recipient);
        assert.deepEqual(await listPendingEventInvitations(userDid), []);
    }
    assert.equal(mail.length, 0);
});

test("signed-out email invitees return to the RSVP controls after login", async () => {
    const destination = `/circles/secret-host/events/${occurrenceId}?respond=1#event-rsvp`;
    const request = new NextRequest(new URL(destination, "https://kamooni.example.invalid"));
    const response = await middleware(request);
    assert.equal(response?.status, 307);
    const loginUrl = new URL(response!.headers.get("location")!);
    assert.equal(loginUrl.pathname, "/login");
    assert.equal(validateInternalLoginRedirect(loginUrl.searchParams.get("redirectTo")), destination);
});

test("Toolbox links to the existing RSVP controls and omits pending identities from the timeline", () => {
    const source = readFileSync("src/components/layout/user-toolbox.tsx", "utf8");
    assert.match(source, /Awaiting response/);
    assert.match(source, /href=\{invitation.href\}/);
    assert.match(source, /!pendingIds.has\(event.occurrenceId \?\? String\(event._id\)\)/);
    assert.match(source, /events=\{timelineEvents\}/);
    const detail = readFileSync("src/components/modules/events/event-detail.tsx", "utf8");
    assert.match(detail, /id="event-rsvp"[\s\S]*renderRsvpControls\(\)/);
    const controls = detail.match(/const renderRsvpControls = \(\) => \{[\s\S]*?if \(!isRecurringOccurrence\)/)?.[0];
    assert.ok(controls);
    assert.match(controls, /if \(hasInvitation\)/);
    assert.match(controls, /\["going", "Attending", onGoing\]/);
    assert.match(controls, /\["interested", "Interested", \(\) => onRsvp\("interested"\)\]/);
    assert.match(controls, /\["cancelled", "Not interested", onCancelRsvp\]/);
    assert.match(controls, /aria-pressed=\{selected === status\}/);
});
