import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Comment, CommentDisplay, Event, Feed, Post } from "@/models/models";
import {
    addEventCommentWithDependencies,
    assertEventHostCirclesWritable,
    type AddEventCommentDependencies,
} from "./event-alternate-comment-policy";
import { createCommentForAuthorizedPost } from "./discussion-comment-create";
import { sanitizeCommentMentions } from "./comment-mention-policy";
import type { ReadablePostContext } from "./post-access-policy";
import { canReadEventOwners } from "./post-source-access-policy";
import { canReadCircle } from "./circle-visibility-policy";

const eventId = new ObjectId();
const primaryId = new ObjectId();
const secondaryId = new ObjectId();
const feedId = new ObjectId();
const postId = new ObjectId();
const insertedId = new ObjectId();
const createdAt = new Date("2026-08-27T08:00:00Z");

const event = (overrides: Record<string, unknown> = {}) =>
    ({
        _id: eventId,
        circleId: primaryId.toString(),
        hostCircleIds: [secondaryId.toString(), secondaryId.toString()],
        commentPostId: postId.toString(),
        ...overrides,
    }) as Event;

const context = (
    overrides: {
        post?: Record<string, unknown>;
        feed?: Record<string, unknown>;
        circle?: Record<string, unknown>;
    } = {},
) =>
    ({
        post: {
            _id: postId,
            postType: "event",
            parentItemType: "event",
            parentItemId: eventId,
            feedId: feedId.toString(),
            ...overrides.post,
        } as unknown as Post,
        feed: { _id: feedId, circleId: primaryId.toString(), ...overrides.feed } as Feed,
        circle: { _id: primaryId, ...overrides.circle } as Circle,
    }) as ReadablePostContext;

function dependencies(
    input: {
        found?: Event | null;
        resolved?: ReadablePostContext | null;
        writable?: boolean;
        authorized?: boolean;
        order?: string[];
        inserted?: Comment[];
        sanitizeComments?: AddEventCommentDependencies["sanitizeComments"];
    } = {},
): AddEventCommentDependencies {
    const order = input.order ?? [];
    return {
        findEvent: async () => {
            order.push("event");
            return input.found === undefined ? event() : input.found;
        },
        resolvePost: async () => {
            order.push("access");
            return input.resolved === undefined ? context() : input.resolved;
        },
        assertHostsWritable: async () => {
            order.push("write");
            if (input.writable === false) throw new Error("host detail");
        },
        authorizeComment: async (_did, circleId) => {
            order.push("authorize");
            assert.equal(circleId, primaryId.toString());
            return input.authorized ?? true;
        },
        createComment: async (...args) => {
            order.push("insert");
            return createCommentForAuthorizedPost(...args);
        },
        createDependencies: {
            insertComment: async (comment) => {
                input.inserted?.push(comment);
                return { insertedId };
            },
            now: () => createdAt,
        },
        sanitizeComments:
            input.sanitizeComments ??
            (async (comments) => {
                order.push("sanitize");
                assert.equal(comments.length, 1);
                return comments.map((comment) => ({ ...comment, content: "Available Circle / Unavailable Circle" }));
            }),
    };
}

type OwnerFixture = Circle & { _id: ObjectId };

const owner = (
    id: ObjectId,
    visibility: "public" | "secret" = "public",
    moderationStatus: "active" | "paused" | "suspended" | "removed" = "active",
): OwnerFixture =>
    ({
        _id: id,
        visibility,
        moderationStatus,
        circleType: "circle",
    }) as OwnerFixture;

function resolveThroughOwnerReadability(
    foundOwners: OwnerFixture[],
    memberCircleIds: string[],
    order: string[],
    targetEvent: Event = event(),
): AddEventCommentDependencies["resolvePost"] {
    return async (_postId, viewerDid) => {
        order.push("access");
        const readable = await canReadEventOwners(targetEvent, viewerDid, {
            findCircles: async (ids) => foundOwners.filter((circle) => ids.some((id) => id.equals(circle._id))),
            canReadOwner: (did, circle) =>
                canReadCircle(did, circle, {
                    getMember: async (_viewerDid, circleId) =>
                        memberCircleIds.includes(circleId) ? ({ userDid: viewerDid, circleId } as never) : null,
                }),
        });
        return readable ? context() : null;
    };
}

