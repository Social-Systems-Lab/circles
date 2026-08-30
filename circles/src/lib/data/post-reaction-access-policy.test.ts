import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import type { Circle, Feed, Member, Post } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { getPostReactionFeature } from "./constants";
import { resolveReadablePostContext } from "./post-access-policy";
import {
    orchestratePostReaction,
    POST_REACTION_UNAVAILABLE_MESSAGE,
    resolvePostReactionContext,
} from "./post-reaction-access-policy";
import { canReadPostSource, type PostSourceType } from "./post-source-access-policy";

const actorDid = "did:actor";

type Options = {
    secret?: boolean;
    member?: boolean;
    moderationStatus?: Circle["moderationStatus"];
    postType?: Post["postType"];
    userGroups?: string[];
    memberGroups?: string[];
    sourceType?: PostSourceType;
    legacyFunding?: boolean;
    sourceId?: string;
    sourceExists?: boolean;
    sourceOwnerSecret?: boolean;
    sourceMember?: boolean;
    eventHostMode?: "readable" | "missing" | "malformed" | "secret-denied";
    missingPost?: boolean;
    missingFeed?: boolean;
    missingCircle?: boolean;
    malformedFeed?: boolean;
    malformedCircle?: boolean;
    authorAvailable?: boolean;
    authorEligible?: boolean;
    featureAllowed?: boolean;
    shiftPreview?: boolean;
};

function fixture(options: Options = {}) {
    const postId = new ObjectId();
    const feedId = new ObjectId();
    const circleId = new ObjectId();
    const sourceId = new ObjectId();
    const sourceOwnerId = new ObjectId();
    const eventHostId = new ObjectId();
    const sourceMarker = options.sourceType
        ? options.legacyFunding
            ? { internalPreviewType: "funding" as const, internalPreviewId: options.sourceId ?? sourceId.toHexString() }
            : options.sourceType === "funding"
              ? { sourceResourceType: "funding" as const, sourceResourceId: options.sourceId ?? sourceId.toHexString() }
              : { parentItemType: options.sourceType, parentItemId: options.sourceId ?? sourceId.toHexString() }
        : {};
    const post = {
        _id: postId,
        feedId: options.malformedFeed ? "malformed" : feedId.toHexString(),
        postType: options.postType ?? "post",
        createdBy: "did:author",
        createdAt: new Date(),
        content: "content",
        reactions: {},
        comments: 0,
        userGroups: options.userGroups ?? ["everyone"],
        ...(options.shiftPreview ? { internalPreviewType: "task" as const } : {}),
        ...sourceMarker,
    } as Post;
    const feed = { _id: feedId, circleId: options.malformedCircle ? "malformed" : circleId.toHexString() } as Feed;
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
        moderationStatus: "active",
    } as Circle;
    const eventHost = {
        _id: eventHostId,
        circleType: "circle",
        visibility: options.eventHostMode === "secret-denied" ? "secret" : "public",
        moderationStatus: "active",
    } as Circle;

    const resolveReadable = (candidateId: string, viewerDid?: string) =>
        resolveReadablePostContext(candidateId, viewerDid, {
            findPost: async (id) => (!options.missingPost && id.equals(postId) ? post : null),
            findFeed: async (id) => (!options.missingFeed && id.equals(feedId) ? feed : null),
            findCircle: async (id) => (!options.missingCircle && id.equals(circleId) ? circle : null),
            findMember: async (did, ownerId) => {
                const ownsCircle = ownerId === circleId.toHexString() && options.member;
                const ownsSource = ownerId === sourceOwnerId.toHexString() && options.sourceMember;
                if (did !== actorDid || (!ownsCircle && !ownsSource)) return null;
                return { userDid: did, circleId: ownerId, userGroups: options.memberGroups ?? [] } as Member;
            },
            findAuthor: async () =>
                options.authorAvailable === false
                    ? null
                    : ({ did: "did:author", isVerified: options.authorEligible !== false } as Circle),
            authorizeFeature: async () => true,
            canReadSource: (candidate, did) =>
                canReadPostSource(candidate, did, {
                    findSource: async (type, id) => {
                        if (options.sourceExists === false || type !== options.sourceType || !id.equals(sourceId))
                            return null;
                        return {
                            _id: sourceId,
                            circleId: sourceOwnerId.toHexString(),
                            ...(type === "event"
                                ? {
                                      hostCircleIds:
                                          options.eventHostMode === "malformed"
                                              ? ["malformed"]
                                              : options.eventHostMode
                                                ? [eventHostId.toHexString()]
                                                : [],
                                  }
                                : {}),
                            ...(options.legacyFunding ? { noticeboardPostId: postId.toHexString() } : {}),
                        } as never;
                    },
                    findCircles: async (ids) =>
                        ids
                            .map((id) => {
                                if (id.equals(sourceOwnerId)) return sourceOwner;
                                if (id.equals(eventHostId) && options.eventHostMode !== "missing") return eventHost;
                                return null;
                            })
                            .filter(Boolean) as Circle[],
                    canReadOwner: async (did, owner) =>
                        owner.visibility !== "secret" ||
                        (did === actorDid &&
                            owner._id?.toString() === sourceOwnerId.toHexString() &&
                            options.sourceMember === true),
                }),
        });

    const resolve = (did = actorDid) =>
        resolvePostReactionContext(postId.toHexString(), did, {
            resolveReadableContext: resolveReadable,
            canWriteCircle: canWriteCircleByLifecycle,
            getReactionFeature: getPostReactionFeature,
            authorizeFeature: async () => options.featureAllowed !== false,
        });
    return { postId: postId.toHexString(), post, resolve, resolveReadable };
}

