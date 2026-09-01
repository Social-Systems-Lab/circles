import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import type { Circle, Comment, Event, Feature, Feed, Member, Post } from "@/models/models";
import { features } from "./constants";
import {
    COMMENT_DELETE_UNAVAILABLE_MESSAGE,
    commentReactionCleanupFilter,
    orchestrateCommentDelete,
    parentRepliesDecrementFilter,
    postCommentsDecrementFilter,
    type CommentDeletePersistence,
} from "./comment-delete-access-policy";
import type { CommentMutationContext } from "./comment-edit-access-policy";
import { resolveCommentMutationContext, type CommentMutationDependencies } from "./comment-edit-access-policy";
import { resolveReadablePostContext } from "./post-access-policy";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { canReadCircle } from "./circle-visibility-policy";
import { canReadEventOwners, canReadPostSource } from "./post-source-access-policy";
import { assertEventHostCirclesWritable } from "./event-alternate-comment-policy";

const ids = { comment: new ObjectId(), post: new ObjectId(), feed: new ObjectId(), circle: new ObjectId() };
const author = "did:example:author";

const context = (
    changes: {
        comment?: Partial<Comment>;
        post?: Partial<Post>;
        route?: CommentMutationContext["route"];
    } = {},
): CommentMutationContext => ({
    comment: {
        _id: ids.comment.toHexString(),
        postId: ids.post.toHexString(),
        parentCommentId: null,
        createdBy: author,
        createdAt: new Date(),
        content: "comment",
        mentions: [{ type: "circle", id: ids.circle.toHexString() }],
        reactions: { like: 2 },
        replies: 0,
        ...changes.comment,
    } as Comment,
    post: {
        _id: ids.post,
        feedId: ids.feed.toHexString(),
        postType: "post",
        createdBy: author,
        createdAt: new Date(),
        content: "post",
        reactions: {},
        comments: 1,
        userGroups: ["everyone"],
        ...changes.post,
    } as Post,
    feed: { _id: ids.feed, circleId: ids.circle.toHexString() } as Feed,
    circle: { _id: ids.circle, visibility: "public", moderationStatus: "active" } as Circle,
    normalizedCommentId: ids.comment.toHexString(),
    normalizedPostId: ids.post.toHexString(),
    route: changes.route ?? { kind: "generic" },
    commentFeature: features.feed.comment,
});

type Effects = Record<
    "child" | "validateParent" | "hard" | "tombstone" | "reactions" | "post" | "parent" | "highlight",
    number
>;
const persistence = (
    options: {
        child?: boolean;
        parentValid?: boolean;
        hardWins?: boolean;
        tombstoneWins?: boolean;
        throws?: Partial<Record<"reactions" | "post" | "parent" | "highlight", boolean>>;
    } = {},
) => {
    const order: Array<"reactions" | "post" | "parent" | "highlight"> = [];
    const effects: Effects = {
        child: 0,
        validateParent: 0,
        hard: 0,
        tombstone: 0,
        reactions: 0,
        post: 0,
        parent: 0,
        highlight: 0,
    };
    const effect = async (key: "reactions" | "post" | "parent" | "highlight") => {
        order.push(key);
        effects[key]++;
        if (options.throws?.[key]) throw new Error(`${key} failed`);
    };
    const value: CommentDeletePersistence = {
        hasChild: async () => (effects.child++, options.child ?? false),
        validateParent: async () => (effects.validateParent++, options.parentValid ?? true),
        hardDelete: async () => (effects.hard++, options.hardWins ?? true),
        tombstone: async () => (effects.tombstone++, options.tombstoneWins ?? true),
        cleanupReactions: async () => effect("reactions"),
        decrementPostComments: async () => effect("post"),
        decrementParentReplies: async () => effect("parent"),
        refreshHighlight: async () => effect("highlight"),
    };
    return { value, effects, order };
};

