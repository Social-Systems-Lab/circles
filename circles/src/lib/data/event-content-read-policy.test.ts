import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { canReadCircleContent, canReadEventContent, filterEventsByContentReadPolicy } from "./event-host-read-policy";

const did = "did:example:member";
const outsider = "did:example:outsider";
const ids = {
    public: new ObjectId(),
    secret: new ObjectId(),
    secretTwo: new ObjectId(),
    paused: new ObjectId(),
    suspended: new ObjectId(),
    removed: new ObjectId(),
    missing: new ObjectId(),
};
const circles: any[] = [
    { _id: ids.public, circleType: "circle", visibility: "public", moderationStatus: "active" },
    { _id: ids.secret, circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: ids.secretTwo, circleType: "circle", visibility: "secret", moderationStatus: "active" },
    { _id: ids.paused, circleType: "circle", visibility: "secret", moderationStatus: "paused" },
    { _id: ids.suspended, circleType: "circle", visibility: "public", moderationStatus: "suspended" },
    { _id: ids.removed, circleType: "circle", visibility: "public", moderationStatus: "removed" },
];
const memberships = new Map<string, string[]>([[did, [ids.secret, ids.secretTwo, ids.paused].map(String)]]);
const entitled = new Map<string, string[]>();
const deps = {
    findCircles: async (wanted: ObjectId[]) => circles.filter((circle) => wanted.some((id) => id.equals(circle._id))),
    findMemberships: async (viewerDid: string, wanted: string[]) =>
        (memberships.get(viewerDid) || [])
            .filter((id) => wanted.includes(id))
            .map((circleId) => ({ userDid: viewerDid, circleId })),
    findPrivateEntitledEventIds: async (viewerDid: string, wanted: string[]) =>
        (entitled.get(viewerDid) || []).filter((id) => wanted.includes(id)),
};
const event = (circleId: unknown, fields: Record<string, unknown> = {}) =>
    ({
        _id: new ObjectId(),
        circleId,
        hostCircleIds: undefined,
        visibility: "public",
        createdBy: "did:example:creator",
        stage: "open",
        title: "Event",
        startAt: new Date(),
        endAt: new Date(),
        ...fields,
    }) as any;

async function main() {
    const publicEvent = event(String(ids.public));
    assert.equal(await canReadEventContent(publicEvent, {}, deps), true, "public unauthenticated");
    const secret = event(String(ids.secret));
    assert.equal(await canReadEventContent(secret, {}, deps), false, "Secret unauthenticated");
    assert.equal(await canReadEventContent(secret, { viewerDid: outsider }, deps), false, "Secret outsider/superadmin");
    assert.equal(await canReadEventContent(secret, { viewerDid: did }, deps), true, "canonical member");
    const mixed = event(String(ids.public), { hostCircleIds: [String(ids.secret)] });
    assert.equal(await canReadEventContent(mixed, { viewerDid: outsider }, deps), false, "mixed host outsider");
    const multiple = event(String(ids.secret), { hostCircleIds: [String(ids.secretTwo)] });
    assert.equal(await canReadEventContent(multiple, { viewerDid: did }, deps), true, "all Secret memberships");
    memberships.set("did:one", [String(ids.secret)]);
    assert.equal(
        await canReadEventContent(multiple, { viewerDid: "did:one" }, deps),
        false,
        "one membership insufficient",
    );
    assert.equal(
        await canReadEventContent(
            event(String(ids.secret), { hostCircleIds: [String(ids.secret), String(ids.secret)] }),
            { viewerDid: did },
            deps,
        ),
        true,
        "duplicates harmless",
    );
    for (const denied of [
        event(String(ids.public), { hostCircleIds: "bad" }),
        event(String(ids.public), { hostCircleIds: ["bad"] }),
        event(String(ids.missing)),
        event(String(ids.suspended)),
        event(String(ids.removed)),
    ])
        assert.equal(await canReadEventContent(denied, { viewerDid: did }, deps), false);
    assert.equal(
        await canReadEventContent(event(String(ids.paused)), { viewerDid: did }, deps),
        true,
        "paused readable",
    );

    const privateEvent = event(String(ids.public), { visibility: "private" });
    assert.equal(await canReadEventContent(privateEvent, { viewerDid: did }, deps), false, "private denied");
    entitled.set(did, [String(privateEvent._id)]);
    assert.equal(await canReadEventContent(privateEvent, { viewerDid: did }, deps), true, "private entitlement");
    const privateSecret = event(String(ids.secret), { visibility: "private" });
    entitled.set(outsider, [String(privateSecret._id)]);
    assert.equal(
        await canReadEventContent(privateSecret, { viewerDid: outsider }, deps),
        false,
        "private entitlement additive",
    );
    assert.equal(
        await canReadEventContent(publicEvent, { routeHostId: String(ids.secret) }, deps),
        false,
        "wrong route host",
    );
    assert.equal(await canReadEventContent({ ...publicEvent, stage: "draft" }, { requiredStage: "open" }, deps), false);
    const visible = await filterEventsByContentReadPolicy(
        [publicEvent, mixed, privateEvent],
        { viewerDid: outsider },
        deps,
    );
    assert.deepEqual(
        visible.map((item) => item._id),
        [publicEvent._id],
        "feed omits unreadable candidates",
    );

    assert.equal(await canReadCircleContent(circles[0], undefined, deps), true, "public feed");
    assert.equal(await canReadCircleContent(circles[1], undefined, deps), false, "Secret feed unauthenticated");
    assert.equal(await canReadCircleContent(circles[1], outsider, deps), false, "Secret feed outsider");
    assert.equal(await canReadCircleContent(circles[1], did, deps), true, "Secret feed member");
    assert.equal(await canReadCircleContent(circles[4], did, deps), false, "suspended feed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
