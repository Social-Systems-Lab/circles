import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import type { Circle, Comment, Event, Feed, Member, Post } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import {
    COMMENT_REACTION_UNAVAILABLE_MESSAGE,
    orchestrateCommentReaction,
    resolveCommentReactionContext,
} from "./comment-reaction-access-policy";
import { getPostReactionFeature } from "./constants";
import { resolveReadablePostContext } from "./post-access-policy";
import { resolvePostReactionContext } from "./post-reaction-access-policy";
import { canReadPostSource, type PostSourceType } from "./post-source-access-policy";
import { applyLikeMutation, applyUnlikeMutation, type ReactionMutationInput } from "./reaction-mutation";

const actorDid = "did:actor";

type Options = {
    commentId?: string;
    missingComment?: boolean;
    deleted?: boolean;
    loadedCommentId?: string;
    commentPostId?: string;
    resolvedPostId?: string;
    parentCommentId?: string | null;
    commentAuthor?: string;
    missingPost?: boolean;
    missingFeed?: boolean;
    missingCircle?: boolean;
    postFeedId?: string;
    feedCircleId?: string;
    secret?: boolean;
    member?: boolean;
    moderationStatus?: Circle["moderationStatus"];
    postType?: Post["postType"];
    parentType?: Post["parentItemType"];
    parentId?: string;
    userGroups?: string[];
    memberGroups?: string[];
    authorAvailable?: boolean;
    featureAllowed?: boolean;
    sourceType?: PostSourceType;
    sourceExists?: boolean;
    sourceOwnerSecret?: boolean;
    sourceMember?: boolean;
    event?: Partial<Event> | null;
    eventHostMode?: "readable" | "missing" | "malformed" | "secret-denied";
    eventHostModerationStatus?: Circle["moderationStatus"];
    pinned?: boolean;
    closed?: boolean;
};