const run = async (
    ctx: CommentMutationContext | null,
    store: ReturnType<typeof persistence>,
    options: {
        actor?: string;
        features?: Feature[];
        event?: Event | null;
        hostsReadable?: boolean;
        hostsWritable?: boolean;
        failures?: Array<string>;
    } = {},
) =>
    orchestrateCommentDelete({
        commentId: ids.comment.toHexString(),
        actorDid: options.actor ?? author,
        resolveContext: async () => ctx,
        authorizationDependencies: {
            authorizeFeature: async (_did, _circle, feature) => {
                const allowed: Feature[] = options.features ?? [features.feed.comment];
                return allowed.includes(feature);
            },
            findCurrentEvent: async () => options.event ?? null,
            canReadCurrentEventHosts: async () => options.hostsReadable ?? true,
            assertEventHostsWritable: async () => {
                if (options.hostsWritable === false) throw new Error("unwritable");
            },
        },
        persistence: store.value,
        onDerivedEffectError: (effect) => options.failures?.push(effect),
    });

test("actual child existence, not cached replies, selects tombstone and clears identity-bearing fields", async () => {
    const store = persistence({ child: true });
    const result = await run(context({ comment: { replies: 0 } }), store);
    assert.equal(result.ok && result.disposition, "tombstone");
    assert.deepEqual(result.ok && result.comment?.mentions, []);
    assert.equal(result.ok && result.comment?.createdBy, "anonymous");
    assert.deepEqual(store.effects, {
        child: 1,
        validateParent: 0,
        hard: 0,
        tombstone: 1,
        reactions: 1,
        post: 0,
        parent: 0,
        highlight: 1,
    });
});

test("cached replies do not prevent a leaf hard-delete; generic counters and parent are conditional effects", async () => {
    const store = persistence();
    const result = await run(
        context({ comment: { replies: 9, parentCommentId: new ObjectId().toHexString() } }),
        store,
    );
    assert.equal(result.ok && result.disposition, "hard-delete");
    assert.deepEqual(store.effects, {
        child: 1,
        validateParent: 1,
        hard: 1,
        tombstone: 0,
        reactions: 1,
        post: 1,
        parent: 1,
        highlight: 0,
    });
});

test("Discussion and Event alternate hard deletes never decrement Post.comments", async () => {
    for (const target of [
        { route: { kind: "discussion" } as const, postType: "discussion" as const },
        {
            route: { kind: "event", eventId: new ObjectId().toHexString(), event: {} as Event } as const,
            postType: "event" as const,
        },
        {
            route: { kind: "event", eventId: new ObjectId().toHexString(), event: {} as Event } as const,
            postType: "discussion" as const,
        },
    ]) {
        const store = persistence();
        const ctx = context({
            route: target.route,
            post: {
                postType: target.postType,
                ...(target.route.kind === "event"
                    ? { parentItemType: "event" as const, parentItemId: target.route.eventId }
                    : {}),
            },
        });
        const event =
            target.route.kind === "event"
                ? ({
                      _id: target.route.eventId,
                      commentPostId: ids.post.toHexString(),
                      circleId: ids.circle.toHexString(),
                      hostCircleIds: [],
                  } as unknown as Event)
                : undefined;
        const result = await run(ctx, store, { event });
        assert.equal(result.ok, true);
        assert.equal(store.effects.post, 0);
    }
});

test("only a winning conditional mutation triggers cleanup, counters, and highlight", async () => {
    const leaf = persistence({ hardWins: false });
    assert.deepEqual(await run(context(), leaf), { ok: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE });
    assert.deepEqual(leaf.effects, {
        child: 1,
        validateParent: 0,
        hard: 1,
        tombstone: 0,
        reactions: 0,
        post: 0,
        parent: 0,
        highlight: 0,
    });

    const parent = persistence({ child: true, tombstoneWins: false });
    const result = await run(context(), parent);
    assert.equal(result.ok && result.disposition, "already-deleted");
    assert.equal(parent.effects.reactions, 0);
    assert.equal(parent.effects.highlight, 0);
});

