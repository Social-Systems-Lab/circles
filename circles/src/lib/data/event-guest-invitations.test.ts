import assert from "node:assert/strict";
// @ts-expect-error Bun provides test at runtime; Bun types are not installed.
import { test } from "bun:test";
import { ObjectId, type Collection } from "mongodb";
import type { Event, EventGuestInvitation, EventOccurrence } from "@/models/models";
import { guestInvitationPreviewKey } from "@/lib/event-guest-invitation";
import { handleGuestInvitationRequest, guestInvitationPage } from "@/app/event-invitations/invitation-page";
import { hashToken, type EmailOptions } from "./email";
import {
    accessGuestInvitation,
    consumeGuestEmailQuota,
    listConfirmedGuestNames,
    resolveGuestInvitationTarget,
    sendGuestInvitations,
} from "./event-guest-invitations";

const now = new Date("2030-03-01T00:00:00Z");
const eventId = "64b000000000000000000001";
const secretHost = "64b000000000000000000002";
const otherHost = "64b000000000000000000003";
const organiser = "did:example:organiser";
const origin = "https://staging.kamooni.org";

test("the confirmed roster keeps emails manager-only and scopes them to the exact event or occurrence", async () => {
    const occurrenceKey = Date.parse("2030-03-12T15:00:00Z");
    type Scope = Pick<EventGuestInvitation, "eventId" | "occurrenceKey" | "status">;
    type GuestRow = Scope & Pick<EventGuestInvitation, "displayName" | "email" | "tokenHash">;
    const scope = {
        eventId,
        occurrenceKey: null,
        status: "going" as const,
        email: "private@example.invalid",
        tokenHash: "secret",
    };
    const rows: GuestRow[] = [
        { ...scope, displayName: "  Guest One  " },
        { ...scope, email: "unnamed@example.invalid" },
        { ...scope, displayName: "private@example.invalid" },
        { ...scope, status: "interested", displayName: "Interested Guest" },
        { ...scope, status: "declined", displayName: "Declined Guest" },
        { ...scope, status: "pending", displayName: "Awaiting Guest" },
        { ...scope, occurrenceKey, displayName: "Occurrence Guest" },
        { ...scope, occurrenceKey, email: "this-meeting@example.invalid" },
        { ...scope, occurrenceKey: occurrenceKey + 604_800_000, email: "next-meeting@example.invalid" },
        { ...scope, eventId: otherHost, displayName: "Other Event Guest" },
    ];
    const projections: Record<string, number>[] = [];
    const collection = {
        find: (filter: Scope, options: { projection: Record<string, number> }) => {
            projections.push(options.projection);
            return {
                toArray: async () =>
                    rows
                        .filter(({ eventId, occurrenceKey, status }) =>
                            eventId === filter.eventId && occurrenceKey === filter.occurrenceKey && status === filter.status,
                        )
                        .map(({ displayName, email }) => ({
                            displayName,
                            ...(options.projection.email && { email }),
                        })),
            };
        },
    } as unknown as Collection<EventGuestInvitation>;
    const getCollection = async () => collection;
    assert.deepEqual(await listConfirmedGuestNames(eventId, null, false, getCollection), ["Guest One", "Guest", "Guest"]);
    assert.deepEqual(await listConfirmedGuestNames(eventId, null, true, getCollection), [
        "Guest One", "unnamed@example.invalid", "private@example.invalid",
    ]);
    assert.deepEqual(await listConfirmedGuestNames(eventId, occurrenceKey, false, getCollection), [
        "Occurrence Guest", "Guest",
    ]);
    assert.deepEqual(await listConfirmedGuestNames(eventId, occurrenceKey, true, getCollection), [
        "Occurrence Guest", "this-meeting@example.invalid",
    ]);
    assert.deepEqual(projections, [
        { _id: 0, displayName: 1 },
        { _id: 0, displayName: 1, email: 1 },
        { _id: 0, displayName: 1 },
        { _id: 0, displayName: 1, email: 1 },
    ]);
});