function lifecycleByOwner(
    states: Map<string, "active" | "paused" | "suspended" | "removed">,
    checked: string[],
    order: string[],
): AddEventCommentDependencies["assertHostsWritable"] {
    return async (targetEvent) => {
        order.push("write");
        await assertEventHostCirclesWritable(targetEvent, async (circleId) => {
            checked.push(circleId);
            if (states.get(circleId) !== "active") throw new Error("owner unavailable");
        });
    };
}

async function testSuccessfulOrderingAndSafeReturn() {
    const order: string[] = [];
    const inserted: Comment[] = [];
    const response = await addEventCommentWithDependencies(
        eventId.toString(),
        {
            _id: new ObjectId(),
            postId: "forged",
            createdBy: "did:forged",
            createdAt: new Date(0),
            content: "[Readable](/circles/readable) / [Secret](/circles/secret)",
            parentCommentId: "parent",
            replies: 99,
            reactions: { leak: 99 },
            editedAt: new Date(),
            isDeleted: true,
            mentions: [{ leak: true }],
            mentionsDisplay: [{ leak: true }],
            mentionsDetails: [{ leak: true }],
            author: { leak: true },
            userReaction: "leak",
            unknown: { nested: true },
        } as never,
        "did:member",
        dependencies({ order, inserted }),
    );
    assert.deepEqual(order, ["event", "access", "write", "authorize", "insert", "sanitize"]);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].postId, postId.toString());
    assert.equal(inserted[0].createdBy, "did:member");
    assert.equal(inserted[0].createdAt, createdAt);
    assert.equal(inserted[0].parentCommentId, "parent");
    assert.deepEqual(inserted[0].reactions, {});
    assert.equal(inserted[0].replies, 0);
    for (const key of ["_id", "editedAt", "isDeleted"]) assert.equal(Object.hasOwn(inserted[0], key), false);
    assert.deepEqual(response, {
        _id: insertedId.toString(),
        postId: postId.toString(),
        parentCommentId: "parent",
        content: "Available Circle / Unavailable Circle",
        createdBy: "did:member",
        createdAt,
        reactions: {},
        replies: 0,
    });
    for (const key of [
        "mentions",
        "mentionsDisplay",
        "mentionsDetails",
        "author",
        "userReaction",
        "unknown",
        "editedAt",
        "isDeleted",
    ]) {
        assert.equal(Object.hasOwn(response, key), false);
    }
}

async function testInsertDtoAndRealMentionSanitation() {
    const readableId = new ObjectId();
    const hiddenId = new ObjectId();
    const inserted: Comment[] = [];
    let batches = 0;
    const deps = dependencies({ inserted });
    deps.sanitizeComments = async (comments, viewerDid) => {
        batches += 1;
        return sanitizeCommentMentions(comments, viewerDid, {
            findReadableCircles: async () => [
                { _id: readableId, name: "Canonical Circle", handle: "canonical" } as Circle,
            ],
        });
    };
    const response = await addEventCommentWithDependencies(
        eventId.toString(),
        { content: `[Forged](/circles/${readableId}) [Leaked](/circles/${hiddenId})` },
        "did:member",
        deps,
    );
    assert.equal(batches, 1);
    assert.equal(response.content, "[Canonical Circle](/circles/canonical) Unavailable Circle");
    assert.equal(response.createdBy, "did:member");
    assert.equal(response.postId, postId.toString());
}

async function testFeatureAndAccessDenials() {
    let inserts: Comment[] = [];
    const featureOrder: string[] = [];
    await assert.rejects(
        addEventCommentWithDependencies(
            eventId.toString(),
            { content: "x" },
            "did:user",
            dependencies({ authorized: false, order: featureOrder, inserted: inserts }),
        ),
        /Not authorized/,
    );
    assert.deepEqual(featureOrder, ["event", "access", "write", "authorize"]);
    assert.equal(inserts.length, 0);

    for (const viewerDid of ["did:secret-outsider", "did:superadmin-nonmember"]) {
        const order: string[] = [];
        await assert.rejects(
            addEventCommentWithDependencies(
                eventId.toString(),
                { content: "x" },
                viewerDid,
                dependencies({ resolved: null, order }),
            ),
            /Event not found/,
        );
        assert.deepEqual(order, ["event", "access"]);
    }
    for (const found of [null, event({ commentPostId: undefined })]) {
        const order: string[] = [];
        await assert.rejects(
            addEventCommentWithDependencies(
                eventId.toString(),
                { content: "x" },
                "did:user",
                dependencies({ found, order }),
            ),
            /Event not found/,
        );
        assert.deepEqual(order, ["event"]);
    }
}