test("authorized moderator can repeat a tombstone without child routing; anonymized former author cannot", async () => {
    const tombstone = context({ comment: { isDeleted: true, createdBy: "anonymous" } });
    for (const child of [false, true]) {
        const moderatorStore = persistence({ child });
        const moderator = await run(tombstone, moderatorStore, {
            actor: "did:example:moderator",
            features: [features.feed.moderate],
        });
        assert.equal(moderator.ok && moderator.disposition, "already-deleted");
        assert.deepEqual(moderator.ok && moderator.comment, {
            ...tombstone.comment,
            content: "",
            createdBy: "anonymous",
            reactions: {},
            mentions: [],
            isDeleted: true,
        });
        assert.deepEqual(moderatorStore.effects, {
            child: 0,
            validateParent: 0,
            hard: 0,
            tombstone: 0,
            reactions: 0,
            post: 0,
            parent: 0,
            highlight: 0,
        });
    }

    const authorStore = persistence({ child: true });
    assert.deepEqual(await run(tombstone, authorStore), { ok: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE });
    assert.equal(authorStore.effects.child, 0);
});

test("canonical denial and feature denial have zero persistence effects", async () => {
    for (const [ctx, options] of [
        [null, {}],
        [context(), { features: [] as Feature[] }],
    ] as const) {
        const store = persistence();
        assert.deepEqual(await run(ctx, store, options), { ok: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE });
        assert.deepEqual(store.effects, {
            child: 0,
            validateParent: 0,
            hard: 0,
            tombstone: 0,
            reactions: 0,
            post: 0,
            parent: 0,
            highlight: 0,
        });
    }
});

test("every hard-delete derived failure is captured without changing the winning disposition", async () => {
    for (const failed of ["reactions", "post", "parent", "highlight"] as const) {
        const failures: string[] = [];
        const store = persistence({ throws: { [failed]: true } });
        const ctx = context({
            comment: { parentCommentId: failed === "parent" ? new ObjectId().toHexString() : null },
        });
        const result = await run(ctx, store, { failures });
        assert.equal(result.ok && result.disposition, "hard-delete");
        assert.equal(store.effects.hard, 1);
        assert.deepEqual(failures, [
            failed === "post" ? "post-comments" : failed === "parent" ? "parent-replies" : failed,
        ]);
        assert.deepEqual(
            store.order,
            failed === "parent" ? ["reactions", "post", "parent"] : ["reactions", "post", "highlight"],
        );
        assert.deepEqual(store.effects, {
            child: 1,
            validateParent: failed === "parent" ? 1 : 0,
            hard: 1,
            tombstone: 0,
            reactions: 1,
            post: 1,
            parent: failed === "parent" ? 1 : 0,
            highlight: failed === "parent" ? 0 : 1,
        });
    }
});

test("early hard-delete cleanup failures still reach the applicable reply counter", async () => {
    for (const failed of ["reactions", "post"] as const) {
        const failures: string[] = [];
        const store = persistence({ throws: { [failed]: true } });
        const result = await run(context({ comment: { parentCommentId: new ObjectId().toHexString() } }), store, {
            failures,
        });
        assert.equal(result.ok && result.disposition, "hard-delete");
        assert.deepEqual(store.order, ["reactions", "post", "parent"]);
        assert.deepEqual(store.effects, {
            child: 1,
            validateParent: 1,
            hard: 1,
            tombstone: 0,
            reactions: 1,
            post: 1,
            parent: 1,
            highlight: 0,
        });
        assert.deepEqual(failures, [failed === "post" ? "post-comments" : failed]);
    }
});