function makeEvent(overrides: Partial<Event> = {}): Event & { _id: ObjectId } {
    return {
        circleId: secretHost,
        title: "Event title",
        description: "Welcome [internal discussion](/circles/secret-circle/feed) https://kamooni.org/circles/hidden",
        startAt: new Date("2030-03-05T15:00:00Z"),
        endAt: new Date("2030-03-05T16:30:00Z"),
        visibility: "private",
        stage: "open",
        createdBy: organiser,
        createdAt: now,
        userGroups: ["secret-member-list"],
        commentPostId: "private-discussion-id",
        isHybrid: true,
        virtualUrl: "https://meet.example.invalid/join",
        location: { street: "5 Park Road", precision: 1 },
        ...overrides,
        _id: new ObjectId(eventId),
    };
}

function setup(overrides: Partial<Event> = {}) {
    let event: ReturnType<typeof makeEvent> | null = makeEvent(overrides);
    const invitations: EventGuestInvitation[] = [];
    const emails: EmailOptions[] = [];
    const occurrences = new Map<number, EventOccurrence>();
    let hostsOpen = true;
    let quotaAvailable = true;
    let providerAvailable = true;
    let consumed = 0;
    const scope = { eventId, occurrenceKey: null, circleId: secretHost };

    // Model only the MongoDB calls used by this feature. The upsert claims the key before yielding.
    const collection = {
        find: (filter: { eventId: string; occurrenceKey: number | null; email: { $in: string[] } }) => ({
            toArray: async () =>
                invitations.filter(
                    (row) =>
                        row.eventId === filter.eventId &&
                        row.occurrenceKey === filter.occurrenceKey &&
                        filter.email.$in.includes(row.email),
                ),
        }),
        findOne: async ({ tokenHash }: { tokenHash: string }) =>
            invitations.find((row) => row.tokenHash === tokenHash) ?? null,
        updateOne: async (
            filter: { eventId?: string; occurrenceKey?: number | null; email?: string; tokenHash?: string },
            change: { $set?: Partial<EventGuestInvitation>; $setOnInsert?: EventGuestInvitation },
        ) => {
            const existing = invitations.find((row) =>
                Object.entries(filter).every(([key, value]) => row[key as keyof EventGuestInvitation] === value),
            );
            if (existing && change.$set) Object.assign(existing, change.$set);
            if (!existing && change.$setOnInsert) invitations.push(change.$setOnInsert);
            return { matchedCount: Number(!!existing), upsertedCount: Number(!existing && !!change.$setOnInsert) };
        },
    } as unknown as Collection<EventGuestInvitation>;

    const resolveTarget: typeof resolveGuestInvitationTarget = (target) =>
        resolveGuestInvitationTarget(target, {
            findEvent: async (id) => (id.toHexString() === eventId ? event : null),
            findOccurrence: async (_id, key) => occurrences.get(key) ?? null,
            hostsAvailable: async (ids) => hostsOpen && ids.every((id) => id === secretHost || id === otherHost),
            now: () => now,
        });
    const access: typeof accessGuestInvitation = (token, response) =>
        accessGuestInvitation(token, response, {
            collection: async () => collection,
            resolveTarget,
            now: () => now,
        });
    return {
        invitations,
        emails,
        occurrences,
        scope,
        resolveTarget,
        disableQuota: () => {
            quotaAvailable = false;
        },
        disableProvider: () => {
            providerAvailable = false;
        },
        disableHosts: () => {
            hostsOpen = false;
        },
        setEvent: (replacement: Partial<Event> | null) => {
            event = replacement ? makeEvent(replacement) : null;
        },
        getConsumed: () => consumed,
        send: async (
            recipients: unknown,
            target: Parameters<typeof sendGuestInvitations>[0] = scope,
            preview?: string,
        ) => {
            const resolved = await resolveTarget(target);
            const key =
                preview ?? (resolved ? guestInvitationPreviewKey({ ...resolved.event, ...resolved.schedule }) : "");
            return sendGuestInvitations(target, organiser, recipients, key, {
                collection: async () => collection,
                resolveTarget,
                reserveQuota: async (actor, count) => {
                    assert.equal(actor, organiser);
                    consumed += count;
                    return quotaAvailable;
                },
                send: async (message) => {
                    emails.push(message);
                    if (!providerAvailable) throw new Error("Delivery unconfirmed");
                },
                now: () => now,
                origin: () => origin,
            });
        },
        request: (token: string, operation: string, response?: string, ignoredTarget?: unknown) =>
            handleGuestInvitationRequest(
                new Request(`${origin}/event-invitations`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, operation, response, ignoredTarget }),
                }),
                access,
            ),
        token: (index = 0) => new URL(emails[index].templateModel.actionUrl).hash.slice(1),
    };
}

