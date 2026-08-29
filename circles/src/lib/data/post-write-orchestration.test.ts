import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import type { Circle, Feed, Member, Mention, Post } from "@/models/models";
import { canReadCircle } from "./circle-visibility-policy";
import { resolveReadablePostContext } from "./post-access-policy";
import { canReadPostSource } from "./post-source-access-policy";
import {
    getShareablePostPreview,
    resolveInternalPreviewUrl,
    type NestedContentDependencies,
} from "./post-nested-content-policy";
import { resolveInternalPreviewForWrite, resolveInternalPreviewUpdateForWrite } from "./internal-preview-write-policy";
import { resolveSharedOriginalForWrite } from "./shared-original-write-policy";
import type { CircleMentionWriteResult } from "./circle-mention-write-policy";
import {
    POST_WRITE_UNAVAILABLE,
    buildMainPostUpdateBaseDocument,
    isClientCreatablePostType,
    orchestrateAlternateDiscussionCreate,
    orchestrateMainPostCreate,
    orchestrateMainPostUpdate,
} from "./post-write-policy";

const writerDid = "did:writer";
const previewActors = new Map([
    [writerDid, { did: writerDid, isSuperadmin: false }],
    ["did:outsider", { did: "did:outsider", isSuperadmin: false }],
    ["did:superadmin", { did: "did:superadmin", isSuperadmin: true }],
]);
const canonicalMentions: Mention[] = [{ type: "circle", id: "canonical-circle" }];
const canonicalWrite = {
    ok: true as const,
    content: "[Canonical Name](/circles/canonical-handle) [Canonical Name](/circles/canonical-handle)",
    mentions: canonicalMentions,
};

function previewAccessFixture(
    secret: boolean,
    member: boolean,
    moderationStatus: Circle["moderationStatus"] = "active",
) {
    const ownerId = new ObjectId();
    const goalId = new ObjectId();
    const owner = {
        _id: ownerId,
        name: secret ? "Secret" : "Public",
        handle: secret ? "secret-circle" : "public-circle",
        circleType: "circle",
        ...(secret ? { visibility: "secret" as const } : {}),
        moderationStatus,
    } as Circle;
    const goal = { _id: goalId, circleId: ownerId.toString(), title: "Canonical goal", stage: "open" };
    let reads = 0;
    const resolve = async (url: string, did: string) => {
        reads += 1;
        return resolveInternalPreviewUrl(url, did, {
            findResources: async (type, ids) =>
                type === "goal" && ids.some((id) => id.equals(goalId)) ? [goal as never] : [],
            findCirclesByHandles: async () => [],
            findReadableCircles: async (ids) => {
                if (!ids.some((id) => id.equals(ownerId))) return [];
                const actor = previewActors.get(did);
                assert.ok(actor, `preview actor state exists for ${did}`);
                const readable = await canReadCircle(actor.did, owner, {
                    getMember: async (userDid, circleId) =>
                        member && userDid === writerDid && circleId === ownerId.toString()
                            ? ({ userDid, circleId } as never)
                            : null,
                });
                return readable ? [owner] : [];
            },
            findAuthors: async () => [],
            resolvePost: async () => null,
            findReadableMentionCircles: async () => [],
        });
    };
    return { goalId: goalId.toString(), owner, resolve, reads: () => reads };
}

