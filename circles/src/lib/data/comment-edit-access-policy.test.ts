import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import type { Circle, Comment, Event, Feed, Feature, Member, Post } from "@/models/models";
import {
    COMMENT_EDIT_UNAVAILABLE_MESSAGE,
    orchestrateCommentEdit,
    resolveCommentMutationContext,
    type CommentMutationDependencies,
} from "./comment-edit-access-policy";
import { resolveReadablePostContext } from "./post-access-policy";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { canReadEventOwners, canReadPostSource } from "./post-source-access-policy";
import { assertEventHostCirclesWritable } from "./event-alternate-comment-policy";
import { canReadCircle } from "./circle-visibility-policy";

const ids = {
    comment: new ObjectId(),
    post: new ObjectId(),
    feed: new ObjectId(),
    circle: new ObjectId(),
    source: new ObjectId(),
};
const actorDid = "did:example:author";

type Options = {
    comment?: Partial<Comment> | null;
    post?: Partial<Post> | null;
    feed?: Partial<Feed> | null;
    circle?: Partial<Circle> | null;
    member?: Member | null;
    author?: Circle | null;
    source?: Record<string, unknown> | null;
    sourceReadable?: boolean;
    viewAuthorized?: boolean;
};

const harness = (options: Options = {}) => {
    const comment =
        options.comment === null
            ? null
            : ({
                  _id: ids.comment,
                  postId: ids.post.toHexString(),
                  createdBy: actorDid,
                  createdAt: new Date(),
                  content: "old",
                  mentions: [],
                  reactions: {},
                  replies: 0,
                  ...options.comment,
              } as Comment);
    const post =
        options.post === null
            ? null
            : ({
                  _id: ids.post,
                  feedId: ids.feed.toHexString(),
                  postType: "post",
                  createdBy: "did:example:post-author",
                  createdAt: new Date(),
                  content: "post",
                  userGroups: ["everyone"],
                  reactions: {},
                  comments: 1,
                  ...options.post,
              } as Post);
    const feed =
        options.feed === null
            ? null
            : ({ _id: ids.feed, circleId: ids.circle.toHexString(), handle: "default", ...options.feed } as Feed);
    const circle =
        options.circle === null
            ? null
            : ({
                  _id: ids.circle,
                  circleType: "circle",
                  visibility: "public",
                  moderationStatus: "active",
                  enabledModules: ["community", "discussions", "tasks", "goals", "issues"],
                  ...options.circle,
              } as Circle);
    const member = options.member;
    const postAuthor =
        options.author === undefined ? ({ did: post?.createdBy, isVerified: true } as Circle) : options.author;
    const resolveReadableContext = (candidate: string, did?: string) =>
        resolveReadablePostContext(candidate, did, {
            findPost: async (id) => (post && id.equals(ids.post) ? post : null),
            findFeed: async (id) => (feed && id.equals(ids.feed) ? feed : null),
            findCircle: async (id) => (circle && id.equals(ids.circle) ? circle : null),
            findMember: async () => member ?? null,
            findAuthor: async () => postAuthor,
            authorizeFeature: async () => options.viewAuthorized ?? true,
            canReadSource: async () => options.sourceReadable ?? true,
        });
    const dependencies: CommentMutationDependencies = {
        findComment: async (id) => (comment && id.equals(ids.comment) ? comment : null),
        resolveReadableContext,
        canWriteCircle: canWriteCircleByLifecycle,
        findSource: async () => options.source as never,
    };
    return { comment, post, feed, circle, dependencies };
};

type Effects = { mentions: number; update: number; notify: number; eventReload: number; hostWrite: number };
const run = async (
    options: Options = {},
    edit?: { actor?: string; feature?: boolean; currentEvent?: Event | null; hostWrite?: boolean },
) => {
    const h = harness(options);
    const effects: Effects = { mentions: 0, update: 0, notify: 0, eventReload: 0, hostWrite: 0 };
    const result = await orchestrateCommentEdit({
        commentId: ids.comment.toHexString(),
        actorDid: edit?.actor ?? actorDid,
        content: "new",
        resolveContext: (id, did) => resolveCommentMutationContext(id, did, h.dependencies),
        authorizationDependencies: {
            authorizeFeature: async () => edit?.feature ?? true,
            findCurrentEvent: async () => (
                effects.eventReload++, edit?.currentEvent ?? (options.source as Event | null)
            ),
            canReadCurrentEventHosts: async () => true,
            assertEventHostsWritable: async () => {
                effects.hostWrite++;
                if (edit?.hostWrite === false) throw new Error("paused host");
            },
        },
        canonicalize: async (content) => (
            effects.mentions++, { ok: true, content, mentions: [{ type: "circle" as const, id: "circle" }] }
        ),
        update: async (_context, content, mentions) => (effects.update++, { content, mentions }),
        notify: async () => void effects.notify++,
    });
    return { result, effects };
};

