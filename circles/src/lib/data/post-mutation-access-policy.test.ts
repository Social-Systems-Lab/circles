import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import type { Circle, Feed, Member, Post } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { POST_UNAVAILABLE_MESSAGE, resolveReadablePostContext } from "./post-access-policy";
import { canEditOwnPost } from "./post-action-policy";
import { orchestrateOrdinaryPostEdit, resolvePostMutationContext } from "./post-mutation-access-policy";
import { canReadPostSource, getPostSourceReference, type PostSourceType } from "./post-source-access-policy";
import { orchestrateMainPostUpdate } from "./post-write-policy";

const actorDid = "did:author";

function fixture(options: {
    secret?: boolean;
    member?: boolean;
    moderationStatus?: Circle["moderationStatus"];
    sourceType?: PostSourceType;
    sourceId?: string;
    sourceExists?: boolean;
    sourceReadable?: boolean;
    missingPost?: boolean;
    missingFeed?: boolean;
    missingCircle?: boolean;
    malformedFeed?: boolean;
    malformedCircle?: boolean;
    malformedEventHosts?: boolean;
    legacyFunding?: boolean;
    postType?: Post["postType"];
}) {
    const postObjectId = new ObjectId();
    const feedObjectId = new ObjectId();
    const circleObjectId = new ObjectId();
    const sourceObjectId = new ObjectId();
    const sourceOwnerObjectId = new ObjectId();
    const sourceId = options.sourceId ?? sourceObjectId.toHexString();
    const circle = {
        _id: circleObjectId,
        circleType: "circle",
        visibility: options.secret ? "secret" : "public",
        moderationStatus: options.moderationStatus ?? "active",
        enabledModules: ["feed", "discussions"],
    } as Circle;
    const feed = {
        _id: feedObjectId,
        circleId: options.malformedCircle ? "bad-circle" : circleObjectId.toHexString(),
    } as Feed;
    const sourceMarker = options.sourceType
        ? options.legacyFunding
            ? { internalPreviewType: "funding" as const, internalPreviewId: sourceId }
            : options.sourceType === "funding"
              ? { sourceResourceType: "funding" as const, sourceResourceId: sourceId }
              : { parentItemType: options.sourceType, parentItemId: sourceId }
        : {};
    const post = {
        _id: postObjectId,
        feedId: options.malformedFeed ? "bad-feed" : feedObjectId.toHexString(),
        postType: options.postType ?? "post",
        createdBy: actorDid,
        createdAt: new Date(),
        content: "ordinary",
        reactions: {},
        comments: 0,
        userGroups: ["everyone"],
        ...sourceMarker,
    } as Post;
    const sourceOwner = {
        _id: sourceOwnerObjectId,
        circleType: "circle",
        visibility: options.sourceReadable === false ? "secret" : "public",
        moderationStatus: "active",
    } as Circle;
    const resolveReadable = (postId: string, viewerDid?: string) =>
        resolveReadablePostContext(postId, viewerDid, {
            findPost: async (id) => (!options.missingPost && id.equals(postObjectId) ? post : null),
            findFeed: async (id) => (!options.missingFeed && id.equals(feedObjectId) ? feed : null),
            findCircle: async (id) => (!options.missingCircle && id.equals(circleObjectId) ? circle : null),
            findMember: async (did, ownerId) =>
                options.member && did === actorDid && ownerId === circleObjectId.toHexString()
                    ? ({ userDid: did, circleId: ownerId } as Member)
                    : null,
            findAuthor: async (did) => (did === actorDid ? ({ did, isVerified: true } as Circle) : null),
            authorizeFeature: async () => true,
            canReadSource: (candidate, did) =>
                canReadPostSource(candidate, did, {
                    findSource: async (type, id) => {
                        if (
                            options.sourceExists === false ||
                            type !== options.sourceType ||
                            !id.equals(sourceObjectId)
                        ) {
                            return null;
                        }
                        return {
                            _id: sourceObjectId,
                            circleId: sourceOwnerObjectId.toHexString(),
                            ...(type === "event"
                                ? { hostCircleIds: options.malformedEventHosts ? ["bad-host"] : [] }
                                : {}),
                            ...(options.legacyFunding ? { noticeboardPostId: postObjectId.toHexString() } : {}),
                        } as never;
                    },
                    findCircles: async (ids) => (ids.some((id) => id.equals(sourceOwnerObjectId)) ? [sourceOwner] : []),
                    canReadOwner: async (_did, owner) => owner.visibility !== "secret",
                }),
        });
    return { postId: postObjectId.toHexString(), post, feed, circle, resolveReadable };
}