test("creates one hashed invitation and email across concurrent submissions and normalized duplicates", async () => {
    const h = setup();
    const results = await Promise.all([
        h.send([" Guest@Example.invalid ", "guest@example.invalid"]),
        h.send(["guest@example.invalid"]),
    ]);
    assert.equal(results.filter((result) => result.success && result.sent === 1).length, 1);
    assert.equal(h.emails.length, 1);
    assert.equal(h.invitations.length, 1);
    const token = h.token();
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(h.invitations[0].tokenHash, hashToken(token));
    assert.equal(h.invitations[0].email, "guest@example.invalid");
    assert.equal(h.invitations[0].status, "pending");
    assert.ok(h.invitations[0].sentAt);
    assert.ok(!JSON.stringify(h.invitations).includes(token));
    const { actionUrl, calendarUrl } = h.emails[0].templateModel;
    assert.equal(actionUrl, `${origin}/event-invitations#${token}`);
    assert.equal(calendarUrl, `${origin}/event-invitations?download=ics#${token}`);
    const consumed = h.getConsumed();
    assert.deepEqual(await h.send(["GUEST@example.invalid"]), {
        success: true,
        sent: 0,
        alreadyInvited: 1,
        unconfirmed: 0,
    });
    assert.equal(h.getConsumed(), consumed);
});

test("validates recipients and bounds sending while keeping an unconfirmed invitation usable", async () => {
    const h = setup();
    assert.equal((await h.send(["guest@example.invalid\nBcc:spy@example.invalid"])).success, false);
    assert.equal((await h.send(Array.from({ length: 11 }, (_, i) => `guest${i}@example.invalid`))).success, false);
    h.disableQuota();
    assert.equal((await h.send(["guest@example.invalid"])).success, false);
    assert.equal(h.invitations.length, 0);
    assert.equal(h.emails.length, 0);

    const failure = setup();
    failure.disableProvider();
    assert.deepEqual(await failure.send(["guest@example.invalid"]), {
        success: true,
        sent: 0,
        alreadyInvited: 0,
        unconfirmed: 1,
    });
    assert.equal(failure.invitations[0].sentAt, undefined);
    assert.equal((await failure.request(failure.token(), "rsvp", "going")).status, 200);
    await failure.send(["guest@example.invalid"]);
    assert.equal(failure.emails.length, 1);
});

test("asks the organiser to review changed details before giving them to a guest", async () => {
    const h = setup();
    const previousPreview = guestInvitationPreviewKey(makeEvent());
    h.setEvent({ title: "Updated title", virtualUrl: `${origin}/circles/secret-circle/feed` });
    assert.equal((await h.send(["guest@example.invalid"], h.scope, previousPreview)).success, false);
    assert.equal(h.getConsumed(), 0);
    assert.equal(h.invitations.length, 0);
    assert.equal((await h.send(["guest@example.invalid"])).success, true);
    const view = await (await h.request(h.token(), "view")).json();
    assert.equal(view.title, "Updated title");
    assert.equal(view.meetingUrl, "");
});

test("uses the existing TTL counter with a separate organiser key and an atomic hourly ceiling", async () => {
    const calls: unknown[][] = [];
    const counter = {
        updateOne: async (...args: unknown[]) => {
            calls.push(args);
            if (calls.length === 2) throw Object.assign(new Error("duplicate key"), { code: 11000 });
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: "slot" };
        },
    };
    assert.equal(await consumeGuestEmailQuota(counter, organiser, 10, now), true);
    assert.equal(await consumeGuestEmailQuota(counter, organiser, 10, now), false);
    assert.deepEqual(calls[0], [
        { _id: `event-guest:${hashToken(organiser)}:${Math.floor(now.getTime() / 3600000)}`, count: { $lte: 20 } },
        { $inc: { count: 10 }, $setOnInsert: { expiresAt: new Date("2030-03-01T01:00:00Z") } },
        { upsert: true },
    ]);
});

