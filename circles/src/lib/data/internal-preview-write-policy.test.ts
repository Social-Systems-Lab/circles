import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import {
    PREVIEW_UNAVAILABLE,
    resolveInternalPreviewForWrite,
    resolveInternalPreviewUpdateForWrite,
} from "./internal-preview-write-policy";
import type { InternalPreviewType, ResolvedInternalPreview } from "./post-nested-content-policy";

const writerDid = "did:writer";
const objectId = new ObjectId().toString();
const ids: Record<InternalPreviewType, string> = {
    circle: "current-handle",
    post: objectId,
    task: objectId,
    event: objectId,
    goal: objectId,
    issue: objectId,
    proposal: objectId,
    funding: objectId,
};

const canonicalUrl = (type: InternalPreviewType, id: string) =>
    type === "circle" ? `/circles/current-handle` : `/circles/current/${type === "post" ? "post" : `${type}s`}/${id}`;

async function testSupportedTypesAndCanonicalAuthority() {
    for (const type of Object.keys(ids) as InternalPreviewType[]) {
        let probe = "";
        const resolved = await resolveInternalPreviewForWrite(
            { type, id: ids[type], url: "https://evil.test/circles/forged?leak=1#hash" },
            writerDid,
            async (url, did) => {
                probe = url;
                assert.equal(did, writerDid);
                return {
                    type,
                    id: ids[type],
                    url: canonicalUrl(type, ids[type]),
                    data: { title: "read-time only" },
                } as ResolvedInternalPreview;
            },
        );
        assert.ok(resolved);
        assert.equal(probe.startsWith("/circles/"), true);
        assert.equal(probe.includes("evil.test"), false);
        assert.deepEqual(resolved, {
            internalPreviewType: type,
            internalPreviewId: ids[type],
            internalPreviewUrl: canonicalUrl(type, ids[type]),
        });
        assert.equal("internalPreviewData" in resolved, false);
    }
}

async function testNeutralFailures() {
    for (const request of [
        { type: "unknown", id: objectId },
        { type: "event", id: "" },
        { type: "", id: objectId },
        { url: "https://evil.test/circles/public/events/forged" },
    ]) {
        await assert.rejects(
            resolveInternalPreviewForWrite(request, writerDid, async () => null),
            (error: unknown) => error instanceof Error && error.message === PREVIEW_UNAVAILABLE,
        );
    }
    await assert.rejects(
        resolveInternalPreviewForWrite(
            { type: "event", id: objectId },
            writerDid,
            async () =>
                ({
                    type: "task",
                    id: objectId,
                    url: `/circles/current/tasks/${objectId}`,
                    data: { title: "wrong type" },
                }) as ResolvedInternalPreview,
        ),
        (error: unknown) => error instanceof Error && error.message === PREVIEW_UNAVAILABLE,
    );
    await assert.rejects(
        resolveInternalPreviewForWrite(
            { type: "event", id: objectId },
            writerDid,
            async () =>
                ({
                    type: "event",
                    id: new ObjectId().toString(),
                    url: `/circles/current/events/${objectId}`,
                    data: { title: "wrong resource" },
                }) as ResolvedInternalPreview,
        ),
        (error: unknown) => error instanceof Error && error.message === PREVIEW_UNAVAILABLE,
    );
}

async function testUpdateIntent() {
    const stored = {
        internalPreviewType: "event" as const,
        internalPreviewId: objectId,
        internalPreviewUrl: `/circles/current/events/${objectId}`,
    };
    let resolves = 0;
    const preserved = await resolveInternalPreviewUpdateForWrite({
        request: { type: "event", id: objectId, url: "https://evil.test/forged" },
        presence: { type: true, id: true, url: true },
        stored,
        writerDid,
        resolvePreview: async () => {
            resolves += 1;
            return null;
        },
    });
    assert.deepEqual(preserved, { mode: "preserve", preview: stored });
    assert.equal(resolves, 0);
    assert.deepEqual(
        await resolveInternalPreviewUpdateForWrite({
            request: {},
            presence: { type: false, id: false, url: false },
            stored,
            writerDid,
        }),
        { mode: "preserve" },
    );
    assert.deepEqual(
        await resolveInternalPreviewUpdateForWrite({
            request: { type: "", id: "", url: "" },
            presence: { type: true, id: true, url: true },
            stored,
            writerDid,
        }),
        { mode: "remove" },
    );

    const changed = await resolveInternalPreviewUpdateForWrite({
        request: { type: "goal", id: objectId, url: "https://evil.test/forged?query=1#hash" },
        presence: { type: true, id: true, url: true },
        stored,
        writerDid,
        resolvePreview: async () =>
            ({
                type: "goal",
                id: objectId,
                url: `/circles/canonical/goals/${objectId}`,
                data: { title: "derived", stage: "open", description: "derived" },
            }) as ResolvedInternalPreview,
    });
    assert.deepEqual(changed, {
        mode: "set",
        preview: {
            internalPreviewType: "goal",
            internalPreviewId: objectId,
            internalPreviewUrl: `/circles/canonical/goals/${objectId}`,
        },
    });
}

async function testUppercaseObjectIdCandidate() {
    const uppercase = objectId.toUpperCase();
    let probe = "";
    const resolved = await resolveInternalPreviewForWrite(
        { type: "event", id: uppercase, url: `/circles/current/events/${uppercase}` },
        writerDid,
        async (url) => {
            probe = url;
            return {
                type: "event",
                id: objectId,
                url: `/circles/current/events/${objectId}`,
                data: { title: "canonical" },
            } as ResolvedInternalPreview;
        },
    );
    assert.equal(probe, `/circles/_/events/${objectId}`);
    assert.deepEqual(resolved, {
        internalPreviewType: "event",
        internalPreviewId: objectId,
        internalPreviewUrl: `/circles/current/events/${objectId}`,
    });

    await assert.rejects(
        resolveInternalPreviewForWrite(
            { type: "event", id: "abcdefabcdefabcdefabcdeg", url: "/circles/current/events/bad" },
            writerDid,
            async () => {
                throw new Error("resolver must not run");
            },
        ),
        (error: unknown) => error instanceof Error && error.message === PREVIEW_UNAVAILABLE,
    );
}

async function main() {
    await testSupportedTypesAndCanonicalAuthority();
    await testNeutralFailures();
    await testUpdateIntent();
    await testUppercaseObjectIdCandidate();
    console.log("internal preview write policy tests passed");
}

void main();