test("every tombstone derived failure is captured without changing the winning disposition", async () => {
    for (const failed of ["reactions", "highlight"] as const) {
        const failures: string[] = [];
        const store = persistence({ child: true, throws: { [failed]: true } });
        const result = await run(context(), store, { failures });
        assert.equal(result.ok && result.disposition, "tombstone");
        assert.equal(store.effects.tombstone, 1);
        assert.deepEqual(failures, [failed]);
        assert.deepEqual(store.order, ["reactions", "highlight"]);
        assert.deepEqual(store.effects, {
            child: 1,
            validateParent: 0,
            hard: 0,
            tombstone: 1,
            reactions: 1,
            post: 0,
            parent: 0,
            highlight: 1,
        });
    }
});

test("malformed or missing parent fails closed before the primary hard delete", async () => {
    const malformed = persistence();
    assert.deepEqual(await run(context({ comment: { parentCommentId: "malformed" } }), malformed), {
        ok: false,
        message: COMMENT_DELETE_UNAVAILABLE_MESSAGE,
    });
    assert.equal(malformed.effects.hard, 0);
    const missing = persistence({ parentValid: false });
    assert.deepEqual(await run(context({ comment: { parentCommentId: new ObjectId().toHexString() } }), missing), {
        ok: false,
        message: COMMENT_DELETE_UNAVAILABLE_MESSAGE,
    });
    assert.equal(missing.effects.hard, 0);
});

type ProductionOptions = {
    actor?: string;
    authorDid?: string;
    moderatorDids?: string[];
    memberDids?: string[];
    memberGroups?: Record<string, string[]>;
    visibility?: Circle["visibility"];
    moderationStatus?: Circle["moderationStatus"];
    post?: Partial<Post>;
    author?: Circle | null;
    source?: Record<string, unknown> | null;
    sourceReadable?: boolean;
    freshEvent?: Event | null;
    extraCircles?: Circle[];
    extraMembers?: Member[];
};

const productionHarness = (options: ProductionOptions = {}) => {
    const actor = options.actor ?? author;
    const sourceId = ids.feed.toHexString();
    const comment = {
        _id: ids.comment,
        postId: ids.post.toHexString(),
        parentCommentId: null,
        createdBy: options.authorDid ?? author,
        createdAt: new Date(),
        content: "comment",
        mentions: [],
        reactions: {},
        replies: 0,
    } as Comment;
    const post = {
        _id: ids.post,
        feedId: ids.feed.toHexString(),
        postType: "post",
        createdBy: "did:example:post-author",
        createdAt: new Date(),
        content: "post",
        reactions: {},
        comments: 1,
        userGroups: ["everyone"],
        ...options.post,
    } as Post;
    const feed = { _id: ids.feed, circleId: ids.circle.toHexString(), handle: "default" } as Feed;
    const owner = {
        _id: ids.circle,
        did: "did:circle:owner",
        circleType: "circle",
        visibility: options.visibility ?? "public",
        moderationStatus: options.moderationStatus ?? "active",
        enabledModules: ["feed", "community", "discussions", "tasks", "goals", "issues", "proposals"],
    } as Circle;
    const circles = new Map<string, Circle>([[ids.circle.toHexString(), owner]]);
    for (const circle of options.extraCircles ?? []) circles.set(String(circle._id), circle);
    const members = new Map<string, Member>();
    for (const did of options.memberDids ?? [])
        members.set(`${did}:${ids.circle}`, {
            userDid: did,
            circleId: ids.circle.toHexString(),
            userGroups: options.memberGroups?.[did] ?? ["members"],
        } as Member);
    for (const member of options.extraMembers ?? []) members.set(`${member.userDid}:${member.circleId}`, member);
    const findMember = async (did: string, circleId: string) => members.get(`${did}:${circleId}`) ?? null;
    const findCircles = async (requested: ObjectId[]) =>
        requested.map((id) => circles.get(id.toHexString())).filter(Boolean) as Circle[];
    const canReadOwner = (did: string | undefined, circle: Circle) =>
        canReadCircle(did, circle, { getMember: findMember });
    const sourceType = post.parentItemType;
    const findSource = async (type: string, id: ObjectId) =>
        options.source && type === sourceType && id.toHexString() === sourceId ? options.source : null;
    const resolveReadableContext = (postId: string, did?: string) =>
        resolveReadablePostContext(postId, did, {
            findPost: async (id) => (id.equals(ids.post) ? post : null),
            findFeed: async (id) => (id.equals(ids.feed) ? feed : null),
            findCircle: async (id) => circles.get(id.toHexString()) ?? null,
            findMember,
            findAuthor: async () =>
                options.author === undefined
                    ? ({ did: post.createdBy, circleType: "user", isVerified: true } as Circle)
                    : options.author,
            authorizeFeature: async () => true,
            canReadSource: async (candidate, didToCheck) =>
                (options.sourceReadable ?? true) &&
                canReadPostSource(candidate, didToCheck, {
                    findSource: (type, id) => findSource(type, id) as never,
                    findCircles,
                    canReadOwner,
                }),
        });
    const dependencies: CommentMutationDependencies = {
        findComment: async (id) => (id.equals(ids.comment) ? comment : null),
        resolveReadableContext,
        canWriteCircle: canWriteCircleByLifecycle,
        findSource: (type, id) => findSource(type, id) as never,
    };
    const store = persistence();
    const authorizedFeatures: Feature[] = [];
    const result = orchestrateCommentDelete({
        commentId: ids.comment.toHexString(),
        actorDid: actor,
        resolveContext: (id, did) => resolveCommentMutationContext(id, did, dependencies),
        authorizationDependencies: {
            authorizeFeature: async (did, _circleId, feature) => (
                authorizedFeatures.push(feature),
                did === comment.createdBy ||
                    ((options.moderatorDids ?? []).includes(did) && feature.handle === "moderate")
            ),
            findCurrentEvent: async () => options.freshEvent ?? (options.source as Event | null),
            canReadCurrentEventHosts: (event, did) => canReadEventOwners(event, did, { findCircles, canReadOwner }),
            assertEventHostsWritable: (event) =>
                assertEventHostCirclesWritable(event, async (circleId) => {
                    const circle = circles.get(circleId);
                    if (!circle || !canWriteCircleByLifecycle(circle)) throw new Error("unwritable");
                }),
        },
        persistence: store.value,
    });
    return { result, effects: store.effects, actor, sourceId, authorizedFeatures };
};

