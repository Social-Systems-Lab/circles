import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import type { Circle, Feed, Feature, Member, Post } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { features } from "./constants";
import {
    DISCUSSION_MODERATION_UNAVAILABLE_MESSAGE,
    orchestrateDiscussionModeration,
    resolveDiscussionModerationContext,
} from "./discussion-moderation-access-policy";
import { resolveReadablePostContext } from "./post-access-policy";

const actorDid = "did:moderator";

type Options = {
    candidate?: string;
    secret?: boolean;
    member?: boolean;
    moderationStatus?: Circle["moderationStatus"];
    postType?: Post["postType"];
    missingPost?: boolean;
    missingFeed?: boolean;
    missingCircle?: boolean;
    malformedFeedId?: boolean;
    malformedCircleId?: boolean;
    returnedPostMismatch?: boolean;
    returnedFeedMismatch?: boolean;
    discussionsEnabled?: boolean;
    viewAllowed?: boolean;
    moderateAllowed?: boolean;
    feedModerateAllowed?: boolean;
    authorAvailable?: boolean;
    userGroups?: string[];
    memberGroups?: string[];
    markers?: Partial<Post>;
    preview?: boolean;
    shared?: boolean;
};

function fixture(options: Options = {}) {
    const postId = new ObjectId();
    const feedId = new ObjectId();
    const circleId = new ObjectId();
    const otherId = new ObjectId();
    const circle = {
        _id: circleId,
        circleType: "circle",
        visibility: options.secret ? "secret" : "public",
        moderationStatus: options.moderationStatus ?? "active",
        enabledModules: options.discussionsEnabled === false ? ["feed"] : ["feed", "discussions"],
    } as Circle;
    const feed = {
        _id: options.returnedFeedMismatch ? otherId : feedId,
        circleId: options.malformedCircleId ? "bad-circle" : circleId.toHexString(),
    } as Feed;
    const post = {
        _id: options.returnedPostMismatch ? otherId : postId,
        feedId: options.malformedFeedId ? "bad-feed" : feedId.toHexString(),
        postType: options.postType ?? "discussion",
        createdBy: "did:author",
        createdAt: new Date(),
        content: "discussion",
        reactions: {},
        comments: 0,
        userGroups: options.userGroups ?? [],
        ...(options.preview
            ? {
                  internalPreviewType: "circle" as const,
                  internalPreviewId: "preview",
                  internalPreviewUrl: "/circles/preview",
              }
            : {}),
        ...(options.shared ? { sharedPostId: new ObjectId().toHexString() } : {}),
        ...options.markers,
    } as Post;
    const member =
        options.member || options.memberGroups
            ? ({
                  userDid: actorDid,
                  circleId: circleId.toHexString(),
                  userGroups: options.memberGroups ?? [],
              } as Member)
            : null;
    const requestedFeatures: Feature[] = [];
    const resolveReadable = (candidate: string, did?: string) =>
        resolveReadablePostContext(candidate, did, {
            findPost: async (id) => (!options.missingPost && id.equals(postId) ? post : null),
            findFeed: async (id) => (!options.missingFeed && id.equals(feedId) ? feed : null),
            findCircle: async (id) => (!options.missingCircle && id.equals(circleId) ? circle : null),
            findMember: async (didValue, ownerId) =>
                didValue === actorDid && ownerId === circleId.toHexString() ? member : null,
            findAuthor: async (didValue) =>
                options.authorAvailable === false || didValue !== "did:author"
                    ? null
                    : ({ did: didValue, isVerified: true } as Circle),
            authorizeFeature: async () => options.viewAllowed !== false,
            // Source readability is deliberately isolated: the moderation seam must reject every marker itself.
            canReadSource: async () => true,
        });
    const resolveModeration = (candidate: string, did: string) =>
        resolveDiscussionModerationContext(candidate, did, {
            resolveReadableContext: resolveReadable,
            canWriteCircle: canWriteCircleByLifecycle,
            authorize: async (_did, _circleId, feature) => {
                requestedFeatures.push(feature);
                if (feature === features.feed.moderate) return options.feedModerateAllowed !== false;
                return options.moderateAllowed !== false;
            },
        });
    return {
        candidate: options.candidate ?? postId.toHexString().toUpperCase(),
        normalizedId: postId.toHexString(),
        requestedFeatures,
        resolveModeration,
    };
}

async function runBoth(target: ReturnType<typeof fixture>) {
    let pinEffects = 0;
    let closeEffects = 0;
    let pinId: string | undefined;
    let closeId: string | undefined;
    const pin = await orchestrateDiscussionModeration({
        postId: target.candidate,
        actorDid,
        resolveContext: target.resolveModeration,
        persist: async (id) => {
            pinEffects += 1;
            pinId = id;
            return { acknowledged: true };
        },
    });
    const close = await orchestrateDiscussionModeration({
        postId: target.candidate,
        actorDid,
        resolveContext: target.resolveModeration,
        persist: async (id) => {
            closeEffects += 1;
            closeId = id;
            return { acknowledged: true };
        },
    });
    return { pin, close, pinEffects, closeEffects, pinId, closeId };
}

async function assertDenied(label: string, options: Options) {
    const result = await runBoth(fixture(options));
    for (const value of [result.pin, result.close]) {
        assert.deepEqual(value, { ok: false, message: DISCUSSION_MODERATION_UNAVAILABLE_MESSAGE }, label);
    }
    assert.equal(result.pinEffects, 0, `${label}: pin`);
    assert.equal(result.closeEffects, 0, `${label}: close`);
}

