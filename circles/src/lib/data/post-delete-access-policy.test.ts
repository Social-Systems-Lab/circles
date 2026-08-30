import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Feed, Member, Post } from "@/models/models";
import { canWriteCircleByLifecycle } from "./circle-lifecycle-policy";
import { POST_UNAVAILABLE_MESSAGE, resolveReadablePostContext } from "./post-access-policy";
import { canDeletePost } from "./post-action-policy";
import {
    isTaskNoticeboardPost,
    orchestrateOrdinaryPostDelete,
    resolvePostDeleteContext,
    type PostDeleteContext,
} from "./post-delete-access-policy";
import { resolvePostMutationContext } from "./post-mutation-access-policy";
import { canReadPostSource, getPostSourceReference, type PostSourceType } from "./post-source-access-policy";

const authorDid = "did:author";
const otherAuthorDid = "did:other-author";
const moderatorDid = "did:moderator";

type FixtureOptions = {
    actorDid?: string;
    visibility?: "public" | "secret";
    memberDids?: string[];
    moderationStatus?: Circle["moderationStatus"];
    postType?: Post["postType"];
    creator?: string;
    previewType?: Post["internalPreviewType"];
    previewId?: string;
    previewWithoutId?: boolean;
    sourceType?: PostSourceType;
    sourceId?: string;
    sourceExists?: boolean;
    legacyFunding?: boolean;
    partialSourceMarker?: boolean;
    missingPost?: boolean;
    missingFeed?: boolean;
    missingCircle?: boolean;
    eventHost?: "readable" | "missing" | "malformed" | "secret-unreadable";
    shiftReverseOwner?: boolean;
    shiftLookupError?: boolean;
    pinned?: boolean;
    closed?: boolean;
};

function fixture(options: FixtureOptions = {}) {
    const actorDid = options.actorDid ?? authorDid;
    const postObjectId = new ObjectId();
    const feedObjectId = new ObjectId();
    const circleObjectId = new ObjectId();
    const sourceObjectId = new ObjectId();
    const sourceOwnerObjectId = new ObjectId();
    const eventHostObjectId = new ObjectId();
    const sourceId = options.sourceId ?? sourceObjectId.toHexString();
    const circle = {
        _id: circleObjectId,
        circleType: "circle",
        visibility: options.visibility ?? "public",
        moderationStatus: options.moderationStatus ?? "active",
        enabledModules: ["feed", "discussions"],
    } as Circle;
    const feed = { _id: feedObjectId, circleId: circleObjectId.toHexString() } as Feed;
    const marker = options.partialSourceMarker
        ? { parentItemType: "task" as const }
        : options.sourceType
          ? options.legacyFunding
              ? { internalPreviewType: "funding" as const, internalPreviewId: sourceId }
              : options.sourceType === "funding"
                ? { sourceResourceType: "funding" as const, sourceResourceId: sourceId }
                : { parentItemType: options.sourceType, parentItemId: sourceId }
          : options.previewType
            ? {
                  internalPreviewType: options.previewType,
                  ...(options.previewWithoutId ? {} : { internalPreviewId: options.previewId ?? sourceId }),
              }
            : {};
    const post = {
        _id: postObjectId,
        feedId: feedObjectId.toHexString(),
        postType: options.postType ?? "post",
        createdBy: options.creator ?? authorDid,
        createdAt: new Date(),
        content: "post",
        reactions: {},
        comments: 0,
        userGroups: ["everyone"],
        ...(options.pinned ? { isPinned: true } : {}),
        ...(options.closed ? { isClosed: true } : {}),
        ...marker,
    } as Post;
    const sourceOwner = {
        _id: sourceOwnerObjectId,
        circleType: "circle",
        visibility: "public",
        moderationStatus: "active",
    } as Circle;
    const eventHost = {
        _id: eventHostObjectId,
        circleType: "circle",
        visibility: options.eventHost === "secret-unreadable" ? "secret" : "public",
        moderationStatus: "active",
    } as Circle;
    const circles = new Map<string, Circle>([
        [sourceOwnerObjectId.toHexString(), sourceOwner],
        ...(options.eventHost === "missing" || options.eventHost === "malformed"
            ? []
            : ([[eventHostObjectId.toHexString(), eventHost]] as Array<[string, Circle]>)),
    ]);
    const memberDids = new Set(options.memberDids ?? []);
    const shiftQueries: Array<{ noticeboardPostId: string }> = [];

    const findMember = async (did: string, ownerId: string): Promise<Member | null> =>
        memberDids.has(did) && ownerId === circleObjectId.toHexString()
            ? ({ userDid: did, circleId: ownerId } as Member)
            : null;

    const resolveReadable = (postId: string, viewerDid?: string) =>
        resolveReadablePostContext(postId, viewerDid, {
            findPost: async (id) => (!options.missingPost && id.equals(postObjectId) ? post : null),
            findFeed: async (id) => (!options.missingFeed && id.equals(feedObjectId) ? feed : null),
            findCircle: async (id) => (!options.missingCircle && id.equals(circleObjectId) ? circle : null),
            findMember,
            findAuthor: async (did) =>
                [authorDid, otherAuthorDid].includes(did) ? ({ did, isVerified: true } as Circle) : null,
            authorizeFeature: async () => true,
            canReadSource: (candidate, viewer) =>
                canReadPostSource(candidate, viewer, {
                    findSource: async (type, id) => {
                        if (options.sourceExists === false || type !== options.sourceType || !id.equals(sourceObjectId))
                            return null;
                        return {
                            _id: sourceObjectId,
                            circleId: sourceOwnerObjectId.toHexString(),
                            ...(type === "event"
                                ? {
                                      hostCircleIds:
                                          options.eventHost === "malformed"
                                              ? ["malformed-host"]
                                              : [eventHostObjectId.toHexString()],
                                  }
                                : {}),
                            ...(options.legacyFunding ? { noticeboardPostId: postObjectId.toHexString() } : {}),
                        } as never;
                    },
                    findCircles: async (ids) =>
                        ids.flatMap((id) => (circles.get(id.toHexString()) ? [circles.get(id.toHexString())!] : [])),
                    canReadOwner: async (viewer, owner) => {
                        const { canReadCircle } = await import("./circle-visibility-policy");
                        return canReadCircle(viewer, owner, { getMember: findMember });
                    },
                }),
        });

    const resolve = (postId = postObjectId.toHexString(), did = actorDid) =>
        resolvePostDeleteContext(postId, did, {
            resolveMutationContext: (id, viewer) =>
                resolvePostMutationContext(id, viewer, {
                    resolveReadableContext: resolveReadable,
                    canWriteCircle: canWriteCircleByLifecycle,
                    classifySource: getPostSourceReference,
                }),
            isTaskNoticeboardPost: (id) =>
                isTaskNoticeboardPost(id, {
                    findTask: async (query) => {
                        shiftQueries.push(query);
                        if (options.shiftLookupError) throw new Error("lookup failed");
                        return options.shiftReverseOwner ? { _id: new ObjectId() } : null;
                    },
                }),
        });

    return { actorDid, postId: postObjectId.toHexString(), post, circle, resolve, shiftQueries };
}

