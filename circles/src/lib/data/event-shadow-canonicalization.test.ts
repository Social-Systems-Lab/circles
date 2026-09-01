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
const feedA = { _id: feedAId, circleId: circleAId.toHexString(), handle: "default" } as Feed;
const feedB = { _id: feedBId, circleId: circleBId.toHexString(), handle: "default" } as Feed;

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

type Counters = {
    feedA: number;
    feedB: number;
    insertsA: number;
    insertsB: number;
    updates: number;
    deletes: string[];
};

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
    const counters: Counters = { feedA: 0, feedB: 0, insertsA: 0, insertsB: 0, updates: 0, deletes: [] };
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
            linkCommentPostIdIfMissing: async () => {
                counters.updates++;
                return true;
            },
            isCandidateReferenced: async () => false,
            deleteCreatedShadow: async (postId) => {
                counters.deletes.push(postId);
            },
            reportCleanupFailure: () => undefined,
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
    assert.deepEqual(createFixture.counters, {
        feedA: 1,
        feedB: 0,
        insertsA: 1,
        insertsB: 0,
        updates: 1,
        deletes: [],
    });

    const validEvent = makeEvent({ commentPostId: shadowId.toHexString() });
    const reuseFixture = dependencies({ event: validEvent, existingContext: shadowContext(validEvent) });
    assert.equal(
        await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, reuseFixture.dependencies),
        shadowId.toHexString(),
    );
    assert.deepEqual(reuseFixture.counters, {
        feedA: 0,
        feedB: 0,
        insertsA: 0,
        insertsB: 0,
        updates: 0,
        deletes: [],
    });

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
        assert.deepEqual(fixture.counters, {
            feedA: 0,
            feedB: 0,
            insertsA: 0,
            insertsB: 0,
            updates: 0,
            deletes: [],
        });
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
    assert.deepEqual(memberFixture.counters, {
        feedA: 1,
        feedB: 0,
        insertsA: 1,
        insertsB: 0,
        updates: 1,
        deletes: [],
    });

    for (const deniedActor of ["did:example:outsider", superadmin.did]) {
        const fixture = dependencies({ event: secretEvent, circles: [secretA] });
        assert.equal(await ensureCanonicalEventShadow(eventId.toHexString(), deniedActor, fixture.dependencies), null);
        assert.deepEqual(fixture.counters, {
            feedA: 0,
            feedB: 0,
            insertsA: 0,
            insertsB: 0,
            updates: 0,
            deletes: [],
        });
    }
    assert.equal(superadmin.isSuperAdmin, true, "the nonmember denial fixture represents an actual superadmin state");

    for (const moderationStatus of ["paused", "suspended", "removed"] as const) {
        const fixture = dependencies({ event: makeEvent(), circles: [circle(circleAId, { moderationStatus })] });
        assert.equal(await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, fixture.dependencies), null);
        assert.deepEqual(fixture.counters, {
            feedA: 0,
            feedB: 0,
            insertsA: 0,
            insertsB: 0,
            updates: 0,
            deletes: [],
        });
    }

    for (const [label, invalidFeed] of [
        ["missing default Feed", null],
        ["non-default Feed", { ...feedA, handle: "community" } as Feed],
        ["cross-Circle default Feed", feedB],
    ] as const) {
        const fixture = dependencies({ event: makeEvent() });
        fixture.dependencies.findPrimaryFeed = async () => invalidFeed;
        assert.equal(
            await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, fixture.dependencies),
            null,
            label,
        );
        assert.equal(fixture.counters.insertsA + fixture.counters.insertsB, 0, label);
        assert.equal(fixture.counters.updates, 0, label);
    }

    // Existing strictly bound historical shadows remain reusable from a same-Circle non-default Feed.
    const historicalFeed = { ...feedA, handle: "community" } as Feed;
    const historicalEvent = makeEvent({ commentPostId: shadowId.toHexString() });
    const historicalFixture = dependencies({
        event: historicalEvent,
        existingContext: shadowContext(historicalEvent, { feed: historicalFeed }),
    });
    assert.equal(
        await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, historicalFixture.dependencies),
        shadowId.toHexString(),
    );
    assert.equal(historicalFixture.counters.feedA, 0, "historical reuse does not require a new default Feed lookup");

    // A deterministic two-attempt race: A wins, B reloads A, cleans only B, and returns A.
    const candidateA = new ObjectId();
    const candidateB = new ObjectId();
    let storedEvent = makeEvent();
    let createCount = 0;
    let linkCount = 0;
    const deleted: string[] = [];
    const raceDependencies: EventShadowOrchestrationDependencies = {
        ...dependencies({ event: storedEvent }).dependencies,
        loadEvent: async () => ({ ...storedEvent }),
        resolveShadow: async (postId) =>
            postId === candidateA.toHexString()
                ? shadowContext(storedEvent, {
                      post: { _id: candidateA.toHexString(), feedId: feedAId.toHexString() },
                  })
                : null,
        createShadow: async (input) => ({ ...input, _id: createCount++ === 0 ? candidateA : candidateB }) as Post,
        linkCommentPostIdIfMissing: async (_id, postId) => {
            linkCount++;
            if (storedEvent.commentPostId == null) {
                storedEvent = { ...storedEvent, commentPostId: postId };
                return true;
            }
            return false;
        },
        isCandidateReferenced: async (postId) => storedEvent.commentPostId === postId,
        deleteCreatedShadow: async (postId) => {
            deleted.push(postId);
        },
    };
    const first = await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, raceDependencies);
    // Simulate B having loaded the absent-backlink snapshot before A linked.
    const secondInitialLoad = { ...makeEvent() };
    let secondLoad = true;
    const second = await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, {
        ...raceDependencies,
        loadEvent: async () => (secondLoad ? ((secondLoad = false), secondInitialLoad) : { ...storedEvent }),
    });
    assert.equal(first, candidateA.toHexString());
    assert.equal(second, candidateA.toHexString());
    assert.equal(createCount, 2);
    assert.equal(linkCount, 2);
    assert.equal(storedEvent.commentPostId, candidateA.toHexString());
    assert.deepEqual(deleted, [candidateB.toHexString()]);

    // Source disappearance and malformed concurrent winners cannot be overwritten.
    for (const [label, freshEvent, context] of [
        ["source disappearance", null, null],
        ["malformed winner", makeEvent({ commentPostId: new ObjectId().toHexString() }), null],
    ] as const) {
        const candidate = new ObjectId();
        const cleaned: string[] = [];
        let loadCount = 0;
        const fixture = dependencies({ event: makeEvent() }).dependencies;
        const result = await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, {
            ...fixture,
            loadEvent: async () => (loadCount++ === 0 ? makeEvent() : freshEvent),
            createShadow: async (input) => ({ ...input, _id: candidate }) as Post,
            linkCommentPostIdIfMissing: async () => false,
            resolveShadow: async () => context,
            deleteCreatedShadow: async (postId) => {
                cleaned.push(postId);
            },
        });
        assert.equal(result, null, label);
        assert.deepEqual(cleaned, [candidate.toHexString()], label);
    }

    // A resolvable cross-Circle winner is rejected by strict Event binding; only local B is cleaned.
    const crossCircleWinner = new ObjectId();
    const crossCircleCandidate = new ObjectId();
    let crossCircleStoredEvent = makeEvent();
    let crossCircleLoads = 0;
    let crossCircleCreates = 0;
    let crossCircleLinks = 0;
    let crossCircleResolves = 0;
    let crossCircleGuards = 0;
    const crossCircleDeletes: string[] = [];
    const crossCircleResult = await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, {
        ...dependencies({ event: crossCircleStoredEvent }).dependencies,
        loadEvent: async () => {
            crossCircleLoads++;
            if (crossCircleLoads === 1) return { ...crossCircleStoredEvent };
            crossCircleStoredEvent = makeEvent({ commentPostId: crossCircleWinner.toHexString() });
            return { ...crossCircleStoredEvent };
        },
        createShadow: async (input) => {
            crossCircleCreates++;
            return { ...input, _id: crossCircleCandidate } as Post;
        },
        linkCommentPostIdIfMissing: async () => {
            crossCircleLinks++;
            return false;
        },
        resolveShadow: async (postId) => {
            crossCircleResolves++;
            return shadowContext(crossCircleStoredEvent, {
                post: { _id: postId, feedId: feedBId.toHexString() },
                feed: feedB,
                circle: circleB,
            });
        },
        isCandidateReferenced: async () => {
            crossCircleGuards++;
            return false;
        },
        deleteCreatedShadow: async (postId) => {
            crossCircleDeletes.push(postId);
        },
    });
    assert.equal(crossCircleResult, null);
    assert.equal(crossCircleStoredEvent.commentPostId, crossCircleWinner.toHexString());
    assert.equal(crossCircleCreates, 1);
    assert.equal(crossCircleLinks, 1);
    assert.equal(crossCircleLoads, 2);
    assert.equal(crossCircleResolves, 1);
    assert.equal(crossCircleGuards, 1);
    assert.deepEqual(crossCircleDeletes, [crossCircleCandidate.toHexString()]);

    // A write exception plus no valid winner stays null even when loser deletion also fails.
    const failedWriteCandidate = new ObjectId();
    const invalidWinner = new ObjectId();
    let failedWriteLoads = 0;
    let failedWriteCreates = 0;
    let failedWriteLinks = 0;
    let failedWriteResolves = 0;
    let failedWriteGuards = 0;
    let failedWriteDeletes = 0;
    let failedWriteLogs = 0;
    const failedWriteResult = await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, {
        ...dependencies({ event: makeEvent() }).dependencies,
        loadEvent: async () => {
            failedWriteLoads++;
            return failedWriteLoads === 1 ? makeEvent() : makeEvent({ commentPostId: invalidWinner.toHexString() });
        },
        createShadow: async (input) => {
            failedWriteCreates++;
            return { ...input, _id: failedWriteCandidate } as Post;
        },
        linkCommentPostIdIfMissing: async () => {
            failedWriteLinks++;
            throw new Error("ambiguous write without a valid winner");
        },
        resolveShadow: async () => {
            failedWriteResolves++;
            return null;
        },
        isCandidateReferenced: async () => {
            failedWriteGuards++;
            return false;
        },
        deleteCreatedShadow: async () => {
            failedWriteDeletes++;
            throw new Error("candidate deletion unavailable");
        },
        reportCleanupFailure: () => failedWriteLogs++,
    });
    assert.equal(failedWriteResult, null);
    assert.equal(failedWriteCreates, 1);
    assert.equal(failedWriteLinks, 1);
    assert.equal(failedWriteLoads, 2);
    assert.equal(failedWriteResolves, 1);
    assert.equal(failedWriteGuards, 1);
    assert.equal(failedWriteDeletes, 1);
    assert.equal(failedWriteLogs, 1);

    // An ambiguous throw is resolved only from a fresh, strictly bound backlink.
    for (const [label, linkedId, expectedId] of [
        ["candidate committed before throw", candidateA, candidateA],
        ["another valid writer won before throw", candidateA, candidateA],
    ] as const) {
        const localCandidate = label.startsWith("candidate") ? candidateA : candidateB;
        const linkedEvent = makeEvent({ commentPostId: linkedId.toHexString() });
        let loads = 0;
        const cleaned: string[] = [];
        const fixture = dependencies({ event: makeEvent() }).dependencies;
        assert.equal(
            await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, {
                ...fixture,
                loadEvent: async () => (loads++ === 0 ? makeEvent() : linkedEvent),
                createShadow: async (input) => ({ ...input, _id: localCandidate }) as Post,
                linkCommentPostIdIfMissing: async () => {
                    throw new Error("ambiguous persistence outcome");
                },
                resolveShadow: async (postId) =>
                    postId === linkedId.toHexString()
                        ? shadowContext(linkedEvent, {
                              post: { _id: linkedId.toHexString(), feedId: feedAId.toHexString() },
                          })
                        : null,
                isCandidateReferenced: async (postId) => postId === linkedId.toHexString(),
                deleteCreatedShadow: async (postId) => {
                    cleaned.push(postId);
                },
            }),
            expectedId.toHexString(),
            label,
        );
        assert.deepEqual(cleaned, label.startsWith("candidate") ? [] : [candidateB.toHexString()], label);
    }

    // A valid winner remains authoritative even if loser cleanup fails.
    const cleanupFailureCandidate = new ObjectId();
    let cleanupFailureLoads = 0;
    let cleanupFailureLogged = 0;
    let cleanupFailureCreates = 0;
    let cleanupFailureLinks = 0;
    let cleanupFailureResolves = 0;
    let cleanupFailureGuards = 0;
    let cleanupFailureDeletes = 0;
    const cleanupFailureFixture = dependencies({ event: makeEvent() }).dependencies;
    assert.equal(
        await ensureCanonicalEventShadow(eventId.toHexString(), actorDid, {
            ...cleanupFailureFixture,
            loadEvent: async () =>
                cleanupFailureLoads++ === 0 ? makeEvent() : makeEvent({ commentPostId: candidateA.toHexString() }),
            createShadow: async (input) => {
                cleanupFailureCreates++;
                return { ...input, _id: cleanupFailureCandidate } as Post;
            },
            linkCommentPostIdIfMissing: async () => {
                cleanupFailureLinks++;
                return false;
            },
            resolveShadow: async () => {
                cleanupFailureResolves++;
                return shadowContext(makeEvent({ commentPostId: candidateA.toHexString() }), {
                    post: { _id: candidateA.toHexString(), feedId: feedAId.toHexString() },
                });
            },
            isCandidateReferenced: async () => {
                cleanupFailureGuards++;
                throw new Error("reference check unavailable");
            },
            deleteCreatedShadow: async () => {
                cleanupFailureDeletes++;
            },
            reportCleanupFailure: () => cleanupFailureLogged++,
        }),
        candidateA.toHexString(),
    );
    assert.equal(cleanupFailureCreates, 1);
    assert.equal(cleanupFailureLinks, 1);
    assert.equal(cleanupFailureLoads, 2);
    assert.equal(cleanupFailureResolves, 1);
    assert.equal(cleanupFailureGuards, 1);
    assert.equal(cleanupFailureDeletes, 0);
    assert.equal(cleanupFailureLogged, 1);

    console.log("event shadow canonicalization behavioral tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