const assertDeniedWithoutEffects = async (options: Options, edit?: Parameters<typeof run>[1]) => {
    const { result, effects } = await run(options, edit);
    assert.deepEqual(result, { ok: false, message: COMMENT_EDIT_UNAVAILABLE_MESSAGE });
    assert.equal(effects.mentions, 0);
    assert.equal(effects.update, 0);
    assert.equal(effects.notify, 0);
};

test("production resolver and orchestration allow the current author and preserve mention/update/notify order", async () => {
    const { result, effects } = await run();
    assert.equal(result.ok, true);
    assert.deepEqual(effects, { mentions: 1, update: 1, notify: 1, eventReload: 0, hostWrite: 0 });
});

test("malformed/missing identities and canonical target failures deny with zero edit effects", async () => {
    const h = harness();
    assert.equal(await resolveCommentMutationContext("malformed", actorDid, h.dependencies), null);
    for (const options of [
        { comment: null },
        { comment: { _id: new ObjectId() } },
        { comment: { postId: "malformed" } },
        { post: null },
        { post: { feedId: "malformed" } },
        { feed: null },
        { feed: { circleId: "malformed" } },
        { circle: null },
        { post: { postType: "event", parentItemType: undefined, parentItemId: undefined } },
        { post: { postType: "event", parentItemType: "event", parentItemId: "malformed" } },
        { viewAuthorized: false },
        { author: null },
    ] as Options[])
        await assertDeniedWithoutEffects(options);
});

test("author-only, tombstone, lifecycle, user-group, and Secret current-access rules fail closed", async () => {
    await assertDeniedWithoutEffects({}, { actor: "did:example:moderator" });
    await assertDeniedWithoutEffects({ comment: { isDeleted: true } });
    await assertDeniedWithoutEffects({ circle: { moderationStatus: "paused" } });
    await assertDeniedWithoutEffects({
        post: { userGroups: ["admins"] },
        member: { userDid: actorDid, circleId: ids.circle.toHexString(), userGroups: ["members"] } as Member,
    });
    for (const did of [
        actorDid,
        "did:example:outsider",
        "did:example:superadmin",
        "did:example:admin",
        "did:example:moderator",
    ]) {
        await assertDeniedWithoutEffects({ circle: { visibility: "secret" }, member: null }, { actor: did });
    }
    const currentMember = { userDid: actorDid, circleId: ids.circle.toHexString(), userGroups: ["members"] } as Member;
    assert.equal((await run({ circle: { visibility: "secret" }, member: currentMember })).result.ok, true);
    await assertDeniedWithoutEffects(
        { circle: { visibility: "secret" }, member: currentMember },
        { actor: "did:example:moderator" },
    );
});

test("detail shadows use strict backlinks and repository feature semantics; noticeboards stay generic", async () => {
    for (const [type, module] of [
        ["task", "tasks"],
        ["goal", "goals"],
        ["issue", "issues"],
        ["proposal", "feed"],
    ] as const) {
        const h = harness({
            post: { postType: type, parentItemType: type, parentItemId: ids.source.toHexString() },
            source: { _id: ids.source, commentPostId: ids.post.toHexString() },
        });
        const context = await resolveCommentMutationContext(ids.comment.toHexString(), actorDid, h.dependencies);
        assert.equal(context?.commentFeature.module, module);
        await assertDeniedWithoutEffects({
            post: { postType: type, parentItemType: type, parentItemId: ids.source.toHexString() },
            source: { _id: ids.source, commentPostId: new ObjectId().toHexString() },
        });
        await assertDeniedWithoutEffects({
            post: { postType: type, parentItemType: type, parentItemId: ids.source.toHexString() },
            sourceReadable: false,
            source: { _id: ids.source, commentPostId: ids.post.toHexString() },
        });
    }
    for (const post of [
        { postType: "post" as const, parentItemType: "event" as const, parentItemId: ids.source.toHexString() },
        {
            postType: "post" as const,
            internalPreviewType: "funding" as const,
            internalPreviewId: ids.source.toHexString(),
        },
        { postType: "post" as const, parentItemType: "task" as const, parentItemId: ids.source.toHexString() },
    ])
        assert.equal(
            (await resolveCommentMutationContext(ids.comment.toHexString(), actorDid, harness({ post }).dependencies))
                ?.route.kind,
            "generic",
        );
});