function fixture(options: Options = {}) {
    const commentId = new ObjectId();
    const postId = new ObjectId();
    const feedId = new ObjectId();
    const circleId = new ObjectId();
    const sourceId = new ObjectId();
    const sourceOwnerId = new ObjectId();
    const eventHostId = new ObjectId();
    const effectiveSourceType = options.sourceType ?? options.parentType;
    const effectiveSourceId = options.parentId ?? sourceId.toHexString();
    const post = {
        _id: postId,
        feedId: options.postFeedId ?? feedId.toHexString(),
        postType: options.postType ?? "post",
        createdBy: "did:author",
        createdAt: new Date(),
        content: "content",
        reactions: {},
        comments: 1,
        userGroups: options.userGroups ?? ["everyone"],
        pinned: options.pinned,
        closed: options.closed,
        ...(effectiveSourceType ? { parentItemType: effectiveSourceType, parentItemId: effectiveSourceId } : {}),
    } as Post;
    const comment = {
        _id: options.loadedCommentId ?? commentId,
        postId: options.commentPostId ?? postId.toHexString(),
        parentCommentId: options.parentCommentId ?? null,
        content: "comment",
        createdBy: options.commentAuthor ?? "did:historical-comment-author",
        createdAt: new Date(),
        reactions: {},
        replies: 0,
        isDeleted: options.deleted,
    } as Comment;
    const feed = { _id: feedId, circleId: options.feedCircleId ?? circleId.toHexString() } as Feed;
    const circle = {
        _id: circleId,
        circleType: "circle",
        visibility: options.secret ? "secret" : "public",
        moderationStatus: options.moderationStatus ?? "active",
        enabledModules: ["feed", "discussions", "community"],
    } as Circle;
    const sourceOwner = {
        _id: sourceOwnerId,
        circleType: "circle",
        visibility: options.sourceOwnerSecret ? "secret" : "public",
        moderationStatus: options.eventHostModerationStatus ?? "active",
    } as Circle;
    const eventHost = {
        _id: eventHostId,
        circleType: "circle",
        visibility: options.eventHostMode === "secret-denied" ? "secret" : "public",
        moderationStatus: "active",
    } as Circle;
    const event =
        options.event === null
            ? null
            : ({
                  _id: sourceId,
                  circleId: circleId.toHexString(),
                  hostCircleIds:
                      options.eventHostMode === "malformed"
                          ? ["malformed"]
                          : options.eventHostMode
                            ? [eventHostId.toHexString()]
                            : [],
                  commentPostId: postId.toHexString(),
                  ...options.event,
              } as Event);

    const resolveReadable = (candidateId: string, viewerDid?: string) =>
        resolveReadablePostContext(candidateId, viewerDid, {
            findPost: async (id) => (!options.missingPost && id.equals(postId) ? post : null),
            findFeed: async (id) => (!options.missingFeed && id.equals(feedId) ? feed : null),
            findCircle: async (id) => (!options.missingCircle && id.equals(circleId) ? circle : null),
            findMember: async (did, ownerId) => {
                const ownsTarget = ownerId === circleId.toHexString() && options.member;
                const ownsSource = ownerId === sourceOwnerId.toHexString() && options.sourceMember;
                if (did !== actorDid || (!ownsTarget && !ownsSource)) return null;
                return { userDid: did, circleId: ownerId, userGroups: options.memberGroups ?? [] } as Member;
            },
            findAuthor: async () =>
                options.authorAvailable === false ? null : ({ did: "did:author", isVerified: true } as Circle),
            authorizeFeature: async () => true,
            canReadSource: (candidate, did) =>
                canReadPostSource(candidate, did, {
                    findSource: async (type, id) => {
                        if (options.sourceExists === false || type !== effectiveSourceType || !id.equals(sourceId)) {
                            return null;
                        }
                        if (type === "event") return event;
                        return { _id: sourceId, circleId: sourceOwnerId.toHexString() } as never;
                    },
                    findCircles: async (ids) =>
                        ids
                            .map((id) => {
                                if (id.equals(circleId)) return circle;
                                if (id.equals(sourceOwnerId)) return sourceOwner;
                                if (id.equals(eventHostId) && options.eventHostMode !== "missing") return eventHost;
                                return null;
                            })
                            .filter(Boolean) as Circle[],
                    canReadOwner: async (did, owner) =>
                        owner.visibility !== "secret" ||
                        Boolean(
                            did === actorDid &&
                                ((owner._id?.toString() === circleId.toHexString() && options.member) ||
                                    (owner._id?.toString() === sourceOwnerId.toHexString() && options.sourceMember)),
                        ),
                }),
        });
    const resolvePost = async (candidateId: string, did: string) => {
        const context = await resolvePostReactionContext(candidateId, did, {
            resolveReadableContext: resolveReadable,
            canWriteCircle: canWriteCircleByLifecycle,
            getReactionFeature: getPostReactionFeature,
            authorizeFeature: async () => options.featureAllowed !== false,
        });
        return context && options.resolvedPostId ? { ...context, normalizedPostId: options.resolvedPostId } : context;
    };
    const resolve = (did = actorDid, candidateCommentId = options.commentId ?? commentId.toHexString()) =>
        resolveCommentReactionContext(candidateCommentId, did, {
            findComment: async (id) => (!options.missingComment && id.equals(commentId) ? comment : null),
            resolvePostContext: resolvePost,
            findEvent: async (id) => (event && id.equals(sourceId) ? event : null),
        });
    return {
        commentId: commentId.toHexString(),
        postId: postId.toHexString(),
        circleId,
        feedId,
        sourceId,
        comment,
        resolve,
    };
}

type ReactionKind = "like" | "unlike";
type Effects = {
    lowLevel: number;
    inserts: number;
    deletes: number;
    counter: number;
    highlight: number;
    notification: number;
    revalidation: number;
};