async function testSuccessAndSourceMatrix() {
    for (const [label, options] of [
        ["public", {}],
        ["Secret member", { secret: true, member: true }],
        ["Discussion", { postType: "discussion" }],
        ["Secret Discussion", { postType: "discussion", secret: true, member: true }],
        ["Shift preview", { postType: "post", shiftPreview: true }],
        ["Task", { sourceType: "task" }],
        ["Event all hosts", { sourceType: "event", eventHostMode: "readable" }],
        ["Goal", { sourceType: "goal" }],
        ["Issue", { sourceType: "issue" }],
        ["Proposal", { sourceType: "proposal" }],
        ["Funding", { sourceType: "funding" }],
        ["legacy Funding", { sourceType: "funding", legacyFunding: true }],
        ["Secret source current member", { sourceType: "task", sourceOwnerSecret: true, sourceMember: true }],
    ] as Array<[string, Options]>) {
        assert.ok(await fixture(options).resolve(), label);
    }
}

async function testNeutralDenials() {
    const cases: Array<[string, Options, string?]> = [
        ["missing Post", { missingPost: true }],
        ["missing Feed", { missingFeed: true }],
        ["missing Circle", { missingCircle: true }],
        ["malformed Feed", { malformedFeed: true }],
        ["malformed Circle", { malformedCircle: true }],
        ["paused", { moderationStatus: "paused" }],
        ["suspended", { moderationStatus: "suspended" }],
        ["removed", { moderationStatus: "removed" }],
        ["user group", { userGroups: ["team"], member: true, memberGroups: ["other"] }],
        ["author", { authorAvailable: false }],
        ["ineligible author", { authorEligible: false }],
        ["feature", { featureAllowed: false }],
        ["missing source", { sourceType: "task", sourceExists: false }],
        ["source access loss", { sourceType: "task", sourceOwnerSecret: true }],
        ["malformed source", { sourceType: "task", sourceId: "bad" }],
        ["missing Event host", { sourceType: "event", eventHostMode: "missing" }],
        ["malformed Event host", { sourceType: "event", eventHostMode: "malformed" }],
        ["unreadable Event host", { sourceType: "event", eventHostMode: "secret-denied" }],
        ["Secret former", { secret: true }, "did:former"],
        ["Secret outsider", { secret: true }, "did:outsider"],
        ["Secret superadmin", { secret: true }, "did:superadmin"],
        ["Secret admin", { secret: true }, "did:admin"],
        ["Secret moderator", { secret: true }, "did:moderator"],
        ["paused Discussion", { postType: "discussion", moderationStatus: "paused" }],
        ["Secret Discussion outsider", { postType: "discussion", secret: true }, "did:outsider"],
    ];
    for (const [label, options, did] of cases) {
        const target = fixture(options);
        let mutation = 0;
        let notification = 0;
        const result = await orchestratePostReaction({
            postId: target.postId,
            actorDid: did ?? actorDid,
            resolveContext: (id, actor) => (id === target.postId ? target.resolve(actor) : Promise.resolve(null)),
            mutate: async () => (++mutation, true),
            afterMutation: async () => void ++notification,
        });
        assert.deepEqual(result, { ok: false, message: POST_REACTION_UNAVAILABLE_MESSAGE }, label);
        assert.deepEqual(
            { mutation, counter: mutation, notification, highlightedComment: 0, revalidation: 0 },
            {
                mutation: 0,
                counter: 0,
                notification: 0,
                highlightedComment: 0,
                revalidation: 0,
            },
            label,
        );
    }

    const malformed = fixture();
    const resolveMalformed = () =>
        resolvePostReactionContext("malformed", actorDid, {
            resolveReadableContext: malformed.resolveReadable,
            canWriteCircle: canWriteCircleByLifecycle,
            getReactionFeature: getPostReactionFeature,
            authorizeFeature: async () => true,
        });
    let malformedMutation = 0;
    assert.deepEqual(
        await orchestratePostReaction({
            postId: "malformed",
            actorDid,
            resolveContext: resolveMalformed,
            mutate: async () => (++malformedMutation, true),
        }),
        { ok: false, message: POST_REACTION_UNAVAILABLE_MESSAGE },
    );
    assert.equal(malformedMutation, 0);
}