test("Discussion edits remain allowed for open, pinned, and closed existing Comments", async () => {
    for (const discussionState of ["open", "pinned", "closed"]) {
        const { result, effects } = await run({ post: { postType: "discussion", discussionState } as Partial<Post> });
        assert.equal(result.ok, true);
        assert.equal(effects.update, 1);
    }
});

test("Event alternate edit reloads fresh state and requires strict current binding plus every host writable", async () => {
    const event = {
        _id: ids.source,
        circleId: ids.circle.toHexString(),
        commentPostId: ids.post.toHexString(),
        hostCircleIds: [new ObjectId().toHexString()],
    } as unknown as Event;
    const options: Options = {
        post: { postType: "event", parentItemType: "event", parentItemId: ids.source.toHexString() },
        source: event,
    };
    const success = await run(options, { currentEvent: event });
    assert.equal(success.result.ok, true);
    assert.equal(success.effects.eventReload, 1);
    assert.equal(success.effects.hostWrite, 1);
    for (const stale of [
        { ...event, commentPostId: new ObjectId().toHexString() },
        { ...event, circleId: new ObjectId().toHexString() },
        { ...event, _id: new ObjectId() },
    ] as Event[])
        await assertDeniedWithoutEffects(options, { currentEvent: stale });
    await assertDeniedWithoutEffects(options, {
        currentEvent: { ...event, hostCircleIds: [new ObjectId().toHexString()] },
        hostWrite: false,
    });
});

