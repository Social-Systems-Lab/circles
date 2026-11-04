/**
 * Idempotently copies legacy verification evidence from the public bucket to the
 * private verification bucket and updates only the corresponding Mongo locator.
 *
 * Dry run (default): bun scripts/migrate-verification-attachments-private.ts
 * Apply:             bun scripts/migrate-verification-attachments-private.ts --apply
 */
import path from "path";
import { Client as MinioClient } from "minio";
import { MongoClient } from "mongodb";
import {
    ensureVerifiedPrivateCopy,
    hasEffectiveAnonymousGetObjectDeny,
} from "./verification-attachment-migration-helpers";

const PUBLIC_BUCKET = process.env.MINIO_BUCKET || "circles";
const PRIVATE_BUCKET = process.env.MINIO_VERIFICATION_BUCKET || "circles-verification";
const PRIVATE_SCHEME = "verification-private://";
const apply = process.argv.includes("--apply");
const mongoUri =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGO_ROOT_USERNAME || "admin"}:${process.env.MONGO_ROOT_PASSWORD || "password"}@${process.env.MONGO_HOST || "127.0.0.1"}:${process.env.MONGO_PORT || "27017"}`;
const minio = new MinioClient({
    endPoint: process.env.MINIO_HOST || "127.0.0.1",
    port: Number(process.env.MINIO_PORT || "9000"),
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USERNAME || "minioadmin",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
});

const legacyObjectName = (url: string): string | null => {
    const marker = "/storage/";
    const index = url.indexOf(marker);
    const objectName = index >= 0 ? url.slice(index + marker.length) : "";
    return objectName.split("/").at(-1)?.startsWith("verification-attachment") ? objectName : null;
};

async function main() {
    const mongo = new MongoClient(mongoUri);
    await mongo.connect();
    try {
        const messages = await mongo
            .db("circles")
            .collection("verificationMessages")
            .find({ "attachments.0": { $exists: true } })
            .toArray();
        let legacyCount = 0;

        if (apply && !(await minio.bucketExists(PRIVATE_BUCKET))) await minio.makeBucket(PRIVATE_BUCKET);
        if (apply) {
            try {
                await minio.setBucketPolicy(PRIVATE_BUCKET, "");
            } catch (error: any) {
                if (error?.code !== "NoSuchBucketPolicy" && error?.code !== "NoSuchPolicy") throw error;
            }

            const existingPolicy = JSON.parse(await minio.getBucketPolicy(PUBLIC_BUCKET));
            const statements = Array.isArray(existingPolicy.Statement) ? existingPolicy.Statement : [];
            const requiredResources = [`arn:aws:s3:::${PUBLIC_BUCKET}/*/verification-attachment*`];
            if (!hasEffectiveAnonymousGetObjectDeny(existingPolicy, requiredResources)) {
                statements.push({
                    Effect: "Deny",
                    Principal: "*",
                    Action: ["s3:GetObject"],
                    Resource: requiredResources,
                });
                const updatedPolicy = { ...existingPolicy, Statement: statements };
                await minio.setBucketPolicy(PUBLIC_BUCKET, JSON.stringify(updatedPolicy));
                if (!hasEffectiveAnonymousGetObjectDeny(updatedPolicy, requiredResources)) {
                    throw new Error("Failed to install the legacy verification attachment deny");
                }
            }
        }

        for (const message of messages) {
            for (const [index, attachment] of (message.attachments || []).entries()) {
                if (typeof attachment.url !== "string" || attachment.url.startsWith(PRIVATE_SCHEME)) continue;
                const sourceObject = legacyObjectName(attachment.url);
                if (!sourceObject)
                    throw new Error(`Unexpected verification locator in message ${message._id}: ${attachment.url}`);
                legacyCount++;
                const safeName = path.basename(sourceObject).replace(/[^a-zA-Z0-9._-]/g, "_");
                const destination = `${message.requestId}/${message._id}/legacy-${index}-${safeName}`;
                console.log(`[${apply ? "apply" : "dry-run"}] ${sourceObject} -> ${PRIVATE_BUCKET}/${destination}`);
                if (!apply) continue;

                await ensureVerifiedPrivateCopy({
                    client: minio,
                    publicBucket: PUBLIC_BUCKET,
                    privateBucket: PRIVATE_BUCKET,
                    sourceObject,
                    destinationObject: destination,
                });
                await mongo
                    .db("circles")
                    .collection("verificationMessages")
                    .updateOne(
                        { _id: message._id, [`attachments.${index}.url`]: attachment.url },
                        { $set: { [`attachments.${index}.url`]: `${PRIVATE_SCHEME}${destination}` } },
                    );
            }
        }
        console.log(`${apply ? "Migrated" : "Would migrate"} ${legacyCount} legacy verification attachment(s).`);
    } finally {
        await mongo.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
