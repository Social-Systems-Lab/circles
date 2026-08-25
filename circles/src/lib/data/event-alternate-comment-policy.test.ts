import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Comment, CommentDisplay, Event, Feed, Post } from "@/models/models";
import { getCommentDtosForAuthorizedPost } from "./authorized-comment-read";
import { getReadableEventCommentDtos } from "./event-alternate-comment-policy";
import type { ReadablePostContext } from "./post-access-policy";
import { canReadEventOwners } from "./post-source-access-policy";

const eventId = new ObjectId();
const circleId = new ObjectId();
const feedId = new ObjectId();
const postId = new ObjectId();
const event = (overrides: Record<string, unknown> = {}) =>
    ({ _id: eventId, circleId: circleId.toString(), commentPostId: postId.toString(), ...overrides }) as Event;

const context = (
    overrides: {
        post?: Record<string, unknown>;
        feed?: Record<string, unknown>;
        circle?: Record<string, unknown>;
    } = {},
) =>
    ({
        post: {
            _id: postId.toString(),
            postType: "event",
            parentItemType: "event",
            parentItemId: eventId.toString(),
            feedId: feedId.toString(),
            ...overrides.post,
        } as Post,
        feed: { _id: feedId.toString(), circleId: circleId.toString(), ...overrides.feed } as Feed,
        circle: { _id: circleId.toString(), ...overrides.circle } as Circle,
    }) as ReadablePostContext;

function dependencies(
    input: {
        owners?: boolean;
        resolved?: ReadablePostContext | null;
        sanitized?: CommentDisplay[];
    } = {},
) {
    const calls = { owners: 0, resolve: 0, load: 0, sanitize: 0 };
    const loaded = [{ content: "raw" }] as CommentDisplay[];
    return {
        calls,
        value: {
            canReadOwners: async () => {
                calls.owners += 1;
                return input.owners ?? true;
            },
            resolvePost: async () => {
                calls.resolve += 1;
                return input.resolved === undefined ? context() : input.resolved;
            },
            loadComments: async () => {
                calls.load += 1;
                return loaded;
            },
            sanitizeComments: async (comments: readonly CommentDisplay[]) => {
                calls.sanitize += 1;
                assert.equal(comments, loaded, "the complete loaded batch must be sanitized once");
                return input.sanitized ?? [...comments];
            },
        },
    };
}

async function testMissingShadowOwnerGate() {
    for (const owners of [true, false]) {
        const deps = dependencies({ owners });
        const result = await getReadableEventCommentDtos(event({ commentPostId: undefined }), "did:viewer", deps.value);
        assert.deepEqual(result, owners ? [] : null);
        assert.deepEqual(deps.calls, { owners: 1, resolve: 0, load: 0, sanitize: 0 });
    }
}

async function testCanonicalOwnerMatrix() {
    const primaryId = circleId.toString();
    const secretId = new ObjectId().toString();
    const pausedId = new ObjectId().toString();
    const suspendedId = new ObjectId().toString();
    const removedId = new ObjectId().toString();
    const circles = new Map<string, Circle>([
        [primaryId, { _id: new ObjectId(primaryId), visibility: "public", moderationStatus: "active" } as Circle],
        [secretId, { _id: new ObjectId(secretId), visibility: "secret", moderationStatus: "active" } as Circle],
        [pausedId, { _id: new ObjectId(pausedId), visibility: "public", moderationStatus: "paused" } as Circle],
        [
            suspendedId,
            { _id: new ObjectId(suspendedId), visibility: "public", moderationStatus: "suspended" } as Circle,
        ],
        [removedId, { _id: new ObjectId(removedId), visibility: "public", moderationStatus: "removed" } as Circle],
    ]);
    const ownerDependencies = (members: string[] = []) => ({
        findCircles: async (ids: ObjectId[]) =>
            ids
                .map(String)
                .map((id) => circles.get(id))
                .filter(Boolean) as Circle[],
        canReadOwner: async (viewerDid: string | undefined, owner: Circle) =>
            !["suspended", "removed"].includes(owner.moderationStatus!) &&
            (owner.visibility !== "secret" || members.includes(String(owner._id))) &&
            viewerDid !== "did:never-bypass",
    });

    assert.equal(await canReadEventOwners(event({ commentPostId: undefined }), undefined, ownerDependencies()), true);
    assert.equal(
        await canReadEventOwners(
            event({ commentPostId: undefined, hostCircleIds: [pausedId] }),
            undefined,
            ownerDependencies(),
        ),
        true,
    );
    const multiHost = event({ commentPostId: undefined, hostCircleIds: [secretId, secretId] });
    assert.equal(await canReadEventOwners(multiHost, "did:outsider", ownerDependencies()), false);
    assert.equal(await canReadEventOwners(multiHost, "did:member", ownerDependencies([secretId])), true);
    assert.equal(await canReadEventOwners(multiHost, "did:superadmin", ownerDependencies()), false);
    assert.equal(
        await canReadEventOwners(event({ hostCircleIds: [suspendedId] }), undefined, ownerDependencies()),
        false,
    );
    assert.equal(
        await canReadEventOwners(event({ hostCircleIds: [removedId] }), undefined, ownerDependencies()),
        false,
    );
    assert.equal(
        await canReadEventOwners(event({ hostCircleIds: [new ObjectId().toString()] }), undefined, ownerDependencies()),
        false,
    );
    assert.equal(
        await canReadEventOwners(event({ hostCircleIds: "malformed" }), undefined, ownerDependencies()),
        false,
    );
    assert.equal(
        await canReadEventOwners(event({ hostCircleIds: ["malformed"] }), undefined, ownerDependencies()),
        false,
    );
}