async function runReaction(
    target: ReturnType<typeof fixture>,
    kind: ReactionKind,
    options: { actor?: string; historicReaction?: boolean; commentId?: string } = {},
) {
    let reactionExists = options.historicReaction ?? false;
    const effects: Effects = {
        lowLevel: 0,
        inserts: 0,
        deletes: 0,
        counter: 0,
        highlight: 0,
        notification: 0,
        revalidation: 0,
    };
    const input: ReactionMutationInput = {
        contentId: target.commentId,
        contentType: "comment",
        userDid: options.actor ?? actorDid,
        reactionType: "like",
    };
    const dependencies = {
        findExisting: async () => reactionExists,
        insert: async () => {
            reactionExists = true;
            effects.inserts++;
        },
        remove: async () => {
            if (!reactionExists) return false;
            reactionExists = false;
            effects.deletes++;
            return true;
        },
        incrementCounter: async (_input: ReactionMutationInput, amount: 1 | -1) => {
            effects.counter += amount;
        },
        refreshHighlightedComment: async () => {
            if (!target.comment.parentCommentId) effects.highlight++;
        },
    };
    const actor = options.actor ?? actorDid;
    const result = await orchestrateCommentReaction({
        commentId: options.commentId ?? target.commentId,
        actorDid: actor,
        resolveContext: (id, did) => target.resolve(did, id),
        mutate: async () => {
            effects.lowLevel++;
            return kind === "like" ? applyLikeMutation(input, dependencies) : applyUnlikeMutation(input, dependencies);
        },
        ...(kind === "like"
            ? {
                  afterMutation: async () => {
                      // Mirrors notifyCommentLike's existing self-like suppression at its public seam.
                      if (target.comment.createdBy !== actor) effects.notification++;
                  },
              }
            : {}),
    });
    return { result, effects, reactionExists };
}

const zeroEffects: Effects = {
    lowLevel: 0,
    inserts: 0,
    deletes: 0,
    counter: 0,
    highlight: 0,
    notification: 0,
    revalidation: 0,
};

async function testGenericSuccessAndDenialMatrix() {
    for (const [label, options] of [
        ["public", {}],
        ["Secret member", { secret: true, member: true }],
        ["Discussion", { postType: "discussion" }],
        ["Secret Discussion", { postType: "discussion", secret: true, member: true }],
        ["Task", { sourceType: "task" }],
        ["Goal", { sourceType: "goal" }],
        ["Issue", { sourceType: "issue" }],
        ["Proposal", { sourceType: "proposal" }],
        ["historical Comment author", {}],
    ] as Array<[string, Options]>)
        assert.ok(await fixture(options).resolve(), label);

    const denied: Array<[string, Options, string?]> = [
        ["malformed Comment", { commentId: "malformed" }],
        ["missing Comment", { missingComment: true }],
        ["soft-deleted Comment", { deleted: true }],
        ["malformed comment.postId", { commentPostId: "malformed" }],
        ["missing Post", { missingPost: true }],
        ["missing Feed", { missingFeed: true }],
        ["missing Circle", { missingCircle: true }],
        ["paused primary", { moderationStatus: "paused" }],
        ["user-group excluded", { userGroups: ["team"], member: true, memberGroups: ["other"] }],
        ["Post author unavailable", { authorAvailable: false }],
        ["feature denied", { featureAllowed: false }],
        ["source malformed", { sourceType: "task", parentId: "malformed" }],
        ["source missing", { sourceType: "task", sourceExists: false }],
        ["source inaccessible", { sourceType: "task", sourceOwnerSecret: true }],
        ["Secret former", { secret: true }, "did:former"],
        ["Secret outsider", { secret: true }, "did:outsider"],
        ["Secret superadmin", { secret: true }, "did:superadmin"],
        ["Secret admin", { secret: true }, "did:admin"],
        ["Secret moderator", { secret: true }, "did:moderator"],
    ];
    for (const [label, options, did] of denied) assert.equal(await fixture(options).resolve(did), null, label);
}