async function run(target: ReturnType<typeof fixture>, actorDid = target.actorDid) {
    let deletes = 0;
    let revalidations = 0;
    let deletedPostId: string | undefined;
    const result = await orchestrateOrdinaryPostDelete({
        postId: target.postId,
        actorDid,
        resolveDeleteContext: target.resolve,
        authorize: async ({ post }) =>
            canDeletePost({
                postType: post.postType,
                isAuthor: post.createdBy === actorDid,
                isCreateAuthorized: true,
                isModerateAuthorized: post.createdBy !== actorDid && actorDid === moderatorDid,
            }),
        executeDelete: async ({ normalizedPostId }) => {
            deletes++;
            deletedPostId = normalizedPostId;
        },
        revalidate: async () => {
            revalidations++;
        },
    });
    return { result, deletes, revalidations, deletedPostId };
}

async function assertDenied(
    label: string,
    target: ReturnType<typeof fixture>,
    postId = target.postId,
    did = target.actorDid,
) {
    assert.equal(await target.resolve(postId, did), null, `${label}: context`);
    target.postId = postId;
    const outcome = await run(target, did);
    assert.deepEqual(outcome.result, { ok: false, message: POST_UNAVAILABLE_MESSAGE }, label);
    // executeDelete is the low-level deletePost boundary; zero calls also proves zero vector/Post/Comment/Reaction deletion.
    assert.equal(outcome.deletes, 0, `${label}: low-level deletePost`);
    assert.equal(outcome.revalidations, 0, `${label}: revalidation`);
}

async function assertAllowed(label: string, target: ReturnType<typeof fixture>, did = target.actorDid) {
    const context = await target.resolve(target.postId, did);
    assert.ok(context, `${label}: context`);
    assert.equal(context.normalizedPostId, target.postId.toLowerCase(), `${label}: canonical id`);
    const outcome = await run(target, did);
    assert.deepEqual(outcome.result, { ok: true }, label);
    assert.equal(outcome.deletes, 1, `${label}: delete`);
    assert.equal(outcome.deletedPostId, target.postId.toLowerCase(), `${label}: delete id`);
    assert.equal(outcome.revalidations, 1, `${label}: revalidation`);
}

