import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Event } from "@/models/models";
import { withCircleIcsRouteOverrides } from "@/lib/data/ics-route-test-dependencies";
import { GET } from "./route";

const memberDid = "did:example:member";
const outsiderDid = "did:example:outsider";
const ids = {
    route: new ObjectId(),
    secretRoute: new ObjectId(),
    secret: new ObjectId(),
    paused: new ObjectId(),
    suspended: new ObjectId(),
    removed: new ObjectId(),
    missing: new ObjectId(),
};
const circle = (id: ObjectId, fields: Partial<Circle> = {}): Circle =>
    ({
        _id: id,
        circleType: "circle",
        name: "Protected Circle",
        handle: "protected-circle",
        visibility: "public",
        moderationStatus: "active",
        ...fields,
    }) as Circle;
const circles = [
    circle(ids.route),
    circle(ids.secretRoute, { visibility: "secret" }),
    circle(ids.secret, { visibility: "secret" }),
    circle(ids.paused, { visibility: "secret", moderationStatus: "paused" }),
    circle(ids.suspended, { moderationStatus: "suspended" }),
    circle(ids.removed, { moderationStatus: "removed" }),
];
const event = (title: string, fields: Partial<Event> = {}): Event =>
    ({
        _id: new ObjectId(),
        circleId: String(ids.route),
        hostCircleIds: [],
        title,
        stage: "open",
        visibility: "public",
        createdBy: "did:example:creator",
        startAt: new Date("2030-01-01T10:00:00Z"),
        endAt: new Date("2030-01-01T11:00:00Z"),
        ...fields,
    }) as Event;

async function invoke(options: {
    routeCircle?: Circle | null;
    viewerDid?: string;
    events?: Event[];
    memberHostIds?: string[];
    entitledIds?: string[];
    observedQuery?: { circleId?: string; stage?: string; endingAtOrAfter?: Date; limit?: number };
}) {
    const routeCircle = options.routeCircle === undefined ? circles[0] : options.routeCircle;
    return withCircleIcsRouteOverrides(
        {
            authenticate: async () => options.viewerDid,
            findCircle: async () => routeCircle,
            findEvents: async (circleId, query) => {
                if (options.observedQuery) Object.assign(options.observedQuery, { circleId, ...query });
                return (options.events || []).slice(0, query.limit);
            },
            circlePolicyDependencies: {
                findMemberships: async (did, wanted) =>
                    (options.memberHostIds || [])
                        .filter((id) => wanted.includes(id))
                        .map((circleId) => ({ userDid: did, circleId })),
            },
            contentPolicyDependencies: {
                findCircles: async (wanted) =>
                    circles.filter((item) => wanted.some((id) => id.equals(item._id as ObjectId))),
                findMemberships: async (did, wanted) =>
                    (options.memberHostIds || [])
                        .filter((id) => wanted.includes(id))
                        .map((circleId) => ({ userDid: did, circleId })),
                findPrivateEntitledEventIds: async (_did, wanted) =>
                    (options.entitledIds || []).filter((id) => wanted.includes(id)),
            },
        },
        () =>
            GET(new Request("https://kamooni.test/circles/protected-circle/events/ics"), {
                params: Promise.resolve({ handle: "protected-circle" }),
            }),
    );
}

const snapshot = async (response: Response) => ({
    status: response.status,
    body: await response.text(),
    cache: response.headers.get("cache-control"),
});

async function main() {
    const visible = event("Visible public Event");
    const publicResponse = await invoke({ events: [visible] });
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get("cache-control"), "private, no-store");
    assert.match(await publicResponse.text(), /Visible public Event/);

    const secretRoute = circles[1];
    const neutral = await snapshot(await invoke({ routeCircle: secretRoute }));
    assert.deepEqual(neutral, { status: 404, body: "Not found", cache: "private, no-store" });
    assert.deepEqual(await snapshot(await invoke({ routeCircle: secretRoute, viewerDid: outsiderDid })), neutral);
    for (const unavailableRoute of [circles[4], circles[5]]) {
        assert.deepEqual(
            await snapshot(await invoke({ routeCircle: unavailableRoute, viewerDid: memberDid })),
            neutral,
            "suspended and removed route Circles are neutral",
        );
    }
    const secretRouteEvent = event("Secret route member Event", { circleId: String(ids.secretRoute) });
    const secretMemberResponse = await invoke({
        routeCircle: secretRoute,
        viewerDid: memberDid,
        memberHostIds: [String(ids.secretRoute)],
        events: [secretRouteEvent],
    });
    assert.equal(secretMemberResponse.status, 200);
    assert.match(await secretMemberResponse.text(), /Secret route member Event/);
    assert.doesNotMatch(neutral.body, /VCALENDAR|Protected Circle|protected-circle/);

    const privateEvent = event("Private omitted", { visibility: "private" });
    const mixed = event("Mixed omitted", { hostCircleIds: [String(ids.secret)] });
    const malformed = event("Malformed omitted", { hostCircleIds: "bad" as never });
    const missing = event("Missing omitted", { hostCircleIds: [String(ids.missing)] });
    const suspended = event("Suspended omitted", { hostCircleIds: [String(ids.suspended)] });
    const removed = event("Removed omitted", { hostCircleIds: [String(ids.removed)] });
    const omittedResponse = await invoke({
        viewerDid: outsiderDid,
        events: [visible, privateEvent, mixed, malformed, missing, suspended, removed],
    });
    const omittedBody = await omittedResponse.text();
    assert.match(omittedBody, /Visible public Event/);
    for (const title of [
        "Private omitted",
        "Mixed omitted",
        "Malformed omitted",
        "Missing omitted",
        "Suspended omitted",
        "Removed omitted",
    ])
        assert.doesNotMatch(omittedBody, new RegExp(title));

    const privateSecret = event("Entitled Secret private", {
        hostCircleIds: [String(ids.secret)],
        visibility: "private",
    });
    const paused = event("Paused included", { hostCircleIds: [String(ids.paused)] });
    const entitledResponse = await invoke({
        viewerDid: memberDid,
        events: [privateSecret, paused],
        memberHostIds: [String(ids.secret), String(ids.paused)],
        entitledIds: [String(privateSecret._id)],
    });
    const entitledBody = await entitledResponse.text();
    assert.match(entitledBody, /Entitled Secret private/);
    assert.match(entitledBody, /Paused included/);

    const observedQuery: NonNullable<Parameters<typeof invoke>[0]["observedQuery"]> = {};
    const capped = Array.from({ length: 501 }, (_, index) => event(`Capped-${index}`));
    const capResponse = await invoke({ events: capped, observedQuery });
    assert.equal(
        (await capResponse.text()).match(/BEGIN:VEVENT/g)?.length,
        500,
        "the production handler retains the 500-item cap",
    );
    assert.equal(observedQuery.circleId, String(ids.route));
    assert.equal(observedQuery.stage, "open");
    assert.equal(observedQuery.limit, 500);
    assert.ok(observedQuery.endingAtOrAfter instanceof Date, "the production handler retains upcoming semantics");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
