/** Read-only verifier for the verification attachment privacy migration. */
import { Client as MinioClient } from "minio";
import { MongoClient } from "mongodb";
import { parseAndValidateAnonymousGetObjectDeny } from "./verification-attachment-migration-helpers";

const PUBLIC_BUCKET = process.env.MINIO_BUCKET || "circles";
const PRIVATE_BUCKET = process.env.MINIO_VERIFICATION_BUCKET || "circles-verification";
const PRIVATE_SCHEME = "verification-private://";
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

async function main() {
    const mongo = new MongoClient(mongoUri);
    await mongo.connect();
    try {
        const messages = await mongo
            .db("circles")
            .collection("verificationMessages")
            .find({ "attachments.0": { $exists: true } })
            .toArray();
        let checked = 0;
        for (const message of messages) {
            for (const attachment of message.attachments || []) {
                if (typeof attachment.url !== "string" || !attachment.url.startsWith(PRIVATE_SCHEME)) {
                    throw new Error(`Non-private verification locator remains in message ${message._id}`);
                }
                await minio.statObject(PRIVATE_BUCKET, attachment.url.slice(PRIVATE_SCHEME.length));
                checked++;
            }
        }
        try {
            const policy = await minio.getBucketPolicy(PRIVATE_BUCKET);
            if (policy) throw new Error(`${PRIVATE_BUCKET} unexpectedly has a bucket policy`);
        } catch (error: any) {
            if (error?.code !== "NoSuchBucketPolicy" && error?.code !== "NoSuchPolicy") throw error;
        }
        const publicPolicy = await minio.getBucketPolicy(PUBLIC_BUCKET);
        const requiredResources = [`arn:aws:s3:::${PUBLIC_BUCKET}/*/verification-attachment*`];
        if (!parseAndValidateAnonymousGetObjectDeny(publicPolicy, requiredResources)) {
            throw new Error("Public bucket policy is missing the legacy verification attachment deny");
        }
        console.log(`Verified ${checked} private verification attachment(s) and both bucket policies.`);
    } finally {
        await mongo.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