async function testSecretAndLifecycleMatrices() {
    await assertAllowed("public active author", fixture());
    await assertAllowed("Secret current-member author", fixture({ visibility: "secret", memberDids: [authorDid] }));
    for (const did of ["did:former", "did:outsider", "did:superadmin", "did:circle-admin", moderatorDid])
        await assertDenied(`Secret nonmember ${did}`, fixture({ visibility: "secret", actorDid: did }), undefined, did);
    for (const status of ["paused", "suspended", "removed"] as const)
        await assertDenied(`${status} Circle`, fixture({ moderationStatus: status }));
}

async function testMalformedMissingAndSourceMatrices() {
    await assertDenied("malformed Post ID", fixture(), "malformed");
    await assertDenied("missing Post", fixture({ missingPost: true }));
    await assertDenied("missing Feed", fixture({ missingFeed: true }));
    await assertDenied("missing Circle", fixture({ missingCircle: true }));
    await assertDenied("malformed source ID", fixture({ sourceType: "task", sourceId: "malformed" }));
    await assertDenied("missing source", fixture({ sourceType: "task", sourceExists: false }));
    await assertDenied("partial source marker", fixture({ partialSourceMarker: true }));
    await assertDenied("malformed Event host", fixture({ sourceType: "event", eventHost: "malformed" }));
    await assertDenied("missing Event host", fixture({ sourceType: "event", eventHost: "missing" }));
    await assertDenied("unreadable Event host", fixture({ sourceType: "event", eventHost: "secret-unreadable" }));
    for (const sourceType of ["task", "event", "goal", "issue", "proposal", "funding"] as const)
        await assertDenied(`${sourceType} source-generated Post`, fixture({ sourceType, eventHost: "readable" }));
    await assertDenied("complete legacy Funding", fixture({ sourceType: "funding", legacyFunding: true }));
    await assertDenied("Event comment shadow", fixture({ sourceType: "event", eventHost: "readable" }));
    await assertDenied("multi-host Event noticeboard", fixture({ sourceType: "event", eventHost: "readable" }));
}

async function testShiftAndOrdinaryPreviews() {
    const owned = fixture({ previewType: "task", shiftReverseOwner: true });
    await assertDenied("Shift noticeboard reverse ownership", owned);
    assert.deepEqual(owned.shiftQueries, [
        { noticeboardPostId: owned.postId.toLowerCase() },
        { noticeboardPostId: owned.postId.toLowerCase() },
    ]);

    const copied = fixture({ previewType: "task" });
    await assertAllowed("copied Task preview", copied);
    assert.deepEqual(copied.shiftQueries, [
        { noticeboardPostId: copied.postId.toLowerCase() },
        { noticeboardPostId: copied.postId.toLowerCase() },
    ]);

    await assertDenied("Shift lookup failure", fixture({ previewType: "task", shiftLookupError: true }));
    for (const previewType of ["event", "goal", "issue", "proposal"] as const)
        await assertAllowed(`${previewType} preview`, fixture({ previewType }));
    await assertAllowed("legacy Funding without ID", fixture({ previewType: "funding", previewWithoutId: true }));
}

async function testSuccessfulAuthorityAndDiscussion() {
    await assertAllowed("public author", fixture());
    await assertAllowed("Secret author", fixture({ visibility: "secret", memberDids: [authorDid] }));
    await assertAllowed("public moderator", fixture({ actorDid: moderatorDid, creator: otherAuthorDid }), moderatorDid);
    await assertAllowed(
        "Secret current-member moderator",
        fixture({
            actorDid: moderatorDid,
            creator: otherAuthorDid,
            visibility: "secret",
            memberDids: [moderatorDid],
        }),
        moderatorDid,
    );
    await assertAllowed("Discussion author", fixture({ postType: "discussion", pinned: true, closed: true }));
    await assertAllowed(
        "Discussion moderator",
        fixture({
            postType: "discussion",
            actorDid: moderatorDid,
            creator: otherAuthorDid,
            pinned: true,
            closed: true,
        }),
        moderatorDid,
    );
    await assertDenied(
        "former member retains Post ID and authorship",
        fixture({ visibility: "secret", memberDids: [], creator: authorDid }),
    );
}

async function main() {
    await testSecretAndLifecycleMatrices();
    await testMalformedMissingAndSourceMatrices();
    await testShiftAndOrdinaryPreviews();
    await testSuccessfulAuthorityAndDiscussion();
    console.log("post delete access policy tests passed");
}

void main();