async function testEventStrictBindingAndNoticeboard() {
    assert.ok(
        await fixture({ postType: "event", parentType: "event", eventHostMode: "readable" }).resolve(),
        "canonical Event shadow",
    );
    assert.ok(
        await fixture({ postType: "discussion", parentType: "event", eventHostMode: "readable" }).resolve(),
        "legacy Event shadow",
    );
    const mismatches: Array<[string, Options]> = [
        ["commentPostId", { event: { commentPostId: new ObjectId().toHexString() } }],
        ["wrong Event parent", { event: { _id: new ObjectId() } }],
        ["wrong parent type", { parentType: "task", sourceType: "task" }],
        ["wrong Feed", { event: {}, postFeedId: new ObjectId().toHexString() }],
        ["wrong Circle", { event: {}, feedCircleId: new ObjectId().toHexString() }],
        ["wrong primary Circle", { event: { circleId: new ObjectId().toHexString() } }],
        ["missing Event", { event: null }],
        ["malformed Event ID", { parentId: "malformed" }],
        ["missing host", { eventHostMode: "missing" }],
        ["malformed host", { eventHostMode: "malformed" }],
        ["unreadable host", { eventHostMode: "secret-denied" }],
    ];
    for (const [label, extra] of mismatches) {
        const base: Options = { postType: "event", parentType: "event", eventHostMode: "readable" };
        assert.equal(await fixture({ ...base, ...extra }).resolve(), null, label);
    }

    assert.equal(
        await fixture({ postType: "community", parentType: "event", eventHostMode: "readable" }).resolve(),
        null,
        "unsupported Event shadow postType",
    );

    const noticeboard = fixture({
        postType: "post",
        parentType: "event",
        event: { commentPostId: new ObjectId().toHexString() },
        eventHostMode: "readable",
    });
    assert.ok(await noticeboard.resolve(), "Event noticeboard Comment remains generic");
}

async function testRealPolicyDeniedOrchestration() {
    const denied: Array<[string, Options, string?, string?]> = [
        ["Secret former", { secret: true }, "did:former"],
        ["Secret outsider", { secret: true }, "did:outsider"],
        ["soft-deleted Comment", { deleted: true }],
        ["user-group excluded", { userGroups: ["team"], member: true, memberGroups: ["other"] }],
        ["source inaccessible", { sourceType: "task", sourceOwnerSecret: true }],
        ["source missing", { sourceType: "task", sourceExists: false }],
        ["paused primary", { moderationStatus: "paused" }],
        [
            "noncanonical Event shadow",
            { postType: "event", parentType: "event", event: { commentPostId: new ObjectId().toHexString() } },
        ],
        ["malformed Comment ID", {}, undefined, "malformed"],
        ["missing Comment", { missingComment: true }],
    ];
    for (const [label, options, actor, commentId] of denied) {
        for (const kind of ["like", "unlike"] as const) {
            const target = fixture(options);
            const outcome = await runReaction(target, kind, {
                actor,
                commentId,
                historicReaction: kind === "unlike",
            });
            assert.deepEqual(
                outcome.result,
                { ok: false, message: COMMENT_REACTION_UNAVAILABLE_MESSAGE },
                `${label} ${kind}`,
            );
            assert.deepEqual(outcome.effects, zeroEffects, `${label} ${kind} zero effects`);
            if (kind === "unlike") assert.equal(outcome.reactionExists, true, `${label} retains historic Reaction`);
        }
    }
}