async function testLifecycleMatrix() {
    for (const state of [
        "paused primary",
        "secondary paused",
        "secondary suspended",
        "secondary removed",
        "unreadable multi-host",
    ]) {
        const order: string[] = [];
        await assert.rejects(
            addEventCommentWithDependencies(
                eventId.toString(),
                { content: state },
                "did:member",
                dependencies({ writable: false, order }),
            ),
            /Event not found/,
        );
        assert.deepEqual(order, ["event", "access", "write"]);
    }
    const checked: string[] = [];
    await assertEventHostCirclesWritable(event(), async (id) => {
        checked.push(id);
    });
    assert.deepEqual(checked.sort(), [primaryId.toString(), secondaryId.toString()].sort());
    for (const malformed of [
        event({ hostCircleIds: "bad" }),
        event({ hostCircleIds: ["bad"] }),
        event({ circleId: "bad" }),
    ]) {
        await assert.rejects(assertEventHostCirclesWritable(malformed), /Event not found/);
    }
}

async function testShadowMatrix() {
    for (const postType of ["event", "discussion"] as const) {
        const order: string[] = [];
        await addEventCommentWithDependencies(
            eventId.toString(),
            { content: postType },
            "did:member",
            dependencies({ resolved: context({ post: { postType } }), order }),
        );
        assert.deepEqual(order, ["event", "access", "write", "authorize", "insert", "sanitize"]);
    }
    const mismatches = [
        context({ post: { postType: "task" } }),
        context({ post: { postType: undefined } }),
        context({ post: { parentItemType: "task" } }),
        context({ post: { parentItemId: new ObjectId() } }),
        context({ post: { feedId: new ObjectId() } }),
        context({ feed: { circleId: new ObjectId() } }),
        context({ circle: { _id: new ObjectId() } }),
        context({ post: { _id: new ObjectId() } }),
    ];
    for (const resolved of mismatches) {
        const order: string[] = [];
        await assert.rejects(
            addEventCommentWithDependencies(
                eventId.toString(),
                { content: "x" },
                "did:member",
                dependencies({ resolved, order }),
            ),
            /Event not found/,
        );
        assert.deepEqual(order, ["event", "access"]);
    }
}

async function testDistinctPublicAndSecretSuccessPaths() {
    for (const fixture of [
        {
            label: "public nonmember",
            did: "did:public-nonmember",
            owners: [owner(primaryId), owner(secondaryId)],
            memberCircleIds: [],
        },
        {
            label: "secret member",
            did: "did:secret-member",
            owners: [owner(primaryId, "secret"), owner(secondaryId, "secret")],
            memberCircleIds: [primaryId.toString(), secondaryId.toString()],
        },
    ]) {
        const order: string[] = [];
        const inserted: Comment[] = [];
        const deps = dependencies({ order, inserted });
        deps.resolvePost = resolveThroughOwnerReadability(fixture.owners, fixture.memberCircleIds, order);
        const response = await addEventCommentWithDependencies(
            eventId.toString(),
            { content: fixture.label },
            fixture.did,
            deps,
        );
        assert.deepEqual(order, ["event", "access", "write", "authorize", "insert", "sanitize"]);
        assert.equal(inserted.length, 1);
        assert.equal(response._id, insertedId.toString());
        assert.equal(response.postId, postId.toString());
        assert.equal(response.createdBy, fixture.did);
        assert.equal(response.createdAt, createdAt);
        assert.deepEqual(response.reactions, {});
        assert.equal(response.replies, 0);
        assert.equal(Object.hasOwn(response, "isDeleted"), false);
        assert.equal(Object.hasOwn(response, "editedAt"), false);
    }
}

async function expectNeutralDenial(
    deps: AddEventCommentDependencies,
    viewerDid: string,
    data: Partial<Comment> = { content: "denied" },
) {
    await assert.rejects(
        addEventCommentWithDependencies(eventId.toString(), data, viewerDid, deps),
        (error: unknown) => error instanceof Error && error.message === "Event not found",
    );
}