const assertProductionDenied = async (options: ProductionOptions) => {
    const { result, effects } = productionHarness(options);
    assert.deepEqual(await result, { ok: false, message: COMMENT_DELETE_UNAVAILABLE_MESSAGE });
    assert.equal(effects.hard, 0);
    assert.equal(effects.tombstone, 0);
    assert.equal(effects.reactions, 0);
    assert.equal(effects.post, 0);
    assert.equal(effects.parent, 0);
    assert.equal(effects.highlight, 0);
};

test("production delete resolver enforces the Secret author/moderator and privileged nonmember matrix", async () => {
    assert.equal((await productionHarness({ visibility: "secret", memberDids: [author] }).result).ok, true);
    await assertProductionDenied({ visibility: "secret" });
    for (const actorDid of ["did:outsider", "did:admin", "did:superadmin", "did:moderator"])
        await assertProductionDenied({ actor: actorDid, visibility: "secret", moderatorDids: [actorDid] });
    const moderator = "did:moderator";
    assert.equal(
        (
            await productionHarness({
                actor: moderator,
                visibility: "secret",
                memberDids: [moderator],
                moderatorDids: [moderator],
            }).result
        ).ok,
        true,
    );
});

test("production delete resolver denies current target access loss with zero persistence", async () => {
    await assertProductionDenied({
        post: { userGroups: ["admins"] },
        memberDids: [author],
        memberGroups: { [author]: ["members"] },
    });
    await assertProductionDenied({ author: null });
    for (const moderationStatus of ["paused", "suspended", "removed"] as const)
        await assertProductionDenied({ moderationStatus });
    await assertProductionDenied({ sourceReadable: false });
});

