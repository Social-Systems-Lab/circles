import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Bun's runtime mock API is available when this test is run with `bun test`.
import { mock } from "bun:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { Readable } from "stream";

const messageId = new ObjectId().toString();
const requestId = new ObjectId().toString();
const state: {
    viewerDid?: string;
    isAdmin: boolean;
    message: any;
    request: any;
    storedReads: number;
    publicReads: number;
} = {
    viewerDid: undefined,
    isAdmin: false,
    message: null,
    request: null,
    storedReads: 0,
    publicReads: 0,
};

mock.module("@/lib/auth/auth", () => ({ getAuthenticatedUserDid: async () => state.viewerDid }));
mock.module("@/lib/data/user", () => ({
    getUserPrivate: async () => ({ did: state.viewerDid, isAdmin: state.isAdmin }),
}));
mock.module("@/lib/data/db", () => ({
    db: {
        collection: (name: string) => ({
            findOne: async (query: { _id: ObjectId }) => {
                if (name === "verificationMessages") {
                    return state.message?._id?.toString() === query._id.toString() ? state.message : null;
                }
                return state.request?._id?.toString() === query._id.toString() ? state.request : null;
            },
        }),
    },
    Circles: {},
}));
mock.module("@/lib/data/storage", () => ({
    getVerificationFile: async () => {
        state.storedReads++;
        return { stream: Readable.from("private evidence"), contentType: "application/pdf" };
    },
    isLegacyVerificationObject: (objectName: string) =>
        objectName.split("/").at(-1)?.startsWith("verification-attachment") === true,
}));
mock.module("@/lib/data/media-access", () => ({ getStoredObjectAccess: async () => "allowed" }));
mock.module("minio", () => ({
    Client: class {
        async getObject() {
            state.publicReads++;
            return Readable.from("public media");
        }
    },
}));

const attachmentRoute = await import("@/app/verification-attachments/[messageId]/[attachmentIndex]/route");
const storageRoute = await import("@/app/storage/[...path]/route");
const uploadsRoute = await import("@/app/uploads/[...path]/route");
const { serializeVerificationAttachment } = await import("@/lib/data/verification-attachment-access");

const reset = () => {
    state.viewerDid = "did:subject";
    state.isAdmin = false;
    state.message = {
        _id: new ObjectId(messageId),
        requestId,
        attachments: [
            {
                url: `verification-private://${requestId}/${messageId}/private-object.pdf`,
                fileName: "private-object.pdf",
                originalName: "evidence.pdf",
            },
        ],
        senderDid: "did:subject",
        senderRole: "applicant",
        body: "",
        createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    state.request = { _id: new ObjectId(requestId), userDid: "did:subject" };
    state.storedReads = 0;
    state.publicReads = 0;
};

const getAttachment = (id = messageId, index = "0") =>
    attachmentRoute.GET(new Request("http://localhost"), {
        params: Promise.resolve({ messageId: id, attachmentIndex: index }),
    });

test("anonymous verification attachment request fails without reading storage", async () => {
    reset();
    state.viewerDid = undefined;
    assert.equal((await getAttachment()).status, 404);
    assert.equal(state.storedReads, 0);
});

test("unrelated authenticated user fails", async () => {
    reset();
    state.viewerDid = "did:stranger";
    assert.equal((await getAttachment()).status, 403);
    assert.equal(state.storedReads, 0);
});

test("verification subject succeeds", async () => {
    reset();
    const response = await getAttachment();
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "private evidence");
    assert.equal(response.headers.get("content-disposition"), "inline; filename*=UTF-8''evidence.pdf");
    assert.equal(response.headers.get("content-type"), "application/pdf");
});

test("missing original name uses only the neutral attachment filename", async () => {
    reset();
    state.message.attachments[0].originalName = undefined;
    const response = await getAttachment();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), "inline; filename*=UTF-8''attachment");
    assert.doesNotMatch(response.headers.get("content-disposition") ?? "", /private-object\.pdf/);
});

test("attachment response sanitizes malicious original names and never emits the private filename", async () => {
    reset();
    state.message.attachments[0].originalName = "../malicious\r\n\u0000name.pdf";
    const response = await getAttachment();
    const disposition = response.headers.get("content-disposition") ?? "";
    assert.equal(disposition, "inline; filename*=UTF-8''maliciousname.pdf");
    assert.doesNotMatch(disposition, /[\r\n\u0000-\u001f\u007f]/);
    assert.doesNotMatch(disposition, /private-object\.pdf/);
});

test("authorized admin succeeds", async () => {
    reset();
    state.viewerDid = "did:reviewer";
    state.isAdmin = true;
    assert.equal((await getAttachment()).status, 200);
});

test("invalid or out-of-range attachment index fails", async () => {
    reset();
    assert.equal((await getAttachment(messageId, "invalid")).status, 404);
    assert.equal((await getAttachment(messageId, "1")).status, 404);
    assert.equal(state.storedReads, 0);
});

test("wrong message ID fails", async () => {
    reset();
    assert.equal((await getAttachment(new ObjectId().toString())).status, 404);
    assert.equal(state.storedReads, 0);
});

for (const [name, route] of [
    ["storage", storageRoute],
    ["uploads", uploadsRoute],
] as const) {
    test(`/${name} blocks historical verification evidence`, async () => {
        reset();
        const response = await route.GET(new NextRequest("http://localhost"), {
            params: Promise.resolve({ path: ["owner", "verification-attachment1.pdf"] }),
        });
        assert.equal(response.status, 404);
        assert.equal(state.publicReads, 0);
    });

    test(`/${name} still retrieves ordinary public media`, async () => {
        reset();
        const response = await route.GET(new NextRequest("http://localhost"), {
            params: Promise.resolve({ path: ["owner", "profile-picture.jpg"] }),
        });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "public media");
        assert.equal(state.publicReads, 1);
    });
}

test("browser verification DTO exposes only route URL and original display name", () => {
    reset();
    state.message.attachments[0].originalName = "../evidence.pdf";
    const attachment = serializeVerificationAttachment(state.message.attachments[0], messageId, 0);
    assert.deepEqual(attachment, {
        url: `/verification-attachments/${messageId}/0`,
        originalName: "evidence.pdf",
    });
    assert.doesNotMatch(JSON.stringify(attachment), /verification-private:\/\//);
    assert.doesNotMatch(JSON.stringify(attachment), /private-object\.pdf/);
    assert.equal("fileName" in attachment, false);
});