test("fresh Event host set uses real current Secret readability and lifecycle before edit effects", async () => {
    const freshHostId = new ObjectId().toHexString();
    const initialEvent = {
        _id: ids.source,
        circleId: ids.circle.toHexString(),
        commentPostId: ids.post.toHexString(),
        hostCircleIds: [],
    } as unknown as Event;
    const runFreshHost = async (memberOfFreshHost: boolean, freshHostStatus: Circle["moderationStatus"]) => {
        const primary = {
            _id: ids.circle,
            circleType: "circle",
            visibility: "public",
            moderationStatus: "active",
            enabledModules: ["feed"],
        } as Circle;
        const freshHost = {
            _id: new ObjectId(freshHostId),
            circleType: "circle",
            visibility: "secret",
            moderationStatus: freshHostStatus,
        } as Circle;
        const circles = new Map([
            [ids.circle.toHexString(), primary],
            [freshHostId, freshHost],
        ]);
        const members = new Map<string, Member>();
        if (memberOfFreshHost) {
            members.set(`${actorDid}:${freshHostId}`, {
                userDid: actorDid,
                circleId: freshHostId,
                userGroups: ["members"],
            } as Member);
        }
        const findMember = async (did: string, circleId: string) => members.get(`${did}:${circleId}`) ?? null;
        const post = {
            _id: ids.post,
            feedId: ids.feed.toHexString(),
            postType: "event",
            parentItemType: "event",
            parentItemId: ids.source.toHexString(),
            createdBy: "did:example:post-author",
            createdAt: new Date(),
            content: "event",
            userGroups: ["everyone"],
            reactions: {},
            comments: 1,
        } as Post;
        const feed = { _id: ids.feed, circleId: ids.circle.toHexString(), handle: "default" } as Feed;
        const comment = {
            _id: ids.comment,
            postId: ids.post.toHexString(),
            parentCommentId: null,
            createdBy: actorDid,
            createdAt: new Date(),
            content: "old",
            mentions: [],
            reactions: {},
            replies: 0,
        } as Comment;
        const findCircles = async (requested: ObjectId[]) =>
            requested.map((id) => circles.get(id.toHexString())).filter(Boolean) as Circle[];
        const canReadOwner = (did: string | undefined, circle: Circle) =>
            canReadCircle(did, circle, { getMember: findMember });
        const resolveReadableContext = (candidate: string, did?: string) =>
            resolveReadablePostContext(candidate, did, {
                findPost: async (id) => (id.equals(ids.post) ? post : null),
                findFeed: async (id) => (id.equals(ids.feed) ? feed : null),
                findCircle: async (id) => circles.get(id.toHexString()) ?? null,
                findMember,
                findAuthor: async () => ({ did: post.createdBy, isVerified: true }) as Circle,
                authorizeFeature: async () => true,
                canReadSource: (target, viewerDid) =>
                    canReadPostSource(target, viewerDid, {
                        findSource: async (type, id) =>
                            type === "event" && id.equals(ids.source) ? initialEvent : null,
                        findCircles,
                        canReadOwner,
                    }),
            });
        const dependencies: CommentMutationDependencies = {
            findComment: async (id) => (id.equals(ids.comment) ? comment : null),
            resolveReadableContext,
            canWriteCircle: canWriteCircleByLifecycle,
            findSource: async (type, id) => (type === "event" && id.equals(ids.source) ? initialEvent : null),
        };
        const freshEvent = { ...initialEvent, hostCircleIds: [freshHostId] } as Event;
        const effects = { mentions: 0, update: 0, notify: 0, activity: 0, highlight: 0, revalidation: 0 };
        const result = await orchestrateCommentEdit({
            commentId: ids.comment.toHexString(),
            actorDid,
            content: "new",
            resolveContext: (id, did) => resolveCommentMutationContext(id, did, dependencies),
            authorizationDependencies: {
                authorizeFeature: async () => true,
                findCurrentEvent: async () => freshEvent,
                canReadCurrentEventHosts: (event, did) => canReadEventOwners(event, did, { findCircles, canReadOwner }),
                assertEventHostsWritable: (event) =>
                    assertEventHostCirclesWritable(event, async (circleId) => {
                        const circle = circles.get(circleId);
                        if (!circle || !canWriteCircleByLifecycle(circle)) throw new Error("unavailable");
                    }),
            },
            canonicalize: async (content) => (effects.mentions++, { ok: true, content, mentions: [] }),
            update: async () => void effects.update++,
            notify: async () => void effects.notify++,
        });
        return { result, effects };
    };

    const nonmember = await runFreshHost(false, "active");
    assert.deepEqual(nonmember.result, { ok: false, message: COMMENT_EDIT_UNAVAILABLE_MESSAGE });
    assert.deepEqual(nonmember.effects, {
        mentions: 0,
        update: 0,
        notify: 0,
        activity: 0,
        highlight: 0,
        revalidation: 0,
    });

    const member = await runFreshHost(true, "active");
    assert.equal(member.result.ok, true);
    assert.deepEqual(member.effects, {
        mentions: 1,
        update: 1,
        notify: 1,
        activity: 0,
        highlight: 0,
        revalidation: 0,
    });

    const paused = await runFreshHost(true, "paused");
    assert.deepEqual(paused.result, { ok: false, message: COMMENT_EDIT_UNAVAILABLE_MESSAGE });
    assert.deepEqual(paused.effects, {
        mentions: 0,
        update: 0,
        notify: 0,
        activity: 0,
        highlight: 0,
        revalidation: 0,
    });
});

test("Event noticeboard does not reload Event or require all hosts writable", async () => {
    const { result, effects } = await run(
        {
            post: { postType: "post", parentItemType: "event", parentItemId: ids.source.toHexString() },
            sourceReadable: true,
        },
        { hostWrite: false },
    );
    assert.equal(result.ok, true);
    assert.equal(effects.eventReload, 0);
    assert.equal(effects.hostWrite, 0);
});

test("feature denial precedes tombstone mention work and returns the neutral message", async () => {
    await assertDeniedWithoutEffects({ comment: { isDeleted: true } }, { feature: false });
});