test("production delete resolver enforces detail backlinks and semantic own features", async () => {
    for (const [type, expectedModule] of [
        ["task", "tasks"],
        ["goal", "goals"],
        ["issue", "issues"],
        ["proposal", "feed"],
    ] as const) {
        const source = { _id: ids.feed, commentPostId: ids.post.toHexString(), circleId: ids.circle.toHexString() };
        const allowed = productionHarness({
            post: { postType: type, parentItemType: type, parentItemId: ids.feed.toHexString() },
            source,
        });
        assert.equal((await allowed.result).ok, true);
        assert.equal(allowed.authorizedFeatures[0]?.module, expectedModule);
        await assertProductionDenied({
            post: { postType: type, parentItemType: type, parentItemId: ids.feed.toHexString() },
            source: { ...source, commentPostId: new ObjectId().toHexString() },
        });
    }
    await assertProductionDenied({
        post: { postType: "task", parentItemType: "task", parentItemId: ids.feed.toHexString() },
        source: null,
    });
    await assertProductionDenied({
        post: { postType: "task", parentItemType: "task", parentItemId: ids.feed.toHexString() },
        source: { _id: ids.feed, commentPostId: ids.post.toHexString(), circleId: ids.circle.toHexString() },
        sourceReadable: false,
    });
});

test("production Discussion deletion remains current-access based for open and closed Comments", async () => {
    for (const discussionState of ["open", "closed"])
        assert.equal(
            (await productionHarness({ post: { postType: "discussion", discussionState } as Partial<Post> }).result).ok,
            true,
        );
    const moderator = "did:moderator";
    assert.equal(
        (
            await productionHarness({ actor: moderator, post: { postType: "discussion" }, moderatorDids: [moderator] })
                .result
        ).ok,
        true,
    );
    await assertProductionDenied({ actor: "did:outsider", visibility: "secret", post: { postType: "discussion" } });
});

test("production Event alternate deletion reloads and rejects stale current state and hosts", async () => {
    const hostId = new ObjectId().toHexString();
    const host = (visibility: Circle["visibility"], moderationStatus: Circle["moderationStatus"]) =>
        ({
            _id: new ObjectId(hostId),
            circleType: "circle",
            visibility,
            moderationStatus,
        }) as Circle;
    const initial = {
        _id: ids.feed,
        circleId: ids.circle.toHexString(),
        commentPostId: ids.post.toHexString(),
        hostCircleIds: [],
    } as unknown as Event;
    const post = { postType: "event" as const, parentItemType: "event" as const, parentItemId: ids.feed.toHexString() };
    assert.equal((await productionHarness({ post, source: initial, freshEvent: initial }).result).ok, true);
    await assertProductionDenied({
        post,
        source: initial,
        freshEvent: { ...initial, commentPostId: new ObjectId().toHexString() },
    });
    await assertProductionDenied({
        post,
        source: initial,
        freshEvent: { ...initial, circleId: new ObjectId().toHexString() },
    });
    await assertProductionDenied({
        post,
        source: initial,
        freshEvent: { ...initial, hostCircleIds: [hostId] },
        extraCircles: [host("secret", "active")],
    });
    await assertProductionDenied({
        post,
        source: initial,
        freshEvent: { ...initial, hostCircleIds: [hostId] },
        extraCircles: [host("public", "paused")],
    });
    assert.equal(
        (
            await productionHarness({
                post,
                source: initial,
                freshEvent: { ...initial, hostCircleIds: [hostId] },
                extraCircles: [host("public", "active")],
            }).result
        ).ok,
        true,
    );
    const secretHost = host("secret", "active");
    assert.equal(
        (
            await productionHarness({
                post,
                source: initial,
                freshEvent: { ...initial, hostCircleIds: [hostId] },
                extraCircles: [secretHost],
                extraMembers: [{ userDid: author, circleId: hostId, userGroups: ["members"] } as Member],
            }).result
        ).ok,
        true,
    );
    const eventModerator = "did:event-moderator";
    assert.equal(
        (
            await productionHarness({
                actor: eventModerator,
                moderatorDids: [eventModerator],
                post,
                source: initial,
                freshEvent: { ...initial, hostCircleIds: [hostId] },
                extraCircles: [secretHost],
                extraMembers: [{ userDid: eventModerator, circleId: hostId, userGroups: ["members"] } as Member],
            }).result
        ).ok,
        true,
    );
    await assertProductionDenied({
        actor: eventModerator,
        moderatorDids: [eventModerator],
        post,
        source: initial,
        freshEvent: { ...initial, hostCircleIds: [hostId] },
        extraCircles: [secretHost],
    });
});

