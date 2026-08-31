import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import type { Circle, Comment, Event, Feed, Member, Post } from "@/models/models";
import {
    COMMENT_CREATE_UNAVAILABLE_MESSAGE,
    orchestrateCommentCreate,
    resolveCommentCreateContext,
    type CommentCreateDependencies,
} from "./comment-create-access-policy";
import { resolveReadablePostContext } from "./post-access-policy";
import { canReadPostSource } from "./post-source-access-policy";
import { orchestrateAuthoredCommentCreate, prepareAuthoredComment } from "./comment-write-policy";
import { addCommentToDiscussionWithDependencies } from "./discussion-comment-create";
import { addEventCommentWithDependencies, assertEventHostCirclesWritable } from "./event-alternate-comment-policy";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";

const postId = new ObjectId().toHexString();
const feedId = new ObjectId().toHexString();
const circleId = new ObjectId().toHexString();
const sourceId = new ObjectId().toHexString();
const actorDid = "did:example:member";

const context = (overrides: Partial<Post> = {}, circleOverrides: Partial<Circle> = {}) => ({
    post: {
        _id: postId,
        feedId,
        postType: "post",
        createdBy: "did:example:author",
        createdAt: new Date(),
        content: "post",
        userGroups: ["everyone"],
        reactions: {},
        comments: 0,
        ...overrides,
    } as Post,
    feed: { _id: feedId, circleId, handle: "default" } as Feed,
    circle: { _id: circleId, circleType: "circle", moderationStatus: "active", ...circleOverrides } as Circle,
});

const dependencies = (
    postOverrides: Partial<Post> = {},
    options: {
        circle?: Partial<Circle>;
        source?: Record<string, unknown> | null;
        authorize?: (featureModule: string) => boolean;
        readable?: boolean;
    } = {},
): CommentCreateDependencies => ({
    resolveReadableContext: async () =>
        options.readable === false ? null : (context(postOverrides, options.circle) as never),
    canWriteCircle: (circle) => circle?.moderationStatus === "active",
    findSource: async () => options.source as never,
    authorizeFeature: async (_did, _circle, feature) => options.authorize?.(feature.module) ?? true,
});

test("ordinary and source noticeboard Posts stay generic", async () => {
    const ordinary = await resolveCommentCreateContext(postId, actorDid, dependencies());
    assert.equal(ordinary?.route.kind, "generic");

    const noticeboard = await resolveCommentCreateContext(
        postId,
        actorDid,
        dependencies(
            { postType: "post", parentItemType: "event", parentItemId: sourceId },
            { source: { _id: sourceId, commentPostId: new ObjectId().toHexString() } },
        ),
    );
    assert.equal(noticeboard?.route.kind, "generic");
});

test("detail shadows require the source backlink and source-specific feature", async () => {
    for (const [type, expectedModule] of [
        ["task", "tasks"],
        ["goal", "goals"],
        ["issue", "issues"],
        ["proposal", "feed"],
    ] as const) {
        let authorizedModule = "";
        const allowed = await resolveCommentCreateContext(
            postId,
            actorDid,
            dependencies(
                { postType: type, parentItemType: type, parentItemId: sourceId },
                {
                    source: { _id: sourceId, commentPostId: postId },
                    authorize: (module) => ((authorizedModule = module), true),
                },
            ),
        );
        assert.equal(allowed?.route.kind, "generic");
        assert.equal(authorizedModule, expectedModule);
    }

    const mismatch = await resolveCommentCreateContext(
        postId,
        actorDid,
        dependencies(
            { postType: "task", parentItemType: "task", parentItemId: sourceId },
            { source: { _id: sourceId, commentPostId: new ObjectId().toHexString() } },
        ),
    );
    assert.equal(mismatch, null);
});

test("paused circles and canonically unreadable targets fail closed before feature authorization", async () => {
    let authorizationCalls = 0;
    const paused = await resolveCommentCreateContext(
        postId,
        actorDid,
        dependencies({}, { circle: { moderationStatus: "paused" }, authorize: () => (authorizationCalls++, true) }),
    );
    assert.equal(paused, null);
    assert.equal(authorizationCalls, 0);
    assert.equal(await resolveCommentCreateContext(postId, actorDid, dependencies({}, { readable: false })), null);
});

