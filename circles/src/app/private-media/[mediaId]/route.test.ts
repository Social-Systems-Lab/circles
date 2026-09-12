import assert from "node:assert/strict";
import { PassThrough, Readable } from "stream";
import { ObjectId } from "mongodb";
import type { Circle, PrivateMedia } from "@/models/models";
import { createPrivateMediaGetHandler } from "./handler";

const circleId = new ObjectId().toHexString();
const mediaId = new ObjectId().toHexString();
const media: PrivateMedia = {
    _id: new ObjectId(mediaId),
    storageClass: "private",
    bucket: "circles-private",
    objectKey: `circle/${circleId}/123e4567-e89b-42d3-a456-426614174000.png`,
    ownerType: "circle",
    circleId,
    resourceType: "circle",
    uploadedByDid: "did:uploader",
    originalName: "private image.png",
    contentType: "image/png",
    size: 7,
    createdAt: new Date(),
};

const activeCircle: Circle = {
    _id: new ObjectId(circleId),
    circleType: "circle",
    moderationStatus: "active",
};

type Overrides = {
    authenticate?: () => Promise<string | undefined>;
    findRecord?: () => Promise<PrivateMedia | null>;
    findCircle?: () => Promise<Circle | null>;
    isMember?: () => Promise<boolean>;
    statObject?: () => Promise<void>;
    getObject?: () => Promise<Readable>;
};

const makeHandler = (overrides: Overrides = {}) =>
    createPrivateMediaGetHandler({
        authenticate: overrides.authenticate || (async () => "did:member"),
        findRecord: overrides.findRecord || (async () => media),
        findCircle: overrides.findCircle || (async () => activeCircle),
        isMember: overrides.isMember || (async () => true),
        statObject: overrides.statObject || (async () => undefined),
        getObject: overrides.getObject || (async () => Readable.from(Buffer.from("content"))),
    });

const invoke = (handler: ReturnType<typeof makeHandler>, id = mediaId) =>
    handler(new Request(`http://localhost/private-media/${id}`), { params: Promise.resolve({ mediaId: id }) });

type NeutralResponse = { status: number; body: string; headers: Record<string, string> };

async function neutralResponse(response: Response): Promise<NeutralResponse> {
    return {
        status: response.status,
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
    };
}

async function main() {
    const expectedNeutral = await neutralResponse(await invoke(makeHandler(), "malformed"));
    assert.deepEqual(expectedNeutral, {
        status: 404,
        body: "Not found",
        headers: { "content-type": "text/plain;charset=UTF-8" },
    });

    const denialCases: Array<[string, Overrides]> = [
        ["unauthenticated", { authenticate: async () => undefined }],
        ["invalid session", { authenticate: async () => Promise.reject(new Error("invalid session")) }],
        ["missing record", { findRecord: async () => null }],
        ["missing circle", { findCircle: async () => null }],
        ["wrong circle", { findCircle: async () => ({ ...activeCircle, _id: new ObjectId() }) }],
        ["malformed circle", { findRecord: async () => ({ ...media, circleId: "malformed" }) }],
        [
            "wrong owner key",
            { findRecord: async () => ({ ...media, objectKey: `circle/${new ObjectId().toHexString()}/file.png` }) },
        ],
        ["wrong bucket", { findRecord: async () => ({ ...media, bucket: "circles" }) }],
        ["non-member", { isMember: async () => false }],
        ["former member", { authenticate: async () => "did:former", isMember: async () => false }],
        ["chat-only member", { authenticate: async () => "did:chat-only", isMember: async () => false }],
        ["wrong-Circle member", { authenticate: async () => "did:other-circle", isMember: async () => false }],
        ["admin-group-only user", { authenticate: async () => "did:admin-group", isMember: async () => false }],
        ["ordinary superadmin non-member", { authenticate: async () => "did:superadmin", isMember: async () => false }],
        ["suspended", { findCircle: async () => ({ ...activeCircle, moderationStatus: "suspended" }) }],
        ["removed", { findCircle: async () => ({ ...activeCircle, moderationStatus: "removed" }) }],
        [
            "conversation owner",
            { findRecord: async () => ({ ...media, ownerType: "conversation", conversationId: "conversation" }) },
        ],
        ["missing object", { statObject: async () => Promise.reject(new Error("missing object")) }],
        ["getObject failure", { getObject: async () => Promise.reject(new Error("get failed")) }],
    ];

    for (const [label, overrides] of denialCases) {
        assert.deepEqual(await neutralResponse(await invoke(makeHandler(overrides))), expectedNeutral, label);
    }

    let malformedKeyObjectReads = 0;
    assert.deepEqual(
        await neutralResponse(
            await invoke(
                makeHandler({
                    findRecord: async () => ({
                        ...media,
                        objectKey: `circle/${circleId}/------------------------------------`,
                    }),
                    statObject: async () => {
                        malformedKeyObjectReads += 1;
                    },
                    getObject: async () => {
                        malformedKeyObjectReads += 1;
                        return Readable.from(Buffer.from("unexpected"));
                    },
                }),
            ),
        ),
        expectedNeutral,
        "malformed private object key",
    );
    assert.equal(malformedKeyObjectReads, 0, "malformed metadata never reaches private object storage");

    for (const moderationStatus of ["active", "paused"] as const) {
        const response = await invoke(makeHandler({ findCircle: async () => ({ ...activeCircle, moderationStatus }) }));
        assert.equal(response.status, 200, `${moderationStatus} member response status`);
        assert.equal(response.headers.get("content-type"), "image/png");
        assert.match(response.headers.get("cache-control") || "", /private/);
        assert.match(response.headers.get("cache-control") || "", /no-store/);
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.match(
            response.headers.get("content-disposition") || "",
            /^inline; filename\*=UTF-8''private%20image\.png$/,
        );
        assert.equal(await response.text(), "content");
    }

    const delayedStream = new PassThrough();
    const streamingResponse = await invoke(makeHandler({ getObject: async () => delayedStream }));
    assert.equal(streamingResponse.status, 200, "handler returns before the source stream has completed");
    delayedStream.end("content");
    assert.equal(await streamingResponse.text(), "content");

    console.log("private media route tests passed");
}

void main();