async function resolve(input: ReturnType<typeof fixture>, did = actorDid) {
    return resolvePostMutationContext(input.postId, did, {
        resolveReadableContext: input.resolveReadable,
        canWriteCircle: canWriteCircleByLifecycle,
        classifySource: getPostSourceReference,
    });
}

async function testOrdinaryAndSecretActorMatrix() {
    assert.ok(await resolve(fixture({})));
    assert.ok(await resolve(fixture({ secret: true, member: true })));
    for (const did of ["did:former", "did:outsider", "did:superadmin", "did:circle-admin"]) {
        assert.equal(await resolve(fixture({ secret: true }), did), null, did);
    }
}

async function testLifecycleAndBindings() {
    assert.ok(await resolve(fixture({ moderationStatus: "active" })));
    for (const moderationStatus of ["paused", "suspended", "removed"] as const) {
        assert.equal(await resolve(fixture({ moderationStatus })), null, moderationStatus);
    }
    for (const options of [
        { missingPost: true },
        { missingFeed: true },
        { missingCircle: true },
        { malformedFeed: true },
        { malformedCircle: true },
    ]) {
        assert.equal(await resolve(fixture(options)), null);
    }
    const malformed = fixture({});
    malformed.postId = "malformed";
    assert.equal(await resolve(malformed), null);
}

async function testCanonicalSourceMatrix() {
    for (const sourceType of ["task", "event", "goal", "issue", "proposal", "funding"] as const) {
        assert.equal(await resolve(fixture({ sourceType })), null, sourceType);
    }
    assert.equal(await resolve(fixture({ sourceType: "task", sourceExists: false })), null);
    assert.equal(await resolve(fixture({ sourceType: "task", sourceId: "malformed" })), null);
    assert.equal(await resolve(fixture({ sourceType: "event", malformedEventHosts: true })), null);
    assert.equal(await resolve(fixture({ sourceType: "task", sourceReadable: false })), null);

    const legacy = fixture({ sourceType: "funding", legacyFunding: true });
    assert.deepEqual(getPostSourceReference(legacy.post), {
        type: "funding",
        id: legacy.post.internalPreviewId,
        marker: "legacyFunding",
    });
    assert.equal(await resolve(legacy), null, "existing resolver classifies legacy Funding with an id");
    assert.equal(
        getPostSourceReference({ internalPreviewType: "funding" } as Post),
        null,
        "legacy Funding without an id is not source classified",
    );
}

async function testAccessLossHasZeroEffects() {
    const deniedTargets: Array<[string, ReturnType<typeof fixture>, string?, string?]> = [
        ["Secret former member/source-access loss", fixture({ secret: true, member: false })],
        ["paused Circle", fixture({ moderationStatus: "paused" })],
        ["missing Feed", fixture({ missingFeed: true })],
        ["missing Circle", fixture({ missingCircle: true })],
        ["missing source", fixture({ sourceType: "task", sourceExists: false })],
        ["malformed source", fixture({ sourceType: "task", sourceId: "malformed" })],
        ["malformed Event host", fixture({ sourceType: "event", malformedEventHosts: true })],
        ["unreadable Event host", fixture({ sourceType: "event", sourceReadable: false })],
    ];
    const malformedPost = fixture({});
    malformedPost.postId = "malformed";
    deniedTargets.push(["malformed Post", malformedPost]);
    const missingPost = fixture({ missingPost: true });
    deniedTargets.push(["missing Post", missingPost]);
    const mismatch = fixture({});
    deniedTargets.push(["caller Circle mismatch", mismatch, actorDid, new ObjectId().toHexString()]);
    for (const sourceType of ["task", "event", "goal", "issue", "proposal", "funding"] as const) {
        deniedTargets.push([`${sourceType} source`, fixture({ sourceType })]);
    }
    deniedTargets.push(["legacy Funding source", fixture({ sourceType: "funding", legacyFunding: true })]);

    for (const [label, target, did = actorDid, submittedCircleId] of deniedTargets) {
        const { result, effects } = await runProductionEdit(target, did, submittedCircleId);
        assert.deepEqual(result, { ok: false, message: POST_UNAVAILABLE_MESSAGE }, label);
        assert.deepEqual(effects, { ...emptyEffects(), mutationContext: 1, order: ["mutation context"] }, label);
    }
}