test("Event alternate targets require exact backlink and route to the existing Event seam", async () => {
    const event = { _id: sourceId, commentPostId: postId, circleId } as Event;
    const allowed = await resolveCommentCreateContext(
        postId,
        actorDid,
        dependencies({ postType: "event", parentItemType: "event", parentItemId: sourceId }, { source: event }),
    );
    assert.equal(allowed?.route.kind, "event");

    const mismatch = await resolveCommentCreateContext(
        postId,
        actorDid,
        dependencies(
            { postType: "discussion", parentItemType: "event", parentItemId: sourceId },
            { source: { ...event, commentPostId: new ObjectId().toHexString() } },
        ),
    );
    assert.equal(mismatch, null);

    const calls: string[] = [];
    const result = await orchestrateCommentCreate({
        postId,
        actorDid,
        resolveContext: async () => allowed,
        executeGeneric: async () => (calls.push("generic"), "generic"),
        executeDiscussion: async () => (calls.push("discussion"), "discussion"),
        executeEvent: async () => (calls.push("event"), "event"),
    });
    assert.deepEqual(calls, ["event"]);
    assert.deepEqual(result, { ok: true, value: "event" });
});

test("Discussion targets route only to the dedicated Discussion seam", async () => {
    const discussion = await resolveCommentCreateContext(postId, actorDid, dependencies({ postType: "discussion" }));
    const calls: string[] = [];
    await orchestrateCommentCreate({
        postId,
        actorDid,
        resolveContext: async () => discussion,
        executeGeneric: async () => (calls.push("generic"), undefined),
        executeDiscussion: async () => (calls.push("discussion"), undefined),
        executeEvent: async () => (calls.push("event"), undefined),
    });
    assert.deepEqual(calls, ["discussion"]);
});