async function testMutationAndNotificationOrdering() {
    const target = fixture();
    const order: string[] = [];
    const first = await orchestratePostReaction({
        postId: target.postId,
        actorDid,
        resolveContext: async (id, actor) => (order.push("authorize"), target.resolve(actor)),
        mutate: async () => (order.push("mutate/counter"), true),
        afterMutation: async () => void order.push("notification"),
    });
    assert.equal(first.ok && first.didMutate, true);
    assert.deepEqual(order, ["authorize", "mutate/counter", "notification"]);

    order.length = 0;
    const duplicate = await orchestratePostReaction({
        postId: target.postId,
        actorDid,
        resolveContext: target.resolve,
        mutate: async () => (order.push("mutate"), false),
        afterMutation: async () => void order.push("notification"),
    });
    assert.equal(duplicate.ok && duplicate.didMutate, false);
    assert.deepEqual(order, ["mutate"]);
}

async function testProductionWiring() {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const actions = await readFile(`${root}/src/components/modules/feeds/actions.ts`, "utf8");
    const likeBranch = actions.slice(actions.indexOf("export async function likeContentAction"));
    const unlikeBranch = actions.slice(actions.indexOf("export async function unlikeContentAction"));
    assert.match(likeBranch, /if \(contentType === "post"\)[\s\S]*orchestratePostReaction\(\{/);
    assert.match(unlikeBranch, /if \(contentType === "post"\)[\s\S]*orchestratePostReaction\(\{/);
    assert.match(likeBranch, /orchestrateCommentReaction\(\{/);
    assert.match(unlikeBranch, /orchestrateCommentReaction\(\{/);

    const feed = await readFile(`${root}/src/lib/data/feed.ts`, "utf8");
    assert.match(feed, /return applyLikeMutation\(\{ contentId, contentType, userDid, reactionType \}/);
    assert.match(feed, /return applyUnlikeMutation\(\{ contentId, contentType, userDid, reactionType \}/);
}

async function main() {
    await testSuccessAndSourceMatrix();
    await testNeutralDenials();
    await testMutationAndNotificationOrdering();
    await testProductionWiring();
    console.log("post reaction access policy tests passed");
}

void main();
