import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Post } from "@/models/models";
import {
    buildAlternateDiscussionCreatePayload,
    buildCanonicalDiscussionDocument,
    isClientCreatablePostType,
    resolvePostContentForWrite,
} from "./post-write-policy";

async function testPostTypeAllowlist() {
    for (const value of [undefined, "post", "community", "discussion"]) {
        assert.equal(isClientCreatablePostType(value), true, String(value));
    }
    for (const value of ["task", "event", "goal", "issue", "proposal", "funding", "unknown"]) {
        assert.equal(isClientCreatablePostType(value), false, value);
    }
}

async function testCanonicalContentIsAuthoritative() {
    const forged = [{ type: "circle", id: "forged-secret" }] as Post["mentions"];
    let calls = 0;
    const result = await resolvePostContentForWrite("[Fake](/circles/object-id)", "did:writer", async () => {
        calls += 1;
        return {
            ok: true,
            content: "[Canonical](/circles/canonical)",
            mentions: [{ type: "circle", id: "canonical-id" }],
        };
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, {
        ok: true,
        content: "[Canonical](/circles/canonical)",
        mentions: [{ type: "circle", id: "canonical-id" }],
    });
    assert.notDeepEqual(result.ok && result.mentions, forged);

    let persisted = false;
    const rejected = await resolvePostContentForWrite("[Hidden](/circles/secret)", "did:writer", async () => ({
        ok: false,
        error: "One or more references are unavailable.",
    }));
    if (rejected.ok) persisted = true;
    assert.equal(persisted, false);
}

async function testAlternateDiscussionPayloadNarrowing() {
    const raw = {
        title: "Allowed title",
        content: "Allowed content",
        location: { name: "Allowed location" },
        media: [{ forged: true }],
        postType: "task",
        feedId: "forged-feed",
        createdBy: "did:forged",
        createdAt: new Date(0),
        parentItemType: "task",
        parentItemId: "forged-parent",
        sourceResourceType: "funding",
        sourceResourceId: "forged-source",
        sharedPostId: "forged-share",
        sharedPostData: { content: "forged", author: { name: "forged" }, nested: { secret: true } },
        internalPreviewType: "task",
        internalPreviewId: "forged-preview",
        internalPreviewUrl: "https://example.test/forged",
        mentions: [{ type: "circle", id: "forged-mention" }],
        mentionsDisplay: [{ secret: true }],
        mentionsDetails: [{ secret: true }],
        reactions: { forged: 99 },
        secretPayload: "must not persist",
        author: { secret: true },
    } as unknown as Partial<Post>;

    const authored = buildAlternateDiscussionCreatePayload(raw);
    assert.deepEqual(Object.keys(authored).sort(), ["content", "location", "media", "title"]);
    assert.equal(authored.media, undefined);
    const document = buildCanonicalDiscussionDocument({
        authored,
        canonicalContent: "[Canonical](/circles/current)",
        mentions: [{ type: "circle", id: "canonical-id" }],
        feedId: "server-feed",
        circleId: "server-circle",
        writerDid: "did:writer",
    }) as Record<string, unknown>;
    assert.equal(document.postType, "discussion");
    assert.equal(document.feedId, "server-feed");
    assert.equal(document.circleId, "server-circle");
    assert.equal(document.createdBy, "did:writer");
    assert.deepEqual(document.mentions, [{ type: "circle", id: "canonical-id" }]);
    for (const forbidden of [
        "parentItemType",
        "parentItemId",
        "sourceResourceType",
        "sourceResourceId",
        "sharedPostId",
        "sharedPostData",
        "internalPreviewType",
        "internalPreviewId",
        "internalPreviewUrl",
        "mentionsDisplay",
        "mentionsDetails",
        "reactions",
        "secretPayload",
        "author",
        "createdAt",
    ])
        assert.equal(forbidden in document, false, forbidden);
}

async function testProductionCallSitesUseCanonicalResolver() {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const feedActions = await readFile(`${root}/src/components/modules/feeds/actions.ts`, "utf8");
    const discussionActions = await readFile(`${root}/src/app/circles/[handle]/discussions/actions.ts`, "utf8");
    assert.match(feedActions, /orchestrateMainPostCreate\(\{/);
    assert.match(feedActions, /orchestrateMainPostUpdate\(\{/);
    assert.match(feedActions, /resolveSharedOriginalForWrite\(sharedPostId, userDid, getShareablePostPreview\)/);
    assert.match(feedActions, /sharedPostId: canonicalSharedPostId/);
    assert.doesNotMatch(feedActions, /formData\.get\(["']sharedPostData["']\)/);
    const updateAction = feedActions.slice(feedActions.indexOf("export async function updatePostAction"));
    assert.doesNotMatch(updateAction, /formData\.get\(["']sharedPost(Id|Data)["']\)/);
    assert.match(discussionActions, /orchestrateAlternateDiscussionCreate\(\{/);
    assert.doesNotMatch(discussionActions, /\.\.\.payload/);
}

async function main() {
    await testPostTypeAllowlist();
    await testCanonicalContentIsAuthoritative();
    await testAlternateDiscussionPayloadNarrowing();
    await testProductionCallSitesUseCanonicalResolver();
    console.log("post write policy tests passed");
}

void main();