async function testEventOrchestratedMatrix() {
    for (const kind of ["like", "unlike"] as const) {
        const canonical = await runReaction(
            fixture({ postType: "event", parentType: "event", eventHostMode: "readable" }),
            kind,
            { historicReaction: kind === "unlike" },
        );
        assert.equal(canonical.result.ok && canonical.result.didMutate, true, `canonical Event ${kind}`);
    }

    const noticeboard = await runReaction(
        fixture({
            postType: "post",
            parentType: "event",
            event: { commentPostId: new ObjectId().toHexString() },
            eventHostMode: "readable",
        }),
        "like",
    );
    assert.equal(noticeboard.result.ok && noticeboard.result.didMutate, true, "Event noticeboard LIKE");

    const pausedSecondary = await runReaction(
        fixture({
            postType: "event",
            parentType: "event",
            eventHostMode: "readable",
            eventHostModerationStatus: "paused",
        }),
        "like",
    );
    assert.equal(pausedSecondary.result.ok && pausedSecondary.result.didMutate, true, "paused secondary is readable");

    const denied: Array<[string, Options]> = [
        ["paused primary", { moderationStatus: "paused" }],
        ["commentPostId mismatch", { event: { commentPostId: new ObjectId().toHexString() } }],
        ["wrong parent ID", { event: { _id: new ObjectId() } }],
        ["wrong parent type", { parentType: "task", sourceType: "task" }],
        ["unsupported shadow type", { postType: "community" }],
        ["wrong Feed", { postFeedId: new ObjectId().toHexString() }],
        ["wrong Circle", { feedCircleId: new ObjectId().toHexString() }],
        ["wrong Event owner", { event: { circleId: new ObjectId().toHexString() } }],
        ["missing Event", { event: null }],
        ["malformed Event ID", { parentId: "malformed" }],
        ["missing host", { eventHostMode: "missing" }],
        ["unreadable host", { eventHostMode: "secret-denied" }],
    ];
    for (const [label, extra] of denied) {
        const target = fixture({ postType: "event", parentType: "event", eventHostMode: "readable", ...extra });
        for (const kind of ["like", "unlike"] as const) {
            const outcome = await runReaction(target, kind, { historicReaction: kind === "unlike" });
            assert.deepEqual(outcome.result, { ok: false, message: COMMENT_REACTION_UNAVAILABLE_MESSAGE }, label);
            assert.deepEqual(outcome.effects, zeroEffects, `${label} ${kind} zero effects`);
        }
    }
}

async function testSourceAndDiscussionOrchestration() {
    for (const sourceType of ["task", "goal", "issue", "proposal"] as const) {
        const outcome = await runReaction(fixture({ sourceType }), "like");
        assert.equal(outcome.result.ok && outcome.result.didMutate, true, `${sourceType} LIKE`);
    }
    const sourceUnlike = await runReaction(fixture({ sourceType: "task" }), "unlike", { historicReaction: true });
    assert.equal(sourceUnlike.result.ok && sourceUnlike.result.didMutate, true, "Task UNLIKE");

    for (const [label, options] of [
        ["normal", { postType: "discussion" }],
        ["pinned", { postType: "discussion", pinned: true }],
        ["closed", { postType: "discussion", closed: true }],
        ["Secret current member", { postType: "discussion", secret: true, member: true }],
    ] as Array<[string, Options]>) {
        const outcome = await runReaction(fixture(options), "like");
        assert.equal(outcome.result.ok && outcome.result.didMutate, true, `${label} Discussion LIKE`);
    }
    const outsider = await runReaction(fixture({ postType: "discussion", secret: true }), "unlike", {
        actor: "did:outsider",
        historicReaction: true,
    });
    assert.deepEqual(outsider.result, { ok: false, message: COMMENT_REACTION_UNAVAILABLE_MESSAGE });
    assert.deepEqual(outsider.effects, zeroEffects);
    assert.equal(outsider.reactionExists, true);
}

