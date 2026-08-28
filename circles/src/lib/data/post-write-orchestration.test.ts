import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import type { Circle, Mention, Post } from "@/models/models";
import { canReadCircle } from "./circle-visibility-policy";
import type { CircleMentionWriteResult } from "./circle-mention-write-policy";
import {
    POST_WRITE_UNAVAILABLE,
    isClientCreatablePostType,
    orchestrateAlternateDiscussionCreate,
    orchestrateMainPostCreate,
    orchestrateMainPostUpdate,
} from "./post-write-policy";

const writerDid = "did:writer";
const canonicalMentions: Mention[] = [{ type: "circle", id: "canonical-circle" }];
const canonicalWrite = {
    ok: true as const,
    content: "[Canonical Name](/circles/canonical-handle) [Canonical Name](/circles/canonical-handle)",
    mentions: canonicalMentions,
};

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
        validateShare: async () => (stages.push("share"), true),
        buildDocument: async () => ({ title: "Authored", content: "caller", createdBy: writerDid }),
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
    assert.deepEqual(persisted?.mentions, canonicalMentions);
    assert.equal((persisted?.mentions as Mention[]).length, 1);
    assert.notDeepEqual(persisted?.mentions, forged.mentions);
    for (const key of ["mentionsDisplay", "mentionsDetails"]) assert.equal(key in persisted!, false, key);
}

async function runMainCreateDenial(input: {
    postType: string;
    resolve: () => Promise<CircleMentionWriteResult>;
    validateShare?: () => Promise<boolean>;
}) {
    const calls = { authorize: 0, postType: 0, mention: 0, share: 0, persist: 0, vector: 0, upload: 0, notify: 0 };
    const result = await orchestrateMainPostCreate({
        postType: input.postType,
        content: "content",
        writerDid,
        authorizeTarget: async () => ((calls.authorize += 1), true),
        isAllowedPostType: (postType) => ((calls.postType += 1), isClientCreatablePostType(postType)),
        resolve: async () => ((calls.mention += 1), input.resolve()),
        validateShare: input.validateShare ? async () => ((calls.share += 1), input.validateShare!()) : undefined,
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
        validateShare: async () => true,
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
        validateShare: async () => false,
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
    await testMainUpdateSuccessDeniedAndUnchanged();
    await testAlternateDiscussionBehavior();
    await testProductionWiring();
    console.log("post write orchestration tests passed");
}

void main();
