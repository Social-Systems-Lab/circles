import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Event } from "@/models/models";
import { withEventIcsRouteOverrides } from "@/lib/data/ics-route-test-dependencies";
import { GET } from "./route";

const memberDid = "did:example:member";
const outsiderDid = "did:example:outsider";
const ids = {
    route: new ObjectId(),
    public: new ObjectId(),
    secret: new ObjectId(),
    secretTwo: new ObjectId(),
    paused: new ObjectId(),
    suspended: new ObjectId(),
    removed: new ObjectId(),
    missing: new ObjectId(),
};
const circle = (id: ObjectId, fields: Partial<Circle> = {}): Circle =>
    ({
        _id: id,
        circleType: "circle",
        name: "Route Circle",
        handle: "route-circle",
        visibility: "public",
        moderationStatus: "active",
        ...fields,
    }) as Circle;
const circles = [
    circle(ids.route),
    circle(ids.public),
    circle(ids.secret, { visibility: "secret" }),
    circle(ids.secretTwo, { visibility: "secret" }),
    circle(ids.paused, { visibility: "secret", moderationStatus: "paused" }),
    circle(ids.suspended, { moderationStatus: "suspended" }),
    circle(ids.removed, { moderationStatus: "removed" }),
];
const event = (fields: Partial<Event> = {}): Event =>
    ({
        _id: new ObjectId(),
        circleId: String(ids.route),
        hostCircleIds: [],
        title: "Authorized Event",
        description: "Expected description",
        stage: "open",
        visibility: "public",
        createdBy: "did:example:creator",
        startAt: new Date("2030-01-01T10:00:00Z"),
        endAt: new Date("2030-01-01T11:00:00Z"),
        virtualUrl: "https://meet.example/allowed",
        ...fields,
    }) as Event;

async function invoke(
    candidate: Event | null,
    viewerDid?: string,
    routeId = ids.route,
    eventId = String(candidate?._id),
    memberHostIds: string[] = [],
    entitledIds: string[] = [],
) {
    const routeCircle = circles.find((item) => String(item._id) === String(routeId)) || circle(routeId);
    return withEventIcsRouteOverrides(
        {
            authenticate: async () => viewerDid,
            findCircle: async () => routeCircle,
            findEvent: async () => candidate,
            contentPolicyDependencies: {
                findCircles: async (wanted) =>
                    circles.filter((item) => wanted.some((id) => id.equals(item._id as ObjectId))),
                findMemberships: async (did, wanted) =>
                    memberHostIds.filter((id) => wanted.includes(id)).map((circleId) => ({ userDid: did, circleId })),
                findPrivateEntitledEventIds: async (_did, wanted) => entitledIds.filter((id) => wanted.includes(id)),
            },
        },
        () =>
            GET(new Request(`https://kamooni.test/circles/route-circle/events/${eventId}/ics`), {
                params: Promise.resolve({ handle: "route-circle", eventId }),
            }),
    );
}

const snapshot = async (response: Response) => ({
    status: response.status,
    body: await response.text(),
    cache: response.headers.get("cache-control"),
});

async function main() {
    const publicEvent = event();
    const publicResponse = await invoke(publicEvent);
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get("cache-control"), "private, no-store");
    const publicBody = await publicResponse.text();
    assert.match(publicBody, /BEGIN:VCALENDAR/);
    assert.match(publicBody, /SUMMARY:Authorized Event/);
    assert.match(publicBody, /DESCRIPTION:Expected description/);
    assert.match(publicBody, /https:\/\/meet\.example\/allowed/);
    assert.doesNotMatch(publicBody, /attendee|rsvp|organizer|rrule/i);

    const secret = event({ circleId: String(ids.secret) });
    const neutral = await snapshot(await invoke(secret));
    assert.deepEqual(neutral, { status: 404, body: "Not found", cache: "private, no-store" });
    for (const response of [
        await invoke(secret, outsiderDid),
        await invoke(secret, "did:example:superadmin"),
        await invoke(event({ hostCircleIds: [String(ids.secret)] }), outsiderDid),
        await invoke(
            event({ circleId: String(ids.secret), hostCircleIds: [String(ids.secretTwo)] }),
            memberDid,
            ids.secret,
            undefined,
            [String(ids.secret)],
        ),
        await invoke(event({ hostCircleIds: "malformed" as never }), memberDid),
        await invoke(event({ circleId: String(ids.missing) }), memberDid, ids.missing),
        await invoke(event({ circleId: String(ids.suspended) }), memberDid, ids.suspended),
        await invoke(event({ circleId: String(ids.removed) }), memberDid, ids.removed),
        await invoke(event({ visibility: "private" }), memberDid),
        await invoke(
            event({ circleId: String(ids.secret), visibility: "private" }),
            outsiderDid,
            ids.secret,
            undefined,
            [],
            [],
        ),
        await invoke(publicEvent, undefined, ids.public),
        await invoke(publicEvent, undefined, ids.route, "malformed"),
    ]) {
        assert.deepEqual(await snapshot(response), neutral);
    }
    assert.deepEqual(
        await snapshot(await invoke(null, undefined, ids.route, String(new ObjectId()))),
        neutral,
        "a valid but nonexistent Event ID is neutral",
    );

    assert.equal((await invoke(secret, memberDid, ids.secret, undefined, [String(ids.secret)])).status, 200);
    const allSecret = event({ circleId: String(ids.secret), hostCircleIds: [String(ids.secretTwo)] });
    assert.equal(
        (await invoke(allSecret, memberDid, ids.secret, undefined, [String(ids.secret), String(ids.secretTwo)])).status,
        200,
    );
    assert.equal(
        (await invoke(event({ circleId: String(ids.paused) }), memberDid, ids.paused, undefined, [String(ids.paused)]))
            .status,
        200,
    );
    const privateEvent = event({ visibility: "private" });
    assert.equal(
        (await invoke(privateEvent, memberDid, ids.route, undefined, [], [String(privateEvent._id)])).status,
        200,
    );
    const privateSecret = event({ circleId: String(ids.secret), visibility: "private" });
    assert.equal(
        (await invoke(privateSecret, outsiderDid, ids.secret, undefined, [], [String(privateSecret._id)])).status,
        404,
        "private entitlement cannot replace Secret membership",
    );

    const syntheticId = `${String(publicEvent._id)}:1893456000000`;
    assert.deepEqual(
        await snapshot(await invoke(publicEvent, undefined, ids.route, syntheticId)),
        neutral,
        "ICS rejects occurrence IDs before persistence lookup",
    );
    assert.doesNotMatch(neutral.body, /Route Circle|route-circle|Authorized Event|VCALENDAR/);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