async function testZeroEffectDenialMatrix() {
    const markerCases: Array<[string, Partial<Post>]> = [
        ["parent type only", { parentItemType: "event" }],
        ["parent id only", { parentItemId: new ObjectId().toHexString() }],
        ["both parent markers", { parentItemType: "task", parentItemId: new ObjectId().toHexString() }],
        ["source type only", { sourceResourceType: "funding" }],
        ["source id only", { sourceResourceId: new ObjectId().toHexString() }],
        ["both source markers", { sourceResourceType: "funding", sourceResourceId: new ObjectId().toHexString() }],
    ];
    const cases: Array<[string, Options]> = [
        ["malformed id", { candidate: "malformed" }],
        ["missing post", { missingPost: true }],
        ["wrong post type", { postType: "event" }],
        ["malformed feed", { malformedFeedId: true }],
        ["missing feed", { missingFeed: true }],
        ["malformed circle", { malformedCircleId: true }],
        ["missing circle", { missingCircle: true }],
        ["Post/Feed mismatch", { returnedPostMismatch: true }],
        ["Feed/Circle mismatch", { returnedFeedMismatch: true }],
        ["excluded user group", { userGroups: ["editors"], memberGroups: ["moderators"] }],
        ["disabled Discussions module", { discussionsEnabled: false }],
        ["discussions.view denied", { viewAllowed: false }],
        ["unavailable author", { authorAvailable: false }],
        ["Secret former member", { secret: true }],
        ["Secret outsider", { secret: true }],
        ["Secret superadmin nonmember", { secret: true }],
        ["Secret Circle admin/creator nonmember", { secret: true }],
        ["Secret moderator nonmember", { secret: true, moderateAllowed: true }],
        ["paused Circle", { moderationStatus: "paused" }],
        ["suspended Circle", { moderationStatus: "suspended" }],
        ["removed Circle", { moderationStatus: "removed" }],
        ["discussions.moderate denied", { moderateAllowed: false }],
        ["feed moderate only", { moderateAllowed: false, feedModerateAllowed: true }],
        [
            "legacy Event alternate",
            { markers: { parentItemType: "event", parentItemId: new ObjectId().toHexString() } },
        ],
        ...markerCases.map(([label, markers]) => [label, { markers }] as [string, Options]),
    ];
    for (const [label, options] of cases) await assertDenied(label, options);
}

async function testSuccessAndCanonicalIds() {
    for (const [label, options] of [
        ["public", {}],
        ["Secret current member", { secret: true, member: true }],
        ["empty groups", { userGroups: [] }],
        ["everyone", { userGroups: ["everyone"] }],
        ["matching group", { userGroups: ["moderators"], memberGroups: ["moderators"] }],
        ["internal preview", { preview: true }],
        ["shared Discussion", { shared: true }],
        ["discussion moderate without feed moderate", { moderateAllowed: true, feedModerateAllowed: false }],
    ] as Array<[string, Options]>) {
        const target = fixture(options);
        const result = await runBoth(target);
        assert.equal(result.pin.ok, true, label);
        assert.equal(result.close.ok, true, label);
        assert.equal(result.pinId, target.normalizedId, label);
        assert.equal(result.closeId, target.normalizedId, label);
        assert.deepEqual(
            target.requestedFeatures,
            [features.discussions.moderate, features.discussions.moderate],
            label,
        );
    }
}

async function testPersistenceSemanticsRemainDelegatedAndIdempotent() {
    const target = fixture({});
    let pinned = false;
    let closed = false;
    for (const nextPinned of [true, true, false, false]) {
        const result = await orchestrateDiscussionModeration({
            postId: target.candidate,
            actorDid,
            resolveContext: target.resolveModeration,
            persist: async () => (pinned = nextPinned),
        });
        assert.equal(result.ok, true);
        assert.equal(pinned, nextPinned);
    }
    for (let index = 0; index < 2; index += 1) {
        const result = await orchestrateDiscussionModeration({
            postId: target.candidate,
            actorDid,
            resolveContext: target.resolveModeration,
            persist: async () => (closed = true),
        });
        assert.equal(result.ok, true);
        assert.equal(closed, true);
    }
}

async function testProductionCallGraph() {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const actions = await readFile(`${root}/src/app/circles/[handle]/discussions/actions.ts`, "utf8");
    const moderationActions = actions.slice(actions.indexOf("export async function pinDiscussionAction"));
    assert.match(moderationActions, /pinDiscussionAction[\s\S]*orchestrateDiscussionModeration/);
    assert.match(moderationActions, /closeDiscussionAction[\s\S]*orchestrateDiscussionModeration/);
    assert.doesNotMatch(moderationActions, /getDiscussionWithComments/);
    assert.doesNotMatch(moderationActions, /features\.feed\.moderate/);

    const policy = await readFile(`${root}/src/lib/data/discussion-moderation-access-policy.ts`, "utf8");
    assert.match(policy, /features\.discussions\.moderate/);
    assert.doesNotMatch(policy, /features\.feed\.moderate/);

    const discussion = await readFile(`${root}/src/lib/data/discussion.ts`, "utf8");
    assert.match(discussion, /export async function pinDiscussion\(id: string, pinned: boolean\)/);
    assert.match(discussion, /export async function closeDiscussion\(id: string\)/);
    assert.doesNotMatch(
        discussion.slice(discussion.indexOf("export async function pinDiscussion")),
        /isAuthorized|resolveReadablePostContext/,
    );
}

async function main() {
    await testZeroEffectDenialMatrix();
    await testSuccessAndCanonicalIds();
    await testPersistenceSemanticsRemainDelegatedAndIdempotent();
    await testProductionCallGraph();
    console.log("discussion moderation access policy tests passed");
}

void main();