type Effects = {
    mutationContext: number;
    authorization: number;
    content: number;
    preview: number;
    mentions: number;
    media: number;
    reconciliation: number;
    update: number;
    vector: number;
    derivedVector: number;
    notification: number;
    order: string[];
};

const emptyEffects = (): Effects => ({
    mutationContext: 0,
    authorization: 0,
    content: 0,
    preview: 0,
    mentions: 0,
    media: 0,
    reconciliation: 0,
    update: 0,
    vector: 0,
    derivedVector: 0,
    notification: 0,
    order: [],
});

async function runProductionEdit(
    target: ReturnType<typeof fixture>,
    did = actorDid,
    submittedCircleId = target.feed.circleId,
) {
    const effects = emptyEffects();
    const result = await orchestrateOrdinaryPostEdit({
        postId: target.postId,
        actorDid: did,
        submittedCircleId,
        resolveMutationContext: (postId, actor) => {
            effects.mutationContext++;
            effects.order.push("mutation context");
            return resolvePostMutationContext(postId, actor, {
                resolveReadableContext: target.resolveReadable,
                canWriteCircle: canWriteCircleByLifecycle,
                classifySource: getPostSourceReference,
            });
        },
        authorize: async ({ post }) => {
            effects.authorization++;
            effects.order.push("authorization");
            return canEditOwnPost({
                postType: post.postType,
                isAuthor: post.createdBy === did,
                isCreateAuthorized: true,
            });
        },
        execute: async ({ post, normalizedPostId }) =>
            orchestrateMainPostUpdate({
                content: "changed content",
                storedContent: post.content,
                storedMentions: post.mentions ?? [],
                writerDid: did,
                baseUpdate: { _id: normalizedPostId, postType: post.postType },
                resolve: async (content) => {
                    effects.content++;
                    effects.mentions++;
                    effects.order.push("content/mentions");
                    return { ok: true, content, mentions: [] };
                },
                resolvePreview: async () => {
                    effects.preview++;
                    effects.order.push("preview");
                    return { mode: "preserve" };
                },
                upload: async () => {
                    effects.media++;
                    effects.reconciliation++;
                    effects.order.push("media");
                    return [];
                },
                applyUpload: () => undefined,
                persistAndPublishVector: async () => {
                    effects.update++;
                    effects.vector++;
                    effects.order.push("update/vector");
                    return undefined;
                },
                notify: async () => {
                    effects.notification++;
                    effects.order.push("notification");
                },
            }),
    });
    return { result, effects };
}

async function testSuccessfulProductionSeamEdits() {
    for (const [label, target] of [
        ["public ordinary", fixture({})],
        ["Secret member ordinary", fixture({ secret: true, member: true })],
        ["Discussion", fixture({ postType: "discussion" })],
    ] as const) {
        const { result, effects } = await runProductionEdit(target);
        assert.equal(result.ok, true, label);
        assert.deepEqual(
            effects,
            {
                mutationContext: 1,
                authorization: 1,
                content: 1,
                preview: 1,
                mentions: 1,
                media: 1,
                reconciliation: 1,
                update: 1,
                vector: 1,
                derivedVector: 0,
                notification: 1,
                order: [
                    "mutation context",
                    "authorization",
                    "content/mentions",
                    "preview",
                    "media",
                    "update/vector",
                    "notification",
                ],
            },
            label,
        );
    }
}

async function testProductionWiringAndOrdering() {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const actions = await readFile(`${root}/src/components/modules/feeds/actions.ts`, "utf8");
    const action = actions.slice(actions.indexOf("export async function updatePostAction"));
    assert.match(action, /orchestrateOrdinaryPostEdit\(\{/);
    assert.match(action, /submittedCircleId: circleId/);
    assert.match(action, /execute: async \(\{ post, feed, normalizedPostId: postId \}\)/);
}

async function main() {
    await testOrdinaryAndSecretActorMatrix();
    await testLifecycleAndBindings();
    await testCanonicalSourceMatrix();
    await testAccessLossHasZeroEffects();
    await testSuccessfulProductionSeamEdits();
    await testProductionWiringAndOrdering();
    console.log("post mutation access policy tests passed");
}

void main();
