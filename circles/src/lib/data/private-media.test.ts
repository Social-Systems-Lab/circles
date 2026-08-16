import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, PrivateMedia } from "@/models/models";
import {
    canReadPrivateMediaRecord,
    ensurePrivateMediaBucketExists,
    getPrivateMediaResponseHeaders,
    isPrivateMediaUrl,
    policyAllowsAnonymousObjectReads,
    resolvePrivateMediaRequest,
    savePrivateFileWithDependencies,
} from "./private-media";
import { canReadCircle } from "./circle-visibility-policy";

async function main() {
    const circleId = new ObjectId().toHexString();
    const record: PrivateMedia = {
        storageClass: "private",
        bucket: "circles-private",
        objectKey: "internal-key",
        ownerType: "circle",
        circleId,
        resourceType: "circle",
        uploadedByDid: "uploader",
        contentType: "image/png",
        size: 3,
        createdAt: new Date(),
    };

    async function allowed(status: Circle["moderationStatus"], member: boolean, userDid = "member") {
        return canReadPrivateMediaRecord(userDid, record, {
            findCircle: async () => ({ _id: new ObjectId(circleId), circleType: "circle", moderationStatus: status }),
            isMember: async () => member,
            canReadCircle: (viewerDid, circle) =>
                canReadCircle(viewerDid, circle, {
                    getMember: async () =>
                        member && viewerDid
                            ? { userDid: viewerDid, circleId, userGroups: ["members"], joinedAt: new Date() }
                            : null,
                }),
        });
    }

    assert.equal(await allowed("active", true), true, "active member may read");
    assert.equal(await allowed("paused", true), true, "paused member may read");
    assert.equal(await allowed("suspended", true), false, "suspended media is unavailable");
    assert.equal(await allowed("removed", true), false, "removed media is unavailable");
    assert.equal(await allowed("active", false), false, "non-member may not read");
    assert.equal(await allowed("active", false, "ordinary-superadmin"), false, "superadmin status gives no bypass");
    assert.equal(
        await canReadPrivateMediaRecord("outsider", record, {
            findCircle: async () => ({
                _id: new ObjectId(circleId),
                circleType: "circle",
                visibility: "secret",
                moderationStatus: "active",
            }),
            isMember: async () => false,
            canReadCircle: (viewerDid, circle) =>
                canReadCircle(viewerDid, circle, { getMember: async () => null }),
        }),
        false,
        "secret non-members are denied by the central circle read policy",
    );
    assert.equal(
        await canReadPrivateMediaRecord(undefined, record, {
            findCircle: async () => null,
            isMember: async () => true,
        }),
        false,
    );
    assert.equal(
        await canReadPrivateMediaRecord(
            "member",
            { ...record, ownerType: "conversation", conversationId: "chat" },
            {
                findCircle: async () => null,
                isMember: async () => true,
            },
        ),
        false,
        "conversation media is denied until canonical chat authorization is integrated",
    );

    assert.equal(isPrivateMediaUrl(`/private-media/${new ObjectId().toHexString()}`), true);
    assert.equal(isPrivateMediaUrl("/storage/circle/image.png"), false);
    assert.equal(getPrivateMediaResponseHeaders(record)["Content-Disposition"].startsWith("inline;"), true);
    assert.equal(
        getPrivateMediaResponseHeaders({ ...record, contentType: "text/html" })["Content-Disposition"].startsWith(
            "attachment;",
        ),
        true,
        "active content is never served inline",
    );

    const originalPrivateBucket = process.env.MINIO_PRIVATE_BUCKET;
    const originalPublicBucket = process.env.MINIO_BUCKET;
    try {
        process.env.MINIO_PRIVATE_BUCKET = "same-bucket";
        process.env.MINIO_BUCKET = "same-bucket";
        await assert.rejects(
            ensurePrivateMediaBucketExists({} as never),
            /must be different from the public media bucket/,
        );

        process.env.MINIO_PRIVATE_BUCKET = "private-test";
        process.env.MINIO_BUCKET = "public-test";
        const publicPolicy = JSON.stringify({
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Principal: { AWS: ["*"] }, Action: ["s3:GetObject"] }],
        });
        await assert.rejects(
            ensurePrivateMediaBucketExists({
                bucketExists: async () => true,
                makeBucket: async () => undefined,
                getBucketPolicy: async () => publicPolicy,
            } as never),
            /must not allow anonymous object reads/,
        );

        await ensurePrivateMediaBucketExists({
            bucketExists: async () => true,
            makeBucket: async () => undefined,
            getBucketPolicy: async () => {
                throw { code: "NoSuchBucketPolicy" };
            },
        } as never);

        let bucketCreated = false;
        let policyApplied = false;
        await ensurePrivateMediaBucketExists({
            bucketExists: async () => false,
            makeBucket: async () => {
                bucketCreated = true;
            },
            getBucketPolicy: async () => {
                throw { code: "NoSuchBucketPolicy" };
            },
            setBucketPolicy: async () => {
                policyApplied = true;
            },
        } as never);
        assert.equal(bucketCreated, true, "missing private bucket is created");
        assert.equal(policyApplied, false, "new private bucket never receives a public policy");

        await assert.rejects(
            ensurePrivateMediaBucketExists({
                bucketExists: async () => true,
                makeBucket: async () => undefined,
                getBucketPolicy: async () => {
                    throw new Error("policy service unavailable");
                },
            } as never),
            /policy service unavailable/,
        );
    } finally {
        if (originalPrivateBucket === undefined) delete process.env.MINIO_PRIVATE_BUCKET;
        else process.env.MINIO_PRIVATE_BUCKET = originalPrivateBucket;
        if (originalPublicBucket === undefined) delete process.env.MINIO_BUCKET;
        else process.env.MINIO_BUCKET = originalPublicBucket;
    }

    assert.equal(
        policyAllowsAnonymousObjectReads({ Statement: { Effect: "Allow", Principal: "*", Action: "s3:*" } }),
        true,
    );
    assert.equal(
        policyAllowsAnonymousObjectReads({
            Statement: { Effect: "Allow", Principal: { AWS: "arn:aws:iam::*:root" }, Action: "s3:GetObject*" },
        }),
        true,
    );

    const mediaId = new ObjectId().toHexString();
    const requestDependencies = {
        findRecord: async () => record,
        canRead: async () => true,
        objectExists: async () => true,
    };
    assert.equal(await resolvePrivateMediaRequest("malformed", "member", requestDependencies), null);
    assert.equal(await resolvePrivateMediaRequest(mediaId, undefined, requestDependencies), null);
    assert.equal(
        await resolvePrivateMediaRequest(mediaId, "member", { ...requestDependencies, findRecord: async () => null }),
        null,
    );
    assert.equal(
        await resolvePrivateMediaRequest(mediaId, "member", { ...requestDependencies, canRead: async () => false }),
        null,
    );
    assert.equal(
        await resolvePrivateMediaRequest(mediaId, "member", {
            ...requestDependencies,
            objectExists: async () => false,
        }),
        null,
        "missing object is indistinguishable from other unavailable cases",
    );
    assert.equal(await resolvePrivateMediaRequest(mediaId, "member", requestDependencies), record);

    let uploaded = false;
    let rolledBack = false;
    await assert.rejects(
        savePrivateFileWithDependencies(
            {
                file: Buffer.from("abc"),
                ownerType: "circle",
                circleId,
                resourceType: "circle",
                uploadedByDid: "uploader",
                originalName: "image.png",
                contentType: "image/png",
            },
            {
                ensureBucket: async () => undefined,
                putObject: async () => {
                    uploaded = true;
                },
                removeObject: async () => {
                    rolledBack = true;
                },
                insertRecord: async () => {
                    throw new Error("Mongo insert failed");
                },
            },
        ),
        /Mongo insert failed/,
    );
    assert.equal(uploaded, true);
    assert.equal(rolledBack, true, "object is removed when record insertion fails");

    let recordInsertedAfterFailedUpload = false;
    await assert.rejects(
        savePrivateFileWithDependencies(
            {
                file: Buffer.from("abc"),
                ownerType: "circle",
                circleId,
                resourceType: "circle",
                uploadedByDid: "uploader",
            },
            {
                ensureBucket: async () => undefined,
                putObject: async () => {
                    throw new Error("MinIO upload failed");
                },
                removeObject: async () => undefined,
                insertRecord: async () => {
                    recordInsertedAfterFailedUpload = true;
                    return { insertedId: new ObjectId() };
                },
            },
        ),
        /MinIO upload failed/,
    );
    assert.equal(recordInsertedAfterFailedUpload, false, "failed object upload never creates a Mongo record");

    console.log("private media policy tests passed");
}

void main();