async function testDistinctOwnerReadDenials() {
    for (const fixture of [
        {
            label: "primary suspended",
            owners: [owner(primaryId, "public", "suspended"), owner(secondaryId)],
            memberCircleIds: [] as string[],
        },
        {
            label: "primary removed",
            owners: [owner(primaryId, "public", "removed"), owner(secondaryId)],
            memberCircleIds: [] as string[],
        },
        {
            label: "secondary suspended",
            owners: [owner(primaryId), owner(secondaryId, "public", "suspended")],
            memberCircleIds: [] as string[],
        },
        {
            label: "secondary removed",
            owners: [owner(primaryId), owner(secondaryId, "public", "removed")],
            memberCircleIds: [] as string[],
        },
        {
            label: "unreadable secondary",
            owners: [owner(primaryId), owner(secondaryId, "secret")],
            memberCircleIds: [] as string[],
        },
        {
            label: "missing secondary owner",
            owners: [owner(primaryId)],
            memberCircleIds: [] as string[],
        },
    ]) {
        const order: string[] = [];
        const inserted: Comment[] = [];
        const deps = dependencies({ order, inserted });
        deps.resolvePost = resolveThroughOwnerReadability(fixture.owners, fixture.memberCircleIds, order);
        await expectNeutralDenial(deps, `did:${fixture.label.replaceAll(" ", "-")}`);
        assert.deepEqual(order, ["event", "access"], fixture.label);
        assert.equal(inserted.length, 0, fixture.label);
    }
}

async function testDistinctPausedOwnerWriteDenials() {
    for (const fixture of [
        { label: "primary paused", pausedId: primaryId.toString() },
        { label: "secondary paused", pausedId: secondaryId.toString() },
    ]) {
        const order: string[] = [];
        const inserted: Comment[] = [];
        const checked: string[] = [];
        const deps = dependencies({ order, inserted });
        deps.resolvePost = resolveThroughOwnerReadability(
            [
                owner(primaryId, "public", fixture.pausedId === primaryId.toString() ? "paused" : "active"),
                owner(secondaryId, "public", fixture.pausedId === secondaryId.toString() ? "paused" : "active"),
            ],
            [],
            order,
        );
        deps.assertHostsWritable = lifecycleByOwner(
            new Map([
                [primaryId.toString(), fixture.pausedId === primaryId.toString() ? "paused" : "active"],
                [secondaryId.toString(), fixture.pausedId === secondaryId.toString() ? "paused" : "active"],
            ]),
            checked,
            order,
        );
        await expectNeutralDenial(deps, "did:member");
        assert.deepEqual(order, ["event", "access", "write"], fixture.label);
        assert.ok(checked.includes(primaryId.toString()), fixture.label);
        assert.ok(checked.includes(secondaryId.toString()), fixture.label);
        assert.ok(checked.includes(fixture.pausedId), fixture.label);
        assert.equal(inserted.length, 0, fixture.label);
    }
}

async function testMalformedHostsThroughOrchestration() {
    for (const malformedEvent of [event({ hostCircleIds: "bad" }), event({ hostCircleIds: ["bad"] })]) {
        const order: string[] = [];
        const inserted: Comment[] = [];
        const deps = dependencies({ found: malformedEvent, order, inserted });
        deps.resolvePost = resolveThroughOwnerReadability(
            [owner(primaryId), owner(secondaryId)],
            [],
            order,
            malformedEvent,
        );
        await expectNeutralDenial(deps, "did:member");
        assert.deepEqual(order, ["event", "access"]);
        assert.equal(inserted.length, 0);
    }
}

async function main() {
    await testSuccessfulOrderingAndSafeReturn();
    await testInsertDtoAndRealMentionSanitation();
    await testFeatureAndAccessDenials();
    await testLifecycleMatrix();
    await testShadowMatrix();
    await testDistinctPublicAndSecretSuccessPaths();
    await testDistinctOwnerReadDenials();
    await testDistinctPausedOwnerWriteDenials();
    await testMalformedHostsThroughOrchestration();
    console.log("event alternate comment mutation policy tests passed");
}

void main();