async function testCurrentAndStrictLegacyShadows() {
    for (const postType of ["event", "discussion"] as const) {
        const sanitized = [{ content: postType }] as CommentDisplay[];
        const deps = dependencies({ resolved: context({ post: { postType } }), sanitized });
        assert.equal(await getReadableEventCommentDtos(event(), "did:viewer", deps.value), sanitized);
        assert.deepEqual(deps.calls, { owners: 0, resolve: 1, load: 1, sanitize: 1 });
    }
}

async function testDeniedAndMismatchedShadowsNeverLoad() {
    const mismatches = [
        context({ post: { postType: "community" } }),
        context({ post: { parentItemType: "task" } }),
        context({ post: { parentItemId: new ObjectId().toString() } }),
        context({ post: { feedId: new ObjectId().toString() } }),
        context({ feed: { circleId: new ObjectId().toString() } }),
        context({ circle: { _id: new ObjectId().toString() } }),
        context({ post: { _id: new ObjectId().toString() } }),
        context({ post: { parentItemType: undefined } }),
    ];
    for (const resolved of [null, ...mismatches]) {
        const deps = dependencies({ resolved });
        assert.equal(await getReadableEventCommentDtos(event(), "did:outsider", deps.value), null);
        assert.equal(deps.calls.load, 0);
        assert.equal(deps.calls.sanitize, 0);
    }
}

async function testNeutralLoaderProjectsNestedCommentDtos() {
    const rootId = new ObjectId();
    const createdAt = new Date("2026-08-25T08:00:00Z");
    const editedAt = new Date("2026-08-25T09:00:00Z");
    const rows = [
        {
            _id: rootId,
            postId: postId.toString(),
            parentCommentId: null,
            content: "[Forged](/circles/secret)",
            createdBy: "did:author",
            createdAt,
            editedAt,
            reactions: { like: 2, bad: "4", negative: -1 },
            replies: 1,
            isDeleted: false,
            mentions: [{ id: "secret" }],
            mentionsDisplay: [{ name: "Leaked" }],
            mentionsDetails: [{ private: true }],
            author: { private: true },
            userReaction: "like",
            unknown: { private: true },
        },
        {
            _id: new ObjectId(),
            postId: postId.toString(),
            parentCommentId: rootId.toString(),
            content: "reply",
            createdBy: "did:reply",
            createdAt,
            editedAt: "invalid",
            reactions: null,
            replies: 0,
            isDeleted: "false",
        },
    ] as unknown as Comment[];
    let queriedPostId = "";
    const dtos = await getCommentDtosForAuthorizedPost(postId.toString(), {
        findComments: async (id) => {
            queriedPostId = id;
            return rows;
        },
    });
    assert.equal(queriedPostId, postId.toString());
    assert.equal(dtos.length, 2);
    assert.equal(dtos[0]._id, rootId.toString());
    assert.equal(dtos[1].parentCommentId, rootId.toString());
    assert.deepEqual(dtos[0].reactions, { like: 2 });
    assert.deepEqual(dtos[1].reactions, {});
    assert.equal(dtos[0].editedAt, editedAt);
    assert.equal(Object.hasOwn(dtos[1], "editedAt"), false);
    assert.equal(dtos[0].isDeleted, false);
    assert.equal(Object.hasOwn(dtos[1], "isDeleted"), false);
    for (const dto of dtos) {
        for (const key of ["mentions", "mentionsDisplay", "mentionsDetails", "author", "userReaction", "unknown"]) {
            assert.equal(Object.hasOwn(dto, key), false);
        }
    }
}

async function main() {
    await testMissingShadowOwnerGate();
    await testCanonicalOwnerMatrix();
    await testCurrentAndStrictLegacyShadows();
    await testDeniedAndMismatchedShadowsNeverLoad();
    await testNeutralLoaderProjectsNestedCommentDtos();
    console.log("event alternate comment policy tests passed");
}

void main();