test("production Event noticeboard and Funding targets remain generic", async () => {
    const pausedHostId = new ObjectId().toHexString();
    const event = {
        _id: ids.feed,
        circleId: ids.circle.toHexString(),
        commentPostId: ids.post.toHexString(),
        hostCircleIds: [pausedHostId],
    } as unknown as Event;
    const noticeboard = productionHarness({
        post: { postType: "post", parentItemType: "event", parentItemId: ids.feed.toHexString() },
        source: event,
        extraCircles: [
            {
                _id: new ObjectId(pausedHostId),
                circleType: "circle",
                visibility: "public",
                moderationStatus: "paused",
            } as Circle,
        ],
    });
    assert.equal((await noticeboard.result).ok, true);
    assert.equal(noticeboard.effects.post, 1);
    const funding = productionHarness({ post: { postType: "post", internalPreviewType: "funding" } });
    assert.equal((await funding.result).ok, true);
    assert.equal(funding.effects.post, 1);
});

test("exact Reaction isolation and counter underflow filters are repository contracts", () => {
    const otherComment = new ObjectId().toHexString();
    const rows = [
        { contentId: ids.comment.toHexString(), contentType: "comment" },
        { contentId: otherComment, contentType: "comment" },
        { contentId: ids.comment.toHexString(), contentType: "post" },
    ];
    const filter = commentReactionCleanupFilter(ids.comment.toHexString());
    assert.deepEqual(
        rows.filter((row) => row.contentId === filter.contentId && row.contentType === filter.contentType),
        [rows[0]],
    );
    assert.deepEqual(postCommentsDecrementFilter(ids.post), { _id: ids.post, comments: { $gt: 0 } });
    assert.deepEqual(parentRepliesDecrementFilter(ids.comment), { _id: ids.comment, replies: { $gt: 0 } });
});

test("simulated racing hard deletes and tombstones admit one primary and derived-effect winner", async () => {
    for (const child of [false, true]) {
        let available = true;
        const effects = { primary: 0, reactions: 0, post: 0, highlight: 0 };
        const shared: CommentDeletePersistence = {
            hasChild: async () => child,
            validateParent: async () => true,
            hardDelete: async () => {
                if (!available) return false;
                available = false;
                effects.primary++;
                return true;
            },
            tombstone: async () => {
                if (!available) return false;
                available = false;
                effects.primary++;
                return true;
            },
            cleanupReactions: async () => void effects.reactions++,
            decrementPostComments: async () => void effects.post++,
            decrementParentReplies: async () => undefined,
            refreshHighlight: async () => void effects.highlight++,
        };
        const invoke = () =>
            orchestrateCommentDelete({
                commentId: ids.comment.toHexString(),
                actorDid: author,
                resolveContext: async () => context(),
                authorizationDependencies: {
                    authorizeFeature: async () => true,
                    findCurrentEvent: async () => null,
                    canReadCurrentEventHosts: async () => true,
                    assertEventHostsWritable: async () => undefined,
                },
                persistence: shared,
            });
        const [first, second] = await Promise.all([invoke(), invoke()]);
        assert.equal(effects.primary, 1);
        assert.equal(effects.reactions, 1);
        assert.equal(effects.post, child ? 0 : 1);
        assert.equal(effects.highlight, 1);
        assert.equal(first.ok || second.ok, true);
    }
});