async function testMutationHighlightNoOpsAndSelfLike() {
    const topLike = await runReaction(fixture(), "like");
    assert.equal(topLike.result.ok && topLike.result.didMutate, true);
    assert.deepEqual(topLike.effects, {
        lowLevel: 1,
        inserts: 1,
        deletes: 0,
        counter: 1,
        highlight: 1,
        notification: 1,
        revalidation: 0,
    });
    const topUnlike = await runReaction(fixture(), "unlike", { historicReaction: true });
    assert.equal(topUnlike.result.ok && topUnlike.result.didMutate, true);
    assert.deepEqual(topUnlike.effects, {
        lowLevel: 1,
        inserts: 0,
        deletes: 1,
        counter: -1,
        highlight: 1,
        notification: 0,
        revalidation: 0,
    });

    for (const kind of ["like", "unlike"] as const) {
        const reply = await runReaction(fixture({ parentCommentId: new ObjectId().toHexString() }), kind, {
            historicReaction: kind === "unlike",
        });
        assert.equal(reply.result.ok && reply.result.didMutate, true, `reply ${kind}`);
        assert.equal(reply.effects.highlight, 0, `reply ${kind} highlight`);
    }

    const duplicate = await runReaction(fixture(), "like", { historicReaction: true });
    assert.equal(duplicate.result.ok && duplicate.result.didMutate, false);
    assert.deepEqual(duplicate.effects, {
        ...zeroEffects,
        lowLevel: 1,
    });
    const absentUnlike = await runReaction(fixture(), "unlike");
    assert.equal(absentUnlike.result.ok && absentUnlike.result.didMutate, false);
    assert.deepEqual(absentUnlike.effects, { ...zeroEffects, lowLevel: 1 });
    const repeatedUnlike = await runReaction(fixture(), "unlike");
    assert.equal(repeatedUnlike.result.ok && repeatedUnlike.result.didMutate, false);
    assert.deepEqual(repeatedUnlike.effects, { ...zeroEffects, lowLevel: 1 });

    const selfLike = await runReaction(fixture({ commentAuthor: actorDid }), "like");
    assert.equal(selfLike.result.ok && selfLike.result.didMutate, true, "self-like mutation remains permitted");
    assert.equal(selfLike.effects.inserts, 1);
    assert.equal(selfLike.effects.notification, 0, "existing self-like notification suppression");
}

async function testIdentityMismatchDenials() {
    for (const [label, options] of [
        ["loaded Comment identity", { loadedCommentId: new ObjectId().toHexString() }],
        ["resolved Post identity", { resolvedPostId: new ObjectId().toHexString() }],
    ] as Array<[string, Options]>) {
        const target = fixture(options);
        assert.equal(await target.resolve(), null, label);
        for (const kind of ["like", "unlike"] as const) {
            const outcome = await runReaction(target, kind, { historicReaction: kind === "unlike" });
            assert.deepEqual(outcome.result, { ok: false, message: COMMENT_REACTION_UNAVAILABLE_MESSAGE }, label);
            assert.deepEqual(outcome.effects, zeroEffects, `${label} ${kind} zero effects`);
        }
    }
}

async function testProductionWiring() {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const actions = await readFile(`${root}/src/components/modules/feeds/actions.ts`, "utf8");
    const likeStart = actions.indexOf("export async function likeContentAction");
    const unlikeStart = actions.indexOf("export async function unlikeContentAction");
    const reactionsStart = actions.indexOf("export async function getReactionsAction");
    const likeBranch = actions.slice(likeStart, unlikeStart);
    const unlikeBranch = actions.slice(unlikeStart, reactionsStart);
    assert.match(likeBranch, /orchestrateCommentReaction\(\{/);
    assert.match(unlikeBranch, /orchestrateCommentReaction\(\{/);
    assert.match(likeBranch, /likeContent\(context\.normalizedCommentId, "comment"/);
    assert.match(unlikeBranch, /unlikeContent\(context\.normalizedCommentId, "comment"/);
    assert.doesNotMatch(likeBranch, /const didMutate = await likeContent\(contentId, contentType/);
    assert.doesNotMatch(unlikeBranch, /const context = await getPostAndFeedForContent\(contentId, contentType\)/);
}

async function main() {
    await testGenericSuccessAndDenialMatrix();
    await testEventStrictBindingAndNoticeboard();
    await testRealPolicyDeniedOrchestration();
    await testEventOrchestratedMatrix();
    await testSourceAndDiscussionOrchestration();
    await testMutationHighlightNoOpsAndSelfLike();
    await testIdentityMismatchDenials();
    await testProductionWiring();
    console.log("comment reaction access policy tests passed");
}

void main();
