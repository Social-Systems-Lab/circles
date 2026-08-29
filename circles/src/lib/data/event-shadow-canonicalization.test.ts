import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Event, Feed, Member, Post } from "@/models/models";
import { ensureCanonicalEventShadow, type EventShadowOrchestrationDependencies } from "./event-shadow-orchestration";
import { resolveWritableEventHosts, type EventHostWriteDependencies } from "./event-host-write-policy";
import type { ReadablePostContext } from "./post-access-policy";

const actorDid = "did:example:manager";
const superadmin = { did: "did:example:superadmin", isSuperAdmin: true };
const eventId = new ObjectId();
const circleAId = new ObjectId();
const circleBId = new ObjectId();
const feedAId = new ObjectId();
const feedBId = new ObjectId();
const shadowId = new ObjectId();

const circle = (id: ObjectId, overrides: Partial<Circle> = {}) =>
    ({ _id: id, circleType: "circle", visibility: "public", moderationStatus: "active", ...overrides }) as Circle;
const circleA = circle(circleAId);
const circleB = circle(circleBId);
const feedA = { _id: feedAId, circleId: circleAId.toHexString() } as Feed;
const feedB = { _id: feedBId, circleId: circleBId.toHexString() } as Feed;

const makeEvent = (overrides: Partial<Event> = {}) =>
    ({
        _id: eventId,
        circleId: circleAId.toHexString(),
        hostCircleIds: [circleAId.toHexString()],
        createdBy: actorDid,
        createdAt: new Date(0),
        title: "Canonical event",
        description: "",
        stage: "draft",
        visibility: "public",
        userGroups: [],
        startAt: new Date(0),
        endAt: new Date(1),
        ...overrides,
    }) as Event;

const shadowContext = (
    event: Event,
    overrides: { post?: Partial<Post>; feed?: Feed; circle?: Circle } = {},
): ReadablePostContext => ({
    post: {
        _id: shadowId.toHexString(),
        feedId: feedAId.toHexString(),
        createdBy: actorDid,
        createdAt: new Date(0),
        content: "Event",
        reactions: {},
        comments: 0,
        userGroups: [],
        postType: "event",
        parentItemType: "event",
        parentItemId: String(event._id),
        ...overrides.post,
    } as Post,
    feed: overrides.feed ?? feedA,
    circle: overrides.circle ?? circleA,
});

type Counters = { feedA: number; feedB: number; insertsA: number; insertsB: number; updates: number };

function dependencies({
    event,
    circles = [circleA, circleB],
    members = [],
    existingContext = null,
    canManage = true,
}: {
    event: Event;
    circles?: Circle[];
    members?: string[];
    existingContext?: ReadablePostContext | null;
    canManage?: boolean;
}): { dependencies: EventShadowOrchestrationDependencies; counters: Counters } {
    const counters: Counters = { feedA: 0, feedB: 0, insertsA: 0, insertsB: 0, updates: 0 };
    const hostDependencies: EventHostWriteDependencies = {
        getCircles: async (ids) => circles.filter((candidate) => ids.includes(String(candidate._id))),
        getCanonicalMember: async (did, circleId) =>
            members.includes(`${did}:${circleId}`) ? ({ userDid: did, circleId } as Member) : null,
    };
    return {
        counters,
        dependencies: {
            loadEvent: async () => event,
            resolveHosts: (input, did) => resolveWritableEventHosts(input, did, hostDependencies),
            canManage: async () => canManage,
            resolveShadow: async () => existingContext,
            findPrimaryFeed: async (circleId) => {
                if (circleId === circleAId.toHexString()) {
                    counters.feedA++;
                    return feedA;
                }
                counters.feedB++;
                return feedB;
            },
            createShadow: async (input) => {
                if (input.feedId === feedAId.toHexString()) counters.insertsA++;
                else counters.insertsB++;
                return { ...input, _id: shadowId } as Post;
            },
            updateCommentPostId: async () => {
                counters.updates++;
                return true;
            },
        },
    };
}

async function main() {
    // Circle B is present in dependencies, but the helper has no caller target and derives only primary Circle A.
    const createFixture = dependencies({ event: makeEvent() });
    assert.equal(
        await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, createFixture.dependencies),
        shadowId.toHexString(),
    );
    assert.deepEqual(createFixture.counters, { feedA: 1, feedB: 0, insertsA: 1, insertsB: 0, updates: 1 });

    const validEvent = makeEvent({ commentPostId: shadowId.toHexString() });
    const reuseFixture = dependencies({ event: validEvent, existingContext: shadowContext(validEvent) });
    assert.equal(
        await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, reuseFixture.dependencies),
        shadowId.toHexString(),
    );
    assert.deepEqual(reuseFixture.counters, { feedA: 0, feedB: 0, insertsA: 0, insertsB: 0, updates: 0 });

    const invalidContexts: Array<[string, ReadablePostContext]> = [
        ["commentPostId mismatch", shadowContext(validEvent, { post: { _id: new ObjectId().toHexString() } })],
        [
            "wrong Circle",
            shadowContext(validEvent, { feed: feedB, circle: circleB, post: { feedId: String(feedB._id) } }),
        ],
        ["wrong parent", shadowContext(validEvent, { post: { parentItemId: new ObjectId().toHexString() } })],
        ["wrong parent type", shadowContext(validEvent, { post: { parentItemType: "task" } })],
        ["unsupported Post type", shadowContext(validEvent, { post: { postType: "post" } })],
        ["Feed/Circle mismatch", shadowContext(validEvent, { feed: { ...feedA, circleId: circleBId.toHexString() } })],
        ["Post/Feed mismatch", shadowContext(validEvent, { post: { feedId: feedBId.toHexString() } })],
    ];
    for (const [label, context] of invalidContexts) {
        const fixture = dependencies({ event: validEvent, existingContext: context });
        assert.equal(
            await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, fixture.dependencies),
            null,
            label,
        );
        assert.deepEqual(fixture.counters, { feedA: 0, feedB: 0, insertsA: 0, insertsB: 0, updates: 0 });
    }

    const secretA = circle(circleAId, { visibility: "secret" });
    const secretEvent = makeEvent();
    const memberFixture = dependencies({
        event: secretEvent,
        circles: [secretA],
        members: [`${actorDid}:${circleAId.toHexString()}`],
    });
    assert.equal(
        await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, memberFixture.dependencies),
        shadowId.toHexString(),
    );
    assert.deepEqual(memberFixture.counters, { feedA: 1, feedB: 0, insertsA: 1, insertsB: 0, updates: 1 });

    for (const deniedActor of ["did:example:outsider", superadmin.did]) {
        const fixture = dependencies({ event: secretEvent, circles: [secretA] });
        assert.equal(await ensureCanonicalEventShadow(eventId.toHexString(), deniedActor, fixture.dependencies), null);
        assert.deepEqual(fixture.counters, { feedA: 0, feedB: 0, insertsA: 0, insertsB: 0, updates: 0 });
    }
    assert.equal(superadmin.isSuperAdmin, true, "the nonmember denial fixture represents an actual superadmin state");

    for (const moderationStatus of ["paused", "suspended", "removed"] as const) {
        const fixture = dependencies({ event: makeEvent(), circles: [circle(circleAId, { moderationStatus })] });
        assert.equal(await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, fixture.dependencies), null);
        assert.deepEqual(fixture.counters, { feedA: 0, feedB: 0, insertsA: 0, insertsB: 0, updates: 0 });
    }

    console.log("event shadow canonicalization behavioral tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
