import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, EventDisplay } from "@/models/models";
import { formatEventOccurrenceId } from "@/lib/event-occurrence";
import { canReadEventContent } from "./event-host-read-policy";
import { getEventById, type SingleEventReadDependencies } from "./event";
import { getEventActionWithDependencies } from "@/app/circles/[handle]/events/actions";

const memberDid = "did:example:member";
const outsiderDid = "did:example:outsider";
const ids = {
    route: new ObjectId(),
    secret: new ObjectId(),
    secretTwo: new ObjectId(),
    suspended: new ObjectId(),
    removed: new ObjectId(),
    missing: new ObjectId(),
};
const circles: Circle[] = [
    {
        _id: ids.route,
        circleType: "circle",
        visibility: "public",
        moderationStatus: "active",
        handle: "route",
    } as Circle,
    { _id: ids.secret, circleType: "circle", visibility: "secret", moderationStatus: "active" } as Circle,
    { _id: ids.secretTwo, circleType: "circle", visibility: "secret", moderationStatus: "active" } as Circle,
    { _id: ids.suspended, circleType: "circle", visibility: "public", moderationStatus: "suspended" } as Circle,
    { _id: ids.removed, circleType: "circle", visibility: "public", moderationStatus: "removed" } as Circle,
];
const makeEvent = (fields: Partial<EventDisplay> = {}): EventDisplay =>
    ({
        _id: String(new ObjectId()),
        circleId: String(ids.route),
        hostCircleIds: [],
        title: "Google-safe title",
        description: "Google-safe description",
        stage: "open",
        visibility: "public",
        createdBy: "did:example:creator",
        startAt: new Date("2030-01-01T10:00:00Z"),
        endAt: new Date("2030-01-01T11:00:00Z"),
        virtualUrl: "https://meet.example/safe",
        circle: { _id: String(ids.route), handle: "route", circleType: "circle" } as Circle,
        author: {} as Circle,
        attendees: 0,
        userRsvpStatus: "none",
        ...fields,
    }) as EventDisplay;

function reader(
    candidate: EventDisplay,
    viewerDid: string,
    options: {
        memberHostIds?: string[];
        entitledIds?: string[];
        occurrenceReads?: { count: number };
        occurrenceInvitation?: boolean;
    } = {},
): SingleEventReadDependencies {
    const policyDependencies = {
        findCircles: async (wanted: ObjectId[]) =>
            circles.filter((item) => wanted.some((id) => id.equals(new ObjectId(String(item._id))))),
        findMemberships: async (did: string, wanted: string[]) =>
            (options.memberHostIds || [])
                .filter((id) => wanted.includes(id))
                .map((circleId) => ({ userDid: did, circleId })),
        findPrivateEntitledEventIds: async (_did: string, wanted: string[]) =>
            (options.entitledIds || []).filter((id) => wanted.includes(id)),
    };
    return {
        findOccurrenceInvitation: async () => (options.occurrenceInvitation ? ({ message: "invited" } as never) : null),
        aggregateEvent: async () => [candidate],
        canReadContent: (event, did, occurrenceInvitationEntitled) =>
            canReadEventContent(
                event,
                {
                    viewerDid: did,
                    preEntitledPrivateEventIds: occurrenceInvitationEntitled ? [String(event._id)] : [],
                },
                policyDependencies,
            ),
        canManageUnpublished: async () => false,
        findOccurrence: async () => {
            if (options.occurrenceReads) options.occurrenceReads.count += 1;
            return null;
        },
        findOccurrenceRsvps: async () => {
            if (options.occurrenceReads) options.occurrenceReads.count += 1;
            return [];
        },
    };
}

async function throughAction(candidate: EventDisplay, viewerDid: string, options: Parameters<typeof reader>[2] = {}) {
    return getEventActionWithDependencies("route", String(candidate._id), {
        authenticate: async () => viewerDid,
        findCircle: async () => circles[0],
        authorizeView: async () => true,
        findEvent: (eventId, did) => getEventById(eventId, did, reader(candidate, viewerDid, options)),
    });
}

async function main() {
    const publicEvent = makeEvent();
    const returned = await throughAction(publicEvent, outsiderDid);
    assert.equal(returned?.title, "Google-safe title");
    assert.equal(
        returned?.virtualUrl,
        "https://meet.example/safe",
        "authorized Google presentation fields remain intact",
    );

    const mixed = makeEvent({ hostCircleIds: [String(ids.secret)] });
    assert.equal(await throughAction(mixed, outsiderDid), null);
    assert.equal(await throughAction(mixed, "did:example:superadmin"), null);
    const twoSecret = makeEvent({ hostCircleIds: [String(ids.secret), String(ids.secretTwo)] });
    assert.ok(
        await throughAction(twoSecret, memberDid, { memberHostIds: [String(ids.secret), String(ids.secretTwo)] }),
    );
    assert.equal(await throughAction(twoSecret, memberDid, { memberHostIds: [String(ids.secret)] }), null);

    const privateEvent = makeEvent({ visibility: "private" });
    assert.equal(await throughAction(privateEvent, memberDid), null);
    assert.ok(await throughAction(privateEvent, memberDid, { entitledIds: [String(privateEvent._id)] }));
    const privateSecret = makeEvent({ hostCircleIds: [String(ids.secret)], visibility: "private" });
    assert.equal(await throughAction(privateSecret, outsiderDid, { entitledIds: [String(privateSecret._id)] }), null);

    for (const denied of [
        makeEvent({ hostCircleIds: "malformed" as never }),
        makeEvent({ hostCircleIds: [String(ids.missing)] }),
        makeEvent({ hostCircleIds: [String(ids.suspended)] }),
        makeEvent({ hostCircleIds: [String(ids.removed)] }),
    ])
        assert.equal(await throughAction(denied, memberDid), null);

    const deniedGoogleEvent = await throughAction(mixed, outsiderDid);
    assert.equal(deniedGoogleEvent, null, "no EventDisplay exists from which browser Google fields could be built");

    const recurring = makeEvent({ recurrence: { frequency: "daily", interval: 1 } });
    const occurrenceId = formatEventOccurrenceId(String(recurring._id), new Date("2030-01-02T10:00:00Z"));
    const occurrenceReads = { count: 0 };
    const deniedOccurrence = await getEventById(
        occurrenceId,
        outsiderDid,
        reader({ ...recurring, hostCircleIds: [String(ids.secret)] }, outsiderDid, { occurrenceReads }),
    );
    assert.equal(deniedOccurrence, null);
    assert.equal(occurrenceReads.count, 0, "canonical series host authorization precedes occurrence expansion reads");

    const privateRecurring = { ...recurring, visibility: "private" as const };
    assert.ok(
        await getEventById(
            occurrenceId,
            memberDid,
            reader(privateRecurring, memberDid, { occurrenceInvitation: true }),
        ),
        "existing occurrence invitation remains a private-Event entitlement",
    );
    assert.equal(
        await getEventById(
            occurrenceId,
            outsiderDid,
            reader({ ...privateRecurring, hostCircleIds: [String(ids.secret)] }, outsiderDid, {
                occurrenceInvitation: true,
            }),
        ),
        null,
        "occurrence invitation does not bypass canonical Secret host membership",
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