test("a signed-out guest can see approved details and change only their own response", async () => {
    const h = setup({ hostCircleIds: [otherHost] });
    await h.send(["one@example.invalid", "two@example.invalid"]);
    const first = h.token(0);
    const second = h.token(1);
    assert.notEqual(first, second);
    const page = await guestInvitationPage().text();
    assert.match(page, /credentials: 'omit'/);
    assert.doesNotMatch(page, /secret-circle|one@example|<script[^>]+src/);
    const view = await h.request(first, "view");
    const details = await view.json();
    assert.equal(view.status, 200);
    assert.equal(view.headers.get("referrer-policy"), "no-referrer");
    assert.equal(view.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Object.keys(details).sort(), ["description", "location", "meetingUrl", "status", "title", "when"]);
    assert.equal(details.status, "pending");
    assert.equal(details.location, "5 Park Road / Online");
    assert.doesNotMatch(
        JSON.stringify(details),
        /secret-circle|\/circles\/|private-discussion-id|secret-member-list|@example/,
    );
    assert.equal((await h.request(first, "rsvp", "going", { token: second })).status, 200);
    assert.equal((await (await h.request(first, "rsvp", "interested")).json()).status, "interested");
    assert.equal((await (await h.request(first, "rsvp", "declined")).json()).status, "declined");
    assert.equal((await (await h.request(second, "view")).json()).status, "pending");
    assert.equal((await h.request(first, "rsvp", "pending")).status, 400);
    assert.equal((await h.request("invalid", "view")).status, 404);
    assert.equal((await h.request("f".repeat(64), "calendar")).status, 404);
    h.disableHosts();
    assert.equal((await h.request(first, "view")).status, 404);
    assert.equal((await h.request(first, "rsvp", "going")).status, 404);
    assert.equal((await h.request(first, "calendar")).status, 404);
});

test("the recurring download and RSVP are scoped to the invited occurrence", async () => {
    const recurrence = { frequency: "weekly" as const, interval: 1 };
    const h = setup({ recurrence });
    assert.equal((await h.send(["guest@example.invalid"])).success, false);
    const firstKey = new Date("2030-03-05T15:00:00Z").getTime();
    const nextKey = new Date("2030-03-12T15:00:00Z").getTime();
    const firstTarget = { ...h.scope, occurrenceKey: firstKey };
    const nextTarget = { ...h.scope, occurrenceKey: nextKey };
    assert.equal((await h.send(["guest@example.invalid"], firstTarget)).success, true);
    assert.equal((await h.send(["guest@example.invalid"], nextTarget)).success, true);
    const next = h.token(1);
    const calendar = await h.request(next, "calendar", undefined, firstTarget);
    assert.equal(calendar.status, 200);
    assert.equal(calendar.headers.get("content-type"), "text/calendar; charset=utf-8");
    assert.equal(calendar.headers.get("content-disposition"), 'attachment; filename="event-title.ics"');
    const ics = (await calendar.text()).replace(/\r\n /g, "");
    assert.match(ics, /DTSTART:20300312T150000Z\r\nDTEND:20300312T163000Z/);
    assert.match(ics, /LOCATION:5 Park Road \/ Online/);
    assert.doesNotMatch(ics, /RRULE|^URL:|secret-circle|\/circles\/|20300305T150000Z/m);
    assert.ok(!ics.includes(next));
    assert.equal((await h.request(next, "rsvp", "going", firstTarget)).status, 200);
    assert.equal(h.invitations[0].status, "pending");
    assert.equal(h.invitations[1].status, "going");

    h.occurrences.set(nextKey, {
        seriesId: eventId,
        occurrenceKey: nextKey,
        originalStartAt: new Date(nextKey),
        status: "cancelled",
        createdAt: now,
        updatedAt: now,
    });
    assert.equal((await h.request(next, "view")).status, 404);
    assert.equal((await h.request(h.token(0), "view")).status, 200);
    h.setEvent({ recurrence: { ...recurrence, count: 1 } });
    h.occurrences.clear();
    assert.equal((await h.request(next, "view")).status, 404);
    h.setEvent(null);
    assert.equal((await h.request(h.token(0), "view")).status, 404);
});