test("denied targets execute no mutation route and return the neutral message", async () => {
    let effects = 0;
    const result = await orchestrateCommentCreate({
        postId,
        actorDid,
        resolveContext: async () => null,
        executeGeneric: async () => effects++,
        executeDiscussion: async () => effects++,
        executeEvent: async () => effects++,
    });
    assert.equal(effects, 0);
    assert.deepEqual(result, { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
});

type SourceType = "task" | "goal" | "issue" | "proposal" | "event" | "funding";
type EffectCounts = {
    insert: number;
    postComments: number;
    lastActivity: number;
    parentReplies: number;
    highlight: number;
    notification: number;
    mentionResolver: number;
    mentionNotification: number;
    sourceMutation: number;
    vector: number;
    revalidation: number;
    parentLookup: number;
    genericRoute: number;
    discussionRoute: number;
    eventRoute: number;
    eventReload: number;
};

const emptyEffects = (): EffectCounts => ({
    insert: 0,
    postComments: 0,
    lastActivity: 0,
    parentReplies: 0,
    highlight: 0,
    notification: 0,
    mentionResolver: 0,
    mentionNotification: 0,
    sourceMutation: 0,
    vector: 0,
    revalidation: 0,
    parentLookup: 0,
    genericRoute: 0,
    discussionRoute: 0,
    eventRoute: 0,
    eventReload: 0,
});

const mutationKeys: Array<keyof EffectCounts> = [
    "insert",
    "postComments",
    "lastActivity",
    "parentReplies",
    "highlight",
    "notification",
    "mentionResolver",
    "mentionNotification",
    "sourceMutation",
    "vector",
    "revalidation",
    "parentLookup",
    "genericRoute",
    "discussionRoute",
    "eventRoute",
];

function assertZeroEffects(effects: EffectCounts, message?: string) {
    for (const key of mutationKeys) assert.equal(effects[key], 0, `${message ?? "denial"}: ${key}`);
}

function productionHarness(
    options: {
        visibility?: "public" | "secret";
        moderationStatus?: "active" | "paused" | "suspended" | "removed";
        circleType?: "circle" | "user";
        post?: Partial<Post>;
        memberDids?: string[];
        author?: Circle | null;
        featureAllowed?: (module: string, handle: string) => boolean;
        source?: Record<string, unknown> | null;
        sourceType?: SourceType;
        extraCircles?: Circle[];
        extraMemberships?: Member[];
        parent?: Pick<Comment, "_id" | "postId" | "isDeleted"> | null;
        discussionClosed?: boolean;
    } = {},
) {
    const ids = {
        post: new ObjectId().toHexString(),
        feed: new ObjectId().toHexString(),
        circle: new ObjectId().toHexString(),
        source: new ObjectId().toHexString(),
        parent: new ObjectId().toHexString(),
    };
    const actor = "did:example:member";
    const post = {
        _id: new ObjectId(ids.post),
        feedId: ids.feed,
        postType: "post",
        createdBy: "did:example:author",
        createdAt: new Date(),
        content: "post",
        userGroups: ["everyone"],
        reactions: {},
        comments: 0,
        ...options.post,
    } as Post;
    const feed = {
        _id: new ObjectId(ids.feed),
        circleId: ids.circle,
        handle: "default",
        userGroups: ["everyone"],
    } as Feed;
    const owner = {
        _id: new ObjectId(ids.circle),
        did: "did:circle:owner",
        circleType: options.circleType ?? "circle",
        visibility: options.visibility ?? "public",
        moderationStatus: options.moderationStatus ?? "active",
        enabledModules: ["feed", "community", "discussions", "tasks", "goals", "issues", "proposals"],
    } as Circle;
    const author =
        options.author === undefined
            ? ({ did: post.createdBy, circleType: "user", isVerified: true } as Circle)
            : options.author;
    const circles = new Map<string, Circle>([[ids.circle, owner]]);
    for (const item of options.extraCircles ?? []) circles.set(String(item._id), item);
    const memberships = new Map<string, Member>();
    for (const did of options.memberDids ?? []) {
        memberships.set(`${did}:${ids.circle}`, {
            userDid: did,
            circleId: ids.circle,
            userGroups: ["members"],
        } as Member);
    }
    for (const item of options.extraMemberships ?? []) memberships.set(`${item.userDid}:${item.circleId}`, item);
    const sourceType = options.sourceType;
    const sources = new Map<string, Record<string, unknown>>();
    if (sourceType && options.source) sources.set(`${sourceType}:${ids.source}`, options.source);
    const comments = new Map<string, Pick<Comment, "_id" | "postId" | "isDeleted">>();
    if (options.parent !== null) {
        const parent =
            options.parent ?? ({ _id: new ObjectId(ids.parent), postId: ids.post, isDeleted: false } as const);
        comments.set(String(parent._id), parent);
    }
    const effects = emptyEffects();
    let currentEvent = sourceType === "event" ? (options.source as Event | null) : null;

    const findSource = async (type: SourceType, id: ObjectId) => sources.get(`${type}:${id.toHexString()}`) ?? null;
    const findMember = async (did: string, targetCircleId: string) =>
        memberships.get(`${did}:${targetCircleId}`) ?? null;
    const resolvePost = (id: string, did?: string) =>
        resolveReadablePostContext(id, did, {
            findPost: async (requested: ObjectId) => (requested.toHexString() === String(post._id) ? post : null),
            findFeed: async (requested: ObjectId) => (requested.toHexString() === String(feed._id) ? feed : null),
            findCircle: async (requested: ObjectId) => circles.get(requested.toHexString()) ?? null,
            findMember,
            findAuthor: async (didToFind: string) => (didToFind === post.createdBy ? author : null),
            authorizeFeature: async (_did: string | undefined, _circleId: string, targetPost: Post) =>
                options.featureAllowed?.(
                    targetPost.postType === "discussion"
                        ? "discussions"
                        : targetPost.postType === "community"
                          ? "community"
                          : "feed",
                    "view",
                ) ?? true,
            canReadSource: (targetPost: Post, viewerDid?: string) =>
                canReadPostSource(targetPost, viewerDid, {
                    findSource: (type, idToFind) => findSource(type, idToFind) as never,
                    findCircles: async (requested) =>
                        requested.map((id) => circles.get(id.toHexString())).filter(Boolean) as Circle[],
                    canReadOwner: async (viewerDidToCheck, sourceOwner) => {
                        if (["suspended", "removed"].includes(sourceOwner.moderationStatus ?? "active")) return false;
                        if (sourceOwner.circleType === "user" || sourceOwner.visibility !== "secret") return true;
                        return Boolean(
                            viewerDidToCheck && (await findMember(viewerDidToCheck, String(sourceOwner._id))),
                        );
                    },
                }),
        } as never);
    const resolveCreate = (id: string, did: string) =>
        resolveCommentCreateContext(id, did, {
            resolveReadableContext: resolvePost,
            canWriteCircle: canWriteCircleByLifecycle,
            findSource: (type, sourceObjectId) => findSource(type, sourceObjectId) as never,
            authorizeFeature: async (_did, _circleId, feature) =>
                options.featureAllowed?.(feature.module, feature.handle) ?? true,
        });
    const findParent = async (id: ObjectId) => {
        effects.parentLookup += 1;
        return comments.get(id.toHexString()) ?? null;
    };
    const canonicalize = async (content: string) => {
        effects.mentionResolver += 1;
        return {
            ok: true as const,
            content,
            mentions: content.includes("mention") ? [{ type: "circle" as const, id: ids.circle }] : [],
        };
    };
    const insertDedicated = async (comment: Comment) => {
        effects.insert += 1;
        return { insertedId: new ObjectId() };
    };

    const create = async (
        input: {
            did?: string;
            postId?: string;
            parentCommentId?: string | null;
            content?: string;
            beforeEventMutation?: () => void;
        } = {},
    ) =>
        orchestrateCommentCreate<unknown>({
            postId: input.postId ?? ids.post,
            actorDid: input.did ?? actor,
            resolveContext: resolveCreate,
            executeGeneric: async (context) => {
                effects.genericRoute += 1;
                const result = await orchestrateAuthoredCommentCreate({
                    postId: context.normalizedPostId,
                    parentCommentId: input.parentCommentId,
                    content: input.content ?? "comment",
                    writerDid: input.did ?? actor,
                    dependencies: {
                        canonicalize,
                        findParentComment: findParent,
                        insert: async (prepared) => {
                            effects.insert += 1;
                            effects.postComments += 1;
                            effects.lastActivity += 1;
                            if (!prepared.parentCommentId) effects.highlight += 1;
                            return { _id: new ObjectId().toHexString(), ...prepared };
                        },
                        incrementParentReplies: async () => {
                            effects.parentReplies += 1;
                        },
                        notify: async (_created, prepared) => {
                            effects.notification += 1;
                            if (prepared.mentions.length) effects.mentionNotification += 1;
                        },
                    },
                });
                return result.inserted;
            },
            executeDiscussion: async (context) => {
                effects.discussionRoute += 1;
                return addCommentToDiscussionWithDependencies(
                    context.normalizedPostId,
                    {
                        content: input.content ?? "comment",
                        parentCommentId: input.parentCommentId,
                        createdBy: input.did ?? actor,
                    },
                    {
                        findDiscussion: async () => ({ closed: options.discussionClosed }),
                        insertComment: insertDedicated,
                        incrementParentReplies: async () => {
                            effects.parentReplies += 1;
                        },
                        updateLastActivity: async () => {
                            effects.lastActivity += 1;
                        },
                        now: () => new Date(),
                        prepareComment: (preparedInput) =>
                            prepareAuthoredComment({
                                ...preparedInput,
                                dependencies: { ...preparedInput.dependencies, canonicalize },
                            }),
                        findParentComment: findParent,
                    },
                );
            },
            executeEvent: async (_context, classifiedEvent) => {
                effects.eventRoute += 1;
                input.beforeEventMutation?.();
                return addEventCommentWithDependencies(
                    String(classifiedEvent._id),
                    {
                        content: input.content ?? "comment",
                        parentCommentId: input.parentCommentId,
                    },
                    input.did ?? actor,
                    {
                        findEvent: async () => {
                            effects.eventReload += 1;
                            return currentEvent;
                        },
                        resolvePost,
                        assertHostsWritable: (eventToCheck) =>
                            assertEventHostCirclesWritable(eventToCheck, async (id) => {
                                const target = circles.get(id);
                                if (!target || !canWriteCircleByLifecycle(target)) throw new Error("unavailable");
                            }),
                        authorizeComment: async (_did, _circleId) => true,
                        createComment: async (targetPostId, prepared, createdBy, dependencies) =>
                            (await import("./discussion-comment-create")).createCommentForAuthorizedPost(
                                targetPostId,
                                prepared,
                                createdBy,
                                dependencies,
                            ),
                        createDependencies: {
                            insertComment: insertDedicated,
                            incrementParentReplies: async () => {
                                effects.parentReplies += 1;
                            },
                            now: () => new Date(),
                        },
                        prepareComment: (preparedInput) =>
                            prepareAuthoredComment({
                                ...preparedInput,
                                dependencies: { ...preparedInput.dependencies, canonicalize },
                            }),
                        findParentComment: findParent,
                        sanitizeComments: async (items) => [...items],
                    },
                );
            },
        });

    return {
        ids,
        actor,
        post,
        feed,
        owner,
        circles,
        memberships,
        sources,
        comments,
        effects,
        create,
        setCurrentEvent: (event: Event | null) => {
            currentEvent = event;
            if (event) sources.set(`event:${String(event._id)}`, event as never);
        },
    };
}

test("production orchestration enforces the Secret actor matrix before parent or mentions", async () => {
    for (const did of [
        "did:former-member",
        "did:outsider",
        "did:superadmin-nonmember",
        "did:circle-admin-nonmember",
        "did:moderator-nonmember",
    ]) {
        const harness = productionHarness({ visibility: "secret" });
        const result = await harness.create({ did, parentCommentId: harness.ids.parent, content: "mention" });
        assert.deepEqual(result, { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
        assertZeroEffects(harness.effects, did);
    }
    for (const reply of [false, true]) {
        const harness = productionHarness({ visibility: "secret", memberDids: ["did:member"] });
        const result = await harness.create({ did: "did:member", parentCommentId: reply ? harness.ids.parent : null });
        assert.equal(result.ok, true);
        assert.equal(harness.effects.insert, 1);
        assert.equal(harness.effects.parentReplies, reply ? 1 : 0);
    }
});

test("production orchestration denies current access loss, user-group exclusion, and unavailable authors", async () => {
    const scenarios = [
        productionHarness({ visibility: "secret" }),
        productionHarness({ post: { userGroups: ["restricted"] } }),
        productionHarness({ author: null }),
        productionHarness({ author: { did: "did:example:author", isVerified: false, isMember: false } as Circle }),
    ];
    for (const harness of scenarios) {
        for (const parentCommentId of [null, harness.ids.parent]) {
            const result = await harness.create({ parentCommentId, content: "mention" });
            assert.deepEqual(result, { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
            assertZeroEffects(harness.effects);
        }
    }
});

test("production orchestration applies the complete owning-Circle lifecycle matrix", async () => {
    for (const status of ["active", "paused", "suspended", "removed"] as const) {
        const harness = productionHarness({ moderationStatus: status });
        const result = await harness.create();
        assert.equal(result.ok, status === "active");
        if (status !== "active") assertZeroEffects(harness.effects, status);
    }
    const missing = productionHarness();
    missing.circles.clear();
    assert.deepEqual(await missing.create(), { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
    assertZeroEffects(missing.effects);
    const profile = productionHarness({ circleType: "user", moderationStatus: "removed" });
    assert.equal((await profile.create()).ok, true, "user/profile Circle compatibility remains central-helper based");
});

test("production orchestration neutrally denies malformed and missing canonical records", async () => {
    const malformedPost = productionHarness();
    assert.deepEqual(await malformedPost.create({ postId: "malformed" }), {
        ok: false,
        message: COMMENT_CREATE_UNAVAILABLE_MESSAGE,
    });
    assertZeroEffects(malformedPost.effects);
    const missingPost = productionHarness();
    assert.deepEqual(await missingPost.create({ postId: new ObjectId().toHexString() }), {
        ok: false,
        message: COMMENT_CREATE_UNAVAILABLE_MESSAGE,
    });
    assertZeroEffects(missingPost.effects);
    for (const postOverrides of [{ feedId: "malformed" }, { feedId: new ObjectId().toHexString() }]) {
        const harness = productionHarness({ post: postOverrides });
        assert.deepEqual(await harness.create(), { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
        assertZeroEffects(harness.effects);
    }
});

test("production generic parent ordering, tombstone compatibility, and exact side effects are preserved", async () => {
    const top = productionHarness();
    assert.equal((await top.create({ content: "mention" })).ok, true);
    assert.deepEqual(
        {
            insert: top.effects.insert,
            postComments: top.effects.postComments,
            lastActivity: top.effects.lastActivity,
            highlight: top.effects.highlight,
            notification: top.effects.notification,
            mentionResolver: top.effects.mentionResolver,
            mentionNotification: top.effects.mentionNotification,
            genericRoute: top.effects.genericRoute,
        },
        {
            insert: 1,
            postComments: 1,
            lastActivity: 1,
            highlight: 1,
            notification: 1,
            mentionResolver: 1,
            mentionNotification: 1,
            genericRoute: 1,
        },
    );
    for (const parent of ["malformed", new ObjectId().toHexString()]) {
        const denied = productionHarness();
        assert.deepEqual(await denied.create({ parentCommentId: parent, content: "mention" }), {
            ok: false,
            message: COMMENT_CREATE_UNAVAILABLE_MESSAGE,
        });
        assert.equal(denied.effects.mentionResolver, 0);
        assert.equal(denied.effects.insert, 0);
    }
    const cross = productionHarness({ parent: { _id: new ObjectId(), postId: new ObjectId().toHexString() } });
    assert.deepEqual(
        await cross.create({ parentCommentId: String([...cross.comments.values()][0]._id), content: "mention" }),
        {
            ok: false,
            message: COMMENT_CREATE_UNAVAILABLE_MESSAGE,
        },
    );
    assert.equal(cross.effects.mentionResolver, 0);
    const tombstone = productionHarness({ parent: { _id: new ObjectId(), postId: "", isDeleted: true } });
    const tombstoneParent = [...tombstone.comments.values()][0];
    tombstoneParent.postId = tombstone.ids.post;
    assert.equal((await tombstone.create({ parentCommentId: String(tombstoneParent._id) })).ok, true);
    assert.equal(tombstone.effects.parentReplies, 1, "soft-deleted-parent behavior remains unchanged/deferred");
});

test("production source-detail mapping/backlinks and noticeboard compatibility remain distinct", async () => {
    for (const [type, module] of [
        ["task", "tasks"],
        ["goal", "goals"],
        ["issue", "issues"],
        ["proposal", "feed"],
    ] as const) {
        let authorizedModule = "";
        const source = { _id: sourceId, circleId, commentPostId: postId };
        const allowed = productionHarness({
            post: { postType: type, parentItemType: type, parentItemId: sourceId },
            sourceType: type,
            source,
            featureAllowed: (candidate) => ((authorizedModule = candidate), true),
        });
        Object.assign(source, {
            _id: allowed.ids.source,
            circleId: allowed.ids.circle,
            commentPostId: allowed.ids.post,
        });
        Object.assign(allowed.post, { parentItemId: allowed.ids.source });
        allowed.sources.clear();
        allowed.sources.set(`${type}:${allowed.ids.source}`, source);
        assert.equal((await allowed.create({ parentCommentId: type === "task" ? allowed.ids.parent : null })).ok, true);
        assert.equal(authorizedModule, module);
        const mismatch = productionHarness({
            post: { postType: type, parentItemType: type, parentItemId: sourceId },
            sourceType: type,
            source: { _id: sourceId, circleId, commentPostId: new ObjectId().toHexString() },
        });
        Object.assign(mismatch.post, { parentItemId: mismatch.ids.source });
        mismatch.sources.clear();
        mismatch.sources.set(`${type}:${mismatch.ids.source}`, {
            _id: mismatch.ids.source,
            circleId: mismatch.ids.circle,
            commentPostId: new ObjectId().toHexString(),
        });
        assert.deepEqual(await mismatch.create(), { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
        assertZeroEffects(mismatch.effects);
        const missingSource = productionHarness({
            post: { postType: type, parentItemType: type, parentItemId: new ObjectId().toHexString() },
        });
        assert.deepEqual(await missingSource.create(), { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
        assertZeroEffects(missingSource.effects);
    }
    for (const marker of [
        { sourceResourceType: "funding" as const, sourceResourceId: sourceId },
        { parentItemType: "task" as const, parentItemId: sourceId },
    ]) {
        const type = "sourceResourceType" in marker ? "funding" : "task";
        const noticeboard = productionHarness({ post: { postType: "post", ...marker }, sourceType: type, source: {} });
        const source = { _id: noticeboard.ids.source, circleId: noticeboard.ids.circle };
        Object.assign(
            noticeboard.post,
            "sourceResourceType" in marker
                ? { sourceResourceId: noticeboard.ids.source }
                : { parentItemId: noticeboard.ids.source },
        );
        noticeboard.sources.clear();
        noticeboard.sources.set(`${type}:${noticeboard.ids.source}`, source);
        assert.equal((await noticeboard.create()).ok, true);
        assert.equal(noticeboard.effects.genericRoute, 1);
    }
});

test("production Discussion routing is closed-aware and exactly-once", async () => {
    for (const [closed, reply] of [
        [false, false],
        [false, true],
        [true, false],
        [true, true],
    ] as const) {
        const harness = productionHarness({
            post: { postType: "discussion", pinned: !closed },
            discussionClosed: closed,
        });
        const result = await harness.create({ parentCommentId: reply ? harness.ids.parent : null });
        assert.equal(result.ok, !closed);
        assert.equal(harness.effects.genericRoute, 0);
        assert.equal(harness.effects.insert, closed ? 0 : 1);
        if (closed) assert.equal(result.ok ? "" : result.message, COMMENT_CREATE_UNAVAILABLE_MESSAGE);
    }
    const secret = productionHarness({
        post: { postType: "discussion" },
        visibility: "secret",
        memberDids: ["did:member"],
    });
    assert.equal((await secret.create({ did: "did:member" })).ok, true);
    const outsider = productionHarness({ post: { postType: "discussion" }, visibility: "secret" });
    assert.deepEqual(await outsider.create({ did: "did:outsider" }), {
        ok: false,
        message: COMMENT_CREATE_UNAVAILABLE_MESSAGE,
    });
    assertZeroEffects(outsider.effects);
});

test("production Event routing reloads fresh state, enforces hosts, and never double-mutates", async () => {
    const setup = (extraHost?: Circle) => {
        const eventId = new ObjectId().toHexString();
        const harness = productionHarness({
            post: { postType: "event", parentItemType: "event", parentItemId: eventId },
            sourceType: "event",
            source: {},
            extraCircles: extraHost ? [extraHost] : [],
        });
        const event = {
            _id: eventId,
            circleId: harness.ids.circle,
            commentPostId: harness.ids.post,
            hostCircleIds: extraHost ? [String(extraHost._id)] : [],
        } as Event;
        harness.sources.clear();
        harness.sources.set(`event:${eventId}`, event as never);
        harness.setCurrentEvent(event);
        return { harness, event };
    };
    for (const reply of [false, true]) {
        const { harness } = setup();
        const result = await harness.create({ parentCommentId: reply ? harness.ids.parent : null, content: "mention" });
        assert.equal(result.ok, true);
        assert.equal(harness.effects.eventReload, 1);
        assert.equal(harness.effects.eventRoute, 1);
        assert.equal(harness.effects.genericRoute, 0);
        assert.equal(harness.effects.insert, 1);
    }
    for (const mutate of [
        (event: Event) => ({ ...event, commentPostId: new ObjectId().toHexString() }),
        (event: Event) => ({ ...event, circleId: new ObjectId().toHexString() }),
        (event: Event) => ({ ...event, hostCircleIds: [new ObjectId().toHexString()] }),
    ]) {
        const { harness, event } = setup();
        const result = await harness.create({
            beforeEventMutation: () => harness.setCurrentEvent(mutate(event) as Event),
        });
        assert.deepEqual(result, { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
        assert.equal(harness.effects.eventReload, 1, "the strict mutation seam must reload current Event state");
        assert.equal(harness.effects.insert, 0);
        assert.equal(harness.effects.genericRoute, 0);
    }
    for (const status of ["paused", "suspended", "removed"] as const) {
        const host = {
            _id: new ObjectId(),
            visibility: "public",
            moderationStatus: status,
            circleType: "circle",
        } as Circle;
        const { harness } = setup(host);
        const result = await harness.create();
        assert.deepEqual(result, { ok: false, message: COMMENT_CREATE_UNAVAILABLE_MESSAGE });
        assert.equal(harness.effects.eventReload, status === "paused" ? 1 : 0);
        assert.equal(harness.effects.insert, 0);
    }
});

test("production Event noticeboards remain generic when a secondary host is paused but readable", async () => {
    const secondary = {
        _id: new ObjectId(),
        visibility: "public",
        moderationStatus: "paused",
        circleType: "circle",
    } as Circle;
    const eventId = new ObjectId().toHexString();
    const harness = productionHarness({
        post: { postType: "post", parentItemType: "event", parentItemId: eventId },
        sourceType: "event",
        source: {},
        extraCircles: [secondary],
    });
    const event = {
        _id: eventId,
        circleId: harness.ids.circle,
        commentPostId: new ObjectId().toHexString(),
        hostCircleIds: [String(secondary._id)],
    } as Event;
    harness.sources.clear();
    harness.sources.set(`event:${eventId}`, event as never);
    assert.equal((await harness.create()).ok, true);
    assert.equal(harness.effects.genericRoute, 1);
    assert.equal(harness.effects.eventRoute, 0);
    assert.equal(harness.effects.insert, 1);
});