async function testMainCreateSuccess() {
    const stages: string[] = [];
    let persisted: Record<string, unknown> | undefined;
    let inserts = 0;
    let vectors = 0;
    let notifications = 0;
    const forged = {
        mentions: [{ type: "circle", id: "forged-secret" }],
        mentionsDisplay: [{ secret: true }],
        mentionsDetails: [{ secret: true }],
    };

    const result = await orchestrateMainPostCreate({
        postType: "post",
        content: "[Fake](/circles/object-id)",
        writerDid,
        authorizeTarget: async () => (stages.push("target-auth"), true),
        isAllowedPostType: (postType) => (stages.push("postType"), isClientCreatablePostType(postType)),
        resolve: async () => (stages.push("mention"), canonicalWrite),
        resolveShare: async () => (stages.push("share"), "canonical-share"),
        buildDocument: async (_write, _preview, sharedPostId) => ({
            title: "Authored",
            content: "caller",
            createdBy: writerDid,
            sharedPostId,
        }),
        persistAndPublishVector: async (document) => {
            stages.push("persistence");
            inserts += 1;
            persisted = document as Record<string, unknown>;
            stages.push("vector");
            vectors += 1;
            return { ...document, _id: "created" } as Post;
        },
        upload: async () => void stages.push("upload"),
        notify: async (_post, mentions) => {
            stages.push("notification");
            notifications += 1;
            assert.deepEqual(mentions, canonicalMentions);
        },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(stages, [
        "target-auth",
        "postType",
        "mention",
        "share",
        "persistence",
        "vector",
        "upload",
        "notification",
    ]);
    assert.equal(inserts, 1);
    assert.equal(vectors, 1);
    assert.equal(notifications, 1);
    assert.equal(persisted?.content, canonicalWrite.content);
    assert.equal(persisted?.sharedPostId, "canonical-share");
    assert.deepEqual(persisted?.mentions, canonicalMentions);
    assert.equal((persisted?.mentions as Mention[]).length, 1);
    assert.notDeepEqual(persisted?.mentions, forged.mentions);
    for (const key of ["mentionsDisplay", "mentionsDetails"]) assert.equal(key in persisted!, false, key);
}

async function runMainCreateDenial(input: {
    postType: string;
    resolve: () => Promise<CircleMentionWriteResult>;
    resolveShare?: () => Promise<string>;
}) {
    const calls = { authorize: 0, postType: 0, mention: 0, share: 0, persist: 0, vector: 0, upload: 0, notify: 0 };
    const result = await orchestrateMainPostCreate({
        postType: input.postType,
        content: "content",
        writerDid,
        authorizeTarget: async () => ((calls.authorize += 1), true),
        isAllowedPostType: (postType) => ((calls.postType += 1), isClientCreatablePostType(postType)),
        resolve: async () => ((calls.mention += 1), input.resolve()),
        resolveShare: input.resolveShare ? async () => ((calls.share += 1), input.resolveShare!()) : undefined,
        buildDocument: async () => ({ content: "caller", createdBy: writerDid }),
        persistAndPublishVector: async (document) => {
            calls.persist += 1;
            calls.vector += 1;
            return document;
        },
        upload: async () => void (calls.upload += 1),
        notify: async () => void (calls.notify += 1),
    });
    return { result, calls };
}

async function testMainCreateDenials() {
    const secret = await runMainCreateDenial({
        postType: "post",
        resolve: async () => ({ ok: false, error: POST_WRITE_UNAVAILABLE }),
        resolveShare: async () => "canonical-share",
    });
    assert.deepEqual(secret.result, { ok: false, error: POST_WRITE_UNAVAILABLE, reason: "mention" });
    assert.deepEqual(secret.calls, {
        authorize: 1,
        postType: 1,
        mention: 1,
        share: 0,
        persist: 0,
        vector: 0,
        upload: 0,
        notify: 0,
    });

    const unsupported = await runMainCreateDenial({ postType: "event", resolve: async () => canonicalWrite });
    assert.deepEqual(unsupported.result, { ok: false, error: POST_WRITE_UNAVAILABLE, reason: "postType" });
    assert.deepEqual(unsupported.calls, {
        authorize: 1,
        postType: 1,
        mention: 0,
        share: 0,
        persist: 0,
        vector: 0,
        upload: 0,
        notify: 0,
    });

    const share = await runMainCreateDenial({
        postType: "post",
        resolve: async () => canonicalWrite,
        resolveShare: async () => {
            throw new Error("sensitive denial");
        },
    });
    assert.deepEqual(share.result, { ok: false, error: "Original post unavailable.", reason: "share" });
    assert.deepEqual(share.calls, {
        authorize: 1,
        postType: 1,
        mention: 1,
        share: 1,
        persist: 0,
        vector: 0,
        upload: 0,
        notify: 0,
    });
}

async function testMainCreatePreviewOrderingAndEffects() {
    const canonicalPreview = {
        internalPreviewType: "event" as const,
        internalPreviewId: new ObjectId().toString(),
        internalPreviewUrl: "/circles/current/events/canonical",
    };
    const stages: string[] = [];
    let persisted: Record<string, unknown> | undefined;
    const success = await orchestrateMainPostCreate({
        postType: "post",
        content: "content",
        writerDid,
        authorizeTarget: async () => (stages.push("auth"), true),
        isAllowedPostType: () => (stages.push("type"), true),
        resolve: async () => (stages.push("mentions"), canonicalWrite),
        resolveShare: async () => (stages.push("share"), "canonical-share"),
        resolvePreview: async () => (stages.push("preview"), canonicalPreview),
        buildDocument: async (_write, preview) => ({ title: "post", ...(preview || {}) }),
        persistAndPublishVector: async (document) => {
            stages.push("persist");
            persisted = document as Record<string, unknown>;
            stages.push("vector");
            return document;
        },
        upload: async () => void stages.push("upload"),
        notify: async () => void stages.push("notify"),
    });
    assert.equal(success.ok, true);
    assert.deepEqual(stages, ["auth", "type", "mentions", "share", "preview", "persist", "vector", "upload", "notify"]);
    assert.deepEqual(
        {
            internalPreviewType: persisted?.internalPreviewType,
            internalPreviewId: persisted?.internalPreviewId,
            internalPreviewUrl: persisted?.internalPreviewUrl,
        },
        canonicalPreview,
    );
    assert.equal("internalPreviewData" in persisted!, false);

    for (const actor of ["outsider", "superadmin-nonmember", "malformed", "type-mismatch"]) {
        const effects = { persist: 0, vector: 0, upload: 0, notify: 0 };
        const denied = await orchestrateMainPostCreate({
            postType: "post",
            content: "content",
            writerDid: `did:${actor}`,
            authorizeTarget: async () => true,
            resolve: async () => canonicalWrite,
            resolveShare: async () => "canonical-share",
            resolvePreview: async () => {
                throw new Error(`sensitive ${actor}`);
            },
            buildDocument: async () => ({}),
            persistAndPublishVector: async () => {
                effects.persist += 1;
                effects.vector += 1;
            },
            upload: async () => void (effects.upload += 1),
            notify: async () => void (effects.notify += 1),
        });
        assert.deepEqual(denied, { ok: false, error: "Preview unavailable", reason: "preview" });
        assert.deepEqual(effects, { persist: 0, vector: 0, upload: 0, notify: 0 });
    }
}

async function testMainCreateCanonicalSharedOriginal() {
    const run = async (input: {
        candidate?: string;
        actorDid: string;
        secret?: boolean;
        member?: boolean;
        sourceBound?: boolean;
        sourceReadable?: boolean;
    }) => {
        const originalObjectId = new ObjectId();
        const originalId = originalObjectId.toHexString();
        const feedObjectId = new ObjectId();
        const ownerObjectId = new ObjectId();
        const sourceObjectId = new ObjectId();
        const sourceOwnerObjectId = new ObjectId();
        const author = { did: "did:author", name: "Author", isVerified: true } as Circle;
        const owner = {
            _id: ownerObjectId,
            name: "Canonical owner",
            handle: "canonical-owner",
            circleType: "circle",
            visibility: input.secret ? "secret" : "public",
            moderationStatus: "active",
            enabledModules: ["feed"],
        } as Circle;
        const sourceOwner = {
            _id: sourceOwnerObjectId,
            name: "Source owner",
            handle: "source-owner",
            circleType: "circle",
            visibility: input.sourceReadable === false ? "secret" : "public",
            moderationStatus: "active",
        } as Circle;
        const feed = { _id: feedObjectId, circleId: ownerObjectId.toHexString(), handle: "default" } as Feed;
        const original = {
            _id: originalObjectId,
            feedId: feedObjectId.toHexString(),
            createdBy: author.did!,
            createdAt: new Date(),
            content: "Canonical original",
            reactions: {},
            comments: 0,
            userGroups: ["everyone"],
            ...(input.sourceBound
                ? { postType: "task" as const, parentItemType: "task" as const, parentItemId: sourceObjectId.toHexString() }
                : {}),
        } as Post;
        const effects = { readableLookup: 0, preview: 0, persist: 0, vector: 0, upload: 0, notify: 0 };
        let persisted: Record<string, unknown> | undefined;
        const resolvePost = (postId: string, viewerDid?: string) =>
            resolveReadablePostContext(postId, viewerDid, {
                findPost: async (id) => {
                    effects.readableLookup += 1;
                    return id.equals(originalObjectId) ? original : null;
                },
                findFeed: async (id) => (id.equals(feedObjectId) ? feed : null),
                findCircle: async (id) => (id.equals(ownerObjectId) ? owner : null),
                findMember: async (did, circleId) =>
                    input.member && did === input.actorDid && circleId === ownerObjectId.toHexString()
                        ? ({ userDid: did, circleId } as Member)
                        : null,
                findAuthor: async (did) => (did === author.did ? author : null),
                authorizeFeature: async () => true,
                canReadSource: (post, did) =>
                    canReadPostSource(post, did, {
                        findSource: async (type, id) =>
                            input.sourceBound && type === "task" && id.equals(sourceObjectId)
                                ? ({ _id: sourceObjectId, circleId: sourceOwnerObjectId.toHexString() } as never)
                                : null,
                        findCircles: async (ids) =>
                            ids.some((id) => id.equals(sourceOwnerObjectId)) ? [sourceOwner] : [],
                        canReadOwner: (viewerDid, circle) =>
                            canReadCircle(viewerDid, circle, { getMember: async () => null }),
                    }),
            });
        const nestedDependencies: NestedContentDependencies = {
            findResources: async () => [],
            findCirclesByHandles: async () => [],
            findReadableCircles: async () => [],
            findAuthors: async (dids) => (dids.includes(author.did!) ? [author] : []),
            resolvePost,
            findReadableMentionCircles: async () => [],
        };
        const result = await orchestrateMainPostCreate({
            postType: "post",
            content: "commentary",
            writerDid: input.actorDid,
            authorizeTarget: async () => true,
            resolve: async () => canonicalWrite,
            resolveShare: () =>
                resolveSharedOriginalForWrite(
                    input.candidate ?? originalId.toUpperCase(),
                    input.actorDid,
                    (candidate, did) => getShareablePostPreview(candidate, did, nestedDependencies),
                ),
            resolvePreview: async () => (effects.preview += 1, null),
            buildDocument: async (_write, _preview, sharedPostId) => ({ title: "Share", sharedPostId }),
            persistAndPublishVector: async (document) => {
                effects.persist += 1;
                effects.vector += 1;
                persisted = document as Record<string, unknown>;
                return document;
            },
            upload: async () => void (effects.upload += 1),
            notify: async () => void (effects.notify += 1),
        });
        return { result, effects, persisted, originalId };
    };

    for (const sourceBound of [false, true]) {
        const success = await run({ actorDid: writerDid, sourceBound, sourceReadable: true });
        assert.equal(success.result.ok, true);
        assert.equal(success.persisted?.sharedPostId, success.originalId);
        assert.equal("sharedPostData" in success.persisted!, false);
        assert.deepEqual(success.effects, { readableLookup: 1, preview: 1, persist: 1, vector: 1, upload: 1, notify: 1 });
    }

    for (const actorDid of ["did:outsider", "did:superadmin"]) {
        const denied = await run({ actorDid, secret: true });
        assert.deepEqual(denied.result, { ok: false, error: "Original post unavailable.", reason: "share" });
        assert.deepEqual(denied.effects, { readableLookup: 1, preview: 0, persist: 0, vector: 0, upload: 0, notify: 0 });
    }
    assert.equal(previewActors.get("did:superadmin")?.isSuperadmin, true);

    const sourceDenied = await run({ actorDid: writerDid, sourceBound: true, sourceReadable: false });
    assert.deepEqual(sourceDenied.result, { ok: false, error: "Original post unavailable.", reason: "share" });
    assert.deepEqual(sourceDenied.effects, { readableLookup: 1, preview: 0, persist: 0, vector: 0, upload: 0, notify: 0 });

    const malformed = await run({ actorDid: writerDid, candidate: "not-an-object-id" });
    assert.deepEqual(malformed.result, { ok: false, error: "Original post unavailable.", reason: "share" });
    assert.deepEqual(malformed.effects, { readableLookup: 0, preview: 0, persist: 0, vector: 0, upload: 0, notify: 0 });
}

async function testMainCreateWithRealPreviewResolver() {
    const run = async (
        fixture: ReturnType<typeof previewAccessFixture>,
        request: { type?: string; id?: string; url?: string },
        actorDid = writerDid,
    ) => {
        const effects = { persist: 0, vector: 0, upload: 0, notify: 0 };
        let persisted: Record<string, unknown> | undefined;
        const result = await orchestrateMainPostCreate({
            postType: "post",
            content: "content",
            writerDid: actorDid,
            authorizeTarget: async () => true,
            resolve: async () => canonicalWrite,
            resolveShare: async () => "canonical-share",
            resolvePreview: () => resolveInternalPreviewForWrite(request, actorDid, fixture.resolve),
            buildDocument: async (_write, preview) => ({ ...(preview || {}) }),
            persistAndPublishVector: async (document) => {
                effects.persist += 1;
                effects.vector += 1;
                persisted = document as Record<string, unknown>;
                return document;
            },
            upload: async () => void (effects.upload += 1),
            notify: async () => void (effects.notify += 1),
        });
        return { result, effects, persisted };
    };

    for (const fixture of [
        previewAccessFixture(false, false),
        previewAccessFixture(true, true),
        previewAccessFixture(true, true, "paused"),
    ]) {
        const outcome = await run(fixture, {
            type: "goal",
            id: fixture.goalId,
            url: "https://evil.test/circles/forged?query=1#hash",
        });
        assert.equal(outcome.result.ok, true);
        assert.deepEqual(outcome.effects, { persist: 1, vector: 1, upload: 1, notify: 1 });
        assert.deepEqual(
            {
                internalPreviewType: outcome.persisted?.internalPreviewType,
                internalPreviewId: outcome.persisted?.internalPreviewId,
                internalPreviewUrl: outcome.persisted?.internalPreviewUrl,
            },
            {
                internalPreviewType: "goal",
                internalPreviewId: fixture.goalId,
                internalPreviewUrl: `/circles/${fixture.owner.handle}/goals/${fixture.goalId}`,
            },
        );
    }

    const outsider = previewAccessFixture(true, false);
    const superadminNonmember = previewAccessFixture(true, false);
    const superadminActor = { did: "did:superadmin", isSuperadmin: true };
    const malformed = previewAccessFixture(false, false);
    const mismatch = previewAccessFixture(false, false);
    const suspended = previewAccessFixture(false, false, "suspended");
    const removed = previewAccessFixture(false, false, "removed");
    for (const { fixture, request, actorDid } of [
        { fixture: outsider, request: { type: "goal", id: outsider.goalId }, actorDid: "did:outsider" },
        {
            fixture: superadminNonmember,
            request: { type: "goal", id: superadminNonmember.goalId },
            actorDid: superadminActor.did,
        },
        { fixture: malformed, request: { type: "goal", id: "malformed" }, actorDid: writerDid },
        { fixture: mismatch, request: { type: "event", id: mismatch.goalId }, actorDid: writerDid },
        { fixture: suspended, request: { type: "goal", id: suspended.goalId }, actorDid: writerDid },
        { fixture: removed, request: { type: "goal", id: removed.goalId }, actorDid: writerDid },
    ]) {
        const outcome = await run(fixture, request, actorDid);
        assert.deepEqual(outcome.result, { ok: false, error: "Preview unavailable", reason: "preview" });
        assert.deepEqual(outcome.effects, { persist: 0, vector: 0, upload: 0, notify: 0 });
    }
    assert.equal(superadminActor.isSuperadmin, true);
}

async function testMainUpdateSuccessDeniedAndUnchanged() {
    const stages: string[] = [];
    let persisted: Record<string, unknown> | undefined;
    const changed = await orchestrateMainPostUpdate({
        content: "changed",
        storedContent: "stored",
        storedMentions: [{ type: "circle", id: "old" }],
        writerDid,
        baseUpdate: { _id: "post", title: "Unrelated title" } as Partial<Post>,
        resolve: async () => (stages.push("resolve"), canonicalWrite),
        upload: async () => (stages.push("upload"), ["server-media"]),
        applyUpload: (document, media) => void ((document as Record<string, unknown>).media = media),
        persistAndPublishVector: async (document) => {
            stages.push("update");
            persisted = document as Record<string, unknown>;
            stages.push("vector");
            return document;
        },
        notify: async (_value, _document, mentions) => {
            stages.push("notification");
            assert.deepEqual(mentions, canonicalMentions);
        },
    });
    assert.equal(changed.ok, true);
    assert.deepEqual(stages, ["resolve", "upload", "update", "vector", "notification"]);
    assert.equal(persisted?.content, canonicalWrite.content);
    assert.deepEqual(persisted?.mentions, canonicalMentions);
    assert.equal(persisted?.title, "Unrelated title");

    const deniedCalls = { resolve: 0, upload: 0, update: 0, vector: 0, notify: 0 };
    const denied = await orchestrateMainPostUpdate({
        content: "changed secret",
        storedContent: "stored",
        storedMentions: [],
        writerDid,
        baseUpdate: { _id: "post" } as Partial<Post>,
        resolve: async () => ((deniedCalls.resolve += 1), { ok: false, error: POST_WRITE_UNAVAILABLE }),
        upload: async () => (deniedCalls.upload += 1),
        applyUpload: () => undefined,
        persistAndPublishVector: async () => ((deniedCalls.update += 1), (deniedCalls.vector += 1)),
        notify: async () => void (deniedCalls.notify += 1),
    });
    assert.deepEqual(denied, { ok: false, error: POST_WRITE_UNAVAILABLE });
    assert.deepEqual(deniedCalls, { resolve: 1, upload: 0, update: 0, vector: 0, notify: 0 });

    const storedMentions: Mention[] = [{ type: "circle", id: "stored" }];
    let unchangedPersisted: Record<string, unknown> | undefined;
    let unchangedResolve = 0;
    const unchanged = await orchestrateMainPostUpdate({
        content: "same",
        storedContent: "same",
        storedMentions,
        writerDid,
        baseUpdate: {
            _id: "post",
            title: "Allowed update",
            mentions: [{ type: "circle", id: "forged" }],
        } as Partial<Post>,
        resolve: async () => ((unchangedResolve += 1), canonicalWrite),
        upload: async () => ["existing-media"],
        applyUpload: (document, media) => void ((document as Record<string, unknown>).media = media),
        persistAndPublishVector: async (document) => (
            (unchangedPersisted = document as Record<string, unknown>), document
        ),
        notify: async () => undefined,
    });
    assert.equal(unchanged.ok, true);
    assert.equal(unchangedResolve, 0);
    assert.equal(unchangedPersisted?.content, "same");
    assert.deepEqual(unchangedPersisted?.mentions, storedMentions);
    assert.equal(unchangedPersisted?.title, "Allowed update");
}

async function testMainUpdatePreservesImmutableSharedState() {
    const sharedA = new ObjectId().toHexString();
    const sharedB = new ObjectId().toHexString();
    const cases = [
        { name: "unrelated", stored: { sharedPostId: sharedA }, attack: {} },
        {
            name: "forged add",
            stored: {},
            attack: { sharedPostId: sharedB, sharedPostData: JSON.stringify({ nested: { secret: true } }) },
        },
        {
            name: "forged change",
            stored: { sharedPostId: sharedA },
            attack: { sharedPostId: sharedB, sharedPostData: JSON.stringify({ author: { name: "forged" } }) },
        },
        {
            name: "forged remove",
            stored: { sharedPostId: sharedA },
            attack: { sharedPostId: "", sharedPostData: "null" },
        },
    ];
    for (const testCase of cases) {
        const formData = new FormData();
        formData.set("title", `Allowed ${testCase.name}`);
        formData.set("location", JSON.stringify({ name: "Allowed location" }));
        for (const [key, value] of Object.entries({
            ...testCase.attack,
            sharedOriginal: JSON.stringify({ content: "forged" }),
            sharedPost: JSON.stringify({ id: sharedB }),
            nestedSharedMetadata: JSON.stringify({ original: { id: sharedB } }),
            unknownNestedObject: JSON.stringify({ sharedPostData: { secret: true } }),
        })) formData.set(key, value);

        const baseUpdate = buildMainPostUpdateBaseDocument(formData, { _id: "post", postType: "post" });
        let updateDocument: Record<string, unknown> | undefined;
        let shareResolverCalls = 0;
        const stored = { ...testCase.stored, sharedPostData: undefined };
        const result = await orchestrateMainPostUpdate({
            content: "same",
            storedContent: "same",
            storedMentions: [],
            writerDid,
            baseUpdate,
            resolve: async () => {
                shareResolverCalls += 1;
                return canonicalWrite;
            },
            upload: async () => ["existing-media"],
            applyUpload: (document, media) => void ((document as Record<string, unknown>).media = media),
            persistAndPublishVector: async (document) => {
                updateDocument = document as Record<string, unknown>;
                return document;
            },
            notify: async () => undefined,
        });
        assert.equal(result.ok, true, testCase.name);
        assert.equal(shareResolverCalls, 0, testCase.name);
        for (const forbidden of [
            "sharedPostId",
            "sharedPostData",
            "sharedOriginal",
            "sharedPost",
            "nestedSharedMetadata",
            "unknownNestedObject",
        ]) assert.equal(forbidden in updateDocument!, false, `${testCase.name}: ${forbidden}`);
        const final = { ...stored, ...updateDocument } as Record<string, unknown>;
        assert.equal(final.sharedPostId, testCase.stored.sharedPostId, testCase.name);
        assert.equal(final.sharedPostData, undefined, testCase.name);
        assert.equal(final.title, `Allowed ${testCase.name}`);
        assert.deepEqual(final.location, { name: "Allowed location" });
        assert.deepEqual(final.media, ["existing-media"]);
    }
}

async function testMainUpdatePreviewMatrix() {
    const oldId = new ObjectId().toString();
    const newId = new ObjectId().toString();
    const canonical = {
        internalPreviewType: "goal" as const,
        internalPreviewId: newId,
        internalPreviewUrl: `/circles/current/goals/${newId}`,
    };
    for (const preview of [
        { mode: "set" as const, preview: canonical },
        { mode: "preserve" as const, preview: { ...canonical, internalPreviewId: oldId } },
        { mode: "remove" as const },
    ]) {
        let persisted: Record<string, unknown> | undefined;
        const result = await orchestrateMainPostUpdate({
            content: "same",
            storedContent: "same",
            storedMentions: [],
            writerDid,
            baseUpdate: { _id: "post", title: "changed" },
            resolvePreview: async () => preview,
            upload: async () => [],
            applyUpload: () => undefined,
            persistAndPublishVector: async (document) => ((persisted = document as Record<string, unknown>), document),
            notify: async () => undefined,
        });
        assert.equal(result.ok, true);
        if (preview.mode === "remove") {
            for (const field of [
                "internalPreviewType",
                "internalPreviewId",
                "internalPreviewUrl",
                "internalPreviewData",
            ])
                assert.equal(Object.hasOwn(persisted!, field), true);
        } else {
            assert.equal(persisted?.internalPreviewId, preview.preview.internalPreviewId);
            assert.equal(persisted?.internalPreviewUrl, preview.preview.internalPreviewUrl);
            assert.equal(persisted?.internalPreviewData, undefined);
        }
    }

    const effects = { update: 0, vector: 0, upload: 0, notify: 0 };
    const denied = await orchestrateMainPostUpdate({
        content: "same",
        storedContent: "same",
        storedMentions: [],
        writerDid: "did:former-member",
        baseUpdate: { _id: "post" },
        resolvePreview: async () => {
            throw new Error("secret membership state");
        },
        upload: async () => (effects.upload += 1),
        applyUpload: () => undefined,
        persistAndPublishVector: async () => ((effects.update += 1), (effects.vector += 1)),
        notify: async () => void (effects.notify += 1),
    });
    assert.deepEqual(denied, { ok: false, error: "Preview unavailable" });
    assert.deepEqual(effects, { update: 0, vector: 0, upload: 0, notify: 0 });
}

async function testMainUpdateWithRealPreviewResolverAndIntent() {
    const storedId = new ObjectId().toString();
    const stored = {
        internalPreviewType: "goal" as const,
        internalPreviewId: storedId,
        internalPreviewUrl: `/circles/stored/goals/${storedId}`,
    };
    const run = async (
        fixture: ReturnType<typeof previewAccessFixture>,
        request: { type?: string; id?: string; url?: string },
        presence: { type: boolean; id: boolean; url: boolean },
        storedPreview: Partial<typeof stored> = stored,
        actorDid = writerDid,
    ) => {
        const effects = { update: 0, vector: 0, upload: 0, notify: 0 };
        let persisted: Record<string, unknown> | undefined;
        const result = await orchestrateMainPostUpdate({
            content: "same",
            storedContent: "same",
            storedMentions: [],
            writerDid: actorDid,
            baseUpdate: { _id: "post", title: "unrelated" },
            resolvePreview: () =>
                resolveInternalPreviewUpdateForWrite({
                    request,
                    presence,
                    stored: storedPreview,
                    writerDid: actorDid,
                    resolvePreview: fixture.resolve,
                }),
            upload: async () => (effects.upload += 1),
            applyUpload: () => undefined,
            persistAndPublishVector: async (document) => {
                effects.update += 1;
                effects.vector += 1;
                persisted = document as Record<string, unknown>;
                return document;
            },
            notify: async () => void (effects.notify += 1),
        });
        return { result, effects, persisted };
    };

    const omittedFixture = previewAccessFixture(false, false);
    const omitted = await run(omittedFixture, {}, { type: false, id: false, url: false });
    assert.equal(omitted.result.ok, true);
    assert.equal(omittedFixture.reads(), 0);
    assert.equal(omitted.persisted?.title, "unrelated");
    for (const field of ["internalPreviewType", "internalPreviewId", "internalPreviewUrl", "internalPreviewData"])
        assert.equal(Object.hasOwn(omitted.persisted!, field), false);

    const removeFixture = previewAccessFixture(false, false);
    const removed = await run(removeFixture, { type: "", id: "", url: "" }, { type: true, id: true, url: true });
    assert.equal(removed.result.ok, true);
    assert.equal(removeFixture.reads(), 0);
    for (const field of ["internalPreviewType", "internalPreviewId", "internalPreviewUrl", "internalPreviewData"])
        assert.equal(Object.hasOwn(removed.persisted!, field), true);

    let externalVectorDocument: Record<string, unknown> | undefined;
    const externalReplacement = await orchestrateMainPostUpdate({
        content: "same",
        storedContent: "same",
        storedMentions: [],
        writerDid,
        baseUpdate: {
            _id: "post",
            linkPreviewUrl: "https://example.test/story",
            linkPreviewTitle: "External",
        },
        resolvePreview: () =>
            resolveInternalPreviewUpdateForWrite({
                request: { type: "", id: "", url: "" },
                presence: { type: true, id: true, url: true },
                stored,
                writerDid,
            }),
        upload: async () => [],
        applyUpload: () => undefined,
        persistAndPublishVector: async (document) => {
            externalVectorDocument = document as Record<string, unknown>;
            return document;
        },
        notify: async () => undefined,
    });
    assert.equal(externalReplacement.ok, true);
    assert.equal(externalVectorDocument?.linkPreviewUrl, "https://example.test/story");
    assert.equal(externalVectorDocument?.linkPreviewTitle, "External");
    for (const field of ["internalPreviewType", "internalPreviewId", "internalPreviewUrl", "internalPreviewData"])
        assert.equal(externalVectorDocument?.[field], undefined);

    const partialCases = [
        { request: { type: "goal" }, presence: { type: true, id: false, url: false } },
        { request: { id: storedId }, presence: { type: false, id: true, url: false } },
        { request: { url: stored.internalPreviewUrl }, presence: { type: false, id: false, url: true } },
        { request: { type: "goal", id: storedId }, presence: { type: true, id: true, url: false } },
        { request: { id: storedId, url: stored.internalPreviewUrl }, presence: { type: false, id: true, url: true } },
        { request: { type: "goal", url: stored.internalPreviewUrl }, presence: { type: true, id: false, url: true } },
        { request: { type: "" }, presence: { type: true, id: false, url: false } },
        { request: { id: "" }, presence: { type: false, id: true, url: false } },
        { request: { url: "" }, presence: { type: false, id: false, url: true } },
        { request: { type: "", id: "" }, presence: { type: true, id: true, url: false } },
        {
            request: { type: "goal", id: "", url: stored.internalPreviewUrl },
            presence: { type: true, id: true, url: true },
        },
    ];
    for (const partial of partialCases) {
        const fixture = previewAccessFixture(false, false);
        const denied = await run(fixture, partial.request, partial.presence);
        assert.deepEqual(denied.result, { ok: false, error: "Preview unavailable" });
        assert.equal(fixture.reads(), 0);
        assert.deepEqual(denied.effects, { update: 0, vector: 0, upload: 0, notify: 0 });
    }

    for (const [index, fixture] of [
        previewAccessFixture(false, false),
        previewAccessFixture(true, true),
        previewAccessFixture(true, true, "paused"),
    ].entries()) {
        const set = await run(
            fixture,
            { type: "goal", id: fixture.goalId, url: "https://evil.test/forged?query=1#hash" },
            { type: true, id: true, url: true },
            index === 0 ? {} : stored,
        );
        assert.equal(set.result.ok, true);
        assert.equal(fixture.reads(), 1);
        assert.equal(set.persisted?.internalPreviewId, fixture.goalId);
        assert.equal(set.persisted?.internalPreviewUrl, `/circles/${fixture.owner.handle}/goals/${fixture.goalId}`);
        assert.equal(set.persisted?.internalPreviewData, undefined);
    }

    const superadminActor = { did: "did:superadmin", isSuperadmin: true };
    for (const { fixture, type, actorDid } of [
        { fixture: previewAccessFixture(true, false), type: "goal", actorDid: "did:outsider" },
        { fixture: previewAccessFixture(true, false), type: "goal", actorDid: superadminActor.did },
        { fixture: previewAccessFixture(false, false), type: "event", actorDid: writerDid },
        { fixture: previewAccessFixture(false, false, "suspended"), type: "goal", actorDid: writerDid },
        { fixture: previewAccessFixture(false, false, "removed"), type: "goal", actorDid: writerDid },
    ]) {
        const denied = await run(
            fixture,
            { type, id: fixture.goalId, url: `/circles/_/${type}s/${fixture.goalId}` },
            { type: true, id: true, url: true },
            stored,
            actorDid,
        );
        assert.deepEqual(denied.result, { ok: false, error: "Preview unavailable" });
        assert.deepEqual(denied.effects, { update: 0, vector: 0, upload: 0, notify: 0 });
    }
    assert.equal(superadminActor.isSuperadmin, true);
}

function maliciousDiscussionPayload(): Partial<Post> {
    return {
        title: "Allowed",
        content: "[Fake](/circles/object-id)",
        location: { name: "Allowed location" },
        _id: "forged-id",
        feedId: "forged-feed",
        createdBy: "did:forged",
        createdAt: new Date(0),
        updatedAt: new Date(0),
        postType: "event",
        parentItemType: "event",
        parentItemId: "forged-parent",
        sourceResourceType: "funding",
        sourceResourceId: "forged-source",
        sharedPostId: "forged-share",
        sharedPostData: { secret: true },
        internalPreviewType: "event",
        internalPreviewId: "forged-preview",
        internalPreviewUrl: "https://example.test/internal",
        internalPreviewData: { secret: true },
        linkPreviewUrl: "https://example.test/external",
        linkPreviewTitle: "forged",
        linkPreviewDescription: "forged",
        linkPreviewImage: { url: "https://example.test/image" },
        reactions: { forged: 1 },
        comments: 99,
        mentions: [{ type: "circle", id: "forged-secret" }],
        mentionsDisplay: [{ secret: true }],
        mentionsDetails: [{ secret: true }],
        secretPayload: "forged",
        nestedUnknown: { secret: true },
    } as unknown as Partial<Post>;
}

const publicCircle = {
    _id: new ObjectId().toString(),
    circleType: "circle",
    visibility: "public",
    moderationStatus: "active",
} as Circle;
const secretCircle = {
    _id: new ObjectId().toString(),
    circleType: "circle",
    visibility: "secret",
    moderationStatus: "active",
} as Circle;

async function runAlternate(target: Circle, member: boolean, isSuperadmin = false) {
    const calls = { target: 0, read: 0, feature: 0, mention: 0, upload: 0, persist: 0, vector: 0 };
    const actor = { did: writerDid, isSuperadmin };
    let persisted: Record<string, unknown> | undefined;
    const result = await orchestrateAlternateDiscussionCreate({
        raw: maliciousDiscussionPayload(),
        writerDid,
        resolveTarget: async () => ((calls.target += 1), target),
        canReadTarget: async (circle) => {
            calls.read += 1;
            // Central Secret readability deliberately has no superadmin bypass.
            return canReadCircle(actor.did, circle, {
                getMember: async () =>
                    member ? ({ userDid: actor.did, circleId: circle._id!.toString() } as never) : null,
            });
        },
        authorizeFeature: async () => ((calls.feature += 1), true),
        resolve: async () => ((calls.mention += 1), canonicalWrite),
        upload: async (authored) => {
            calls.upload += 1;
            authored.media = [{ name: "server-file", type: "image/png", fileInfo: { url: "/uploads/server" } }];
        },
        resolveDestination: async (circle) => ({ feedId: "server-feed", circleId: circle._id!.toString() }),
        persistAndPublishVector: async (document) => {
            calls.persist += 1;
            persisted = document as Record<string, unknown>;
            calls.vector += 1;
            return { ...document, _id: "created" } as Post;
        },
    });
    return { result, calls, persisted };
}

async function testAlternateDiscussionBehavior() {
    for (const [target, member] of [
        [publicCircle, false],
        [secretCircle, true],
    ] as const) {
        const success = await runAlternate(target, member);
        assert.equal(success.result.ok, true);
        assert.deepEqual(success.calls, {
            target: 1,
            read: 1,
            feature: 1,
            mention: 1,
            upload: 1,
            persist: 1,
            vector: 1,
        });
        assert.equal(success.persisted?.content, canonicalWrite.content);
        assert.deepEqual(success.persisted?.mentions, canonicalMentions);
        assert.equal(success.persisted?.feedId, "server-feed");
        assert.equal(success.persisted?.circleId, target._id);
        assert.equal(success.persisted?.createdBy, writerDid);
        assert.equal(success.persisted?.postType, "discussion");
        assert.deepEqual(success.persisted?.media, [
            { name: "server-file", type: "image/png", fileInfo: { url: "/uploads/server" } },
        ]);
        for (const forbidden of [
            "_id",
            "createdAt",
            "updatedAt",
            "parentItemType",
            "parentItemId",
            "sourceResourceType",
            "sourceResourceId",
            "sharedPostId",
            "sharedPostData",
            "internalPreviewType",
            "internalPreviewId",
            "internalPreviewUrl",
            "internalPreviewData",
            "linkPreviewUrl",
            "linkPreviewTitle",
            "linkPreviewDescription",
            "linkPreviewImage",
            "mentionsDisplay",
            "mentionsDetails",
            "reactions",
            "comments",
            "secretPayload",
            "nestedUnknown",
        ]) {
            assert.equal(forbidden in success.persisted!, false, forbidden);
        }
    }

    const outsider = await runAlternate(secretCircle, false);
    assert.deepEqual(outsider.result, { ok: false, error: "Circle not found", reason: "target" });
    assert.deepEqual(outsider.calls, { target: 1, read: 1, feature: 0, mention: 0, upload: 0, persist: 0, vector: 0 });

    const superadminNonmember = await runAlternate(secretCircle, false, true);
    assert.deepEqual(superadminNonmember.result, { ok: false, error: "Circle not found", reason: "target" });
    assert.deepEqual(superadminNonmember.calls, {
        target: 1,
        read: 1,
        feature: 0,
        mention: 0,
        upload: 0,
        persist: 0,
        vector: 0,
    });
}

async function testProductionWiring() {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const feedActions = await readFile(`${root}/src/components/modules/feeds/actions.ts`, "utf8");
    const discussionActions = await readFile(`${root}/src/app/circles/[handle]/discussions/actions.ts`, "utf8");
    assert.match(feedActions, /orchestrateMainPostCreate\(\{/);
    assert.match(feedActions, /orchestrateMainPostUpdate\(\{/);
    assert.match(discussionActions, /orchestrateAlternateDiscussionCreate\(\{/);
}

async function main() {
    await testMainCreateSuccess();
    await testMainCreateDenials();
    await testMainCreatePreviewOrderingAndEffects();
    await testMainCreateCanonicalSharedOriginal();
    await testMainCreateWithRealPreviewResolver();
    await testMainUpdateSuccessDeniedAndUnchanged();
    await testMainUpdatePreservesImmutableSharedState();
    await testMainUpdatePreviewMatrix();
    await testMainUpdateWithRealPreviewResolverAndIntent();
    await testAlternateDiscussionBehavior();
    await testProductionWiring();
    console.log("post write orchestration tests passed");
}

void main();
