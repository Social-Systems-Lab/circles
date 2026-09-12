import { randomUUID } from "crypto";
import path from "path";
import { Client as MinioClient } from "minio";
import { ObjectId } from "mongodb";
import type { Circle, PrivateMedia } from "@/models/models";
import { Circles, Members, PrivateMediaCollection } from "@/lib/data/db";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";

export const PRIVATE_MEDIA_PATH_PREFIX = "/private-media/";
const PRIVATE_MEDIA_URL_PATTERN = /^\/private-media\/([0-9a-fA-F]{24})$/;
export const getPrivateMediaBucketName = () => process.env.MINIO_PRIVATE_BUCKET || "circles-private";
export const getPublicMediaBucketName = () => process.env.MINIO_BUCKET || "circles";

const resolveMinioHost = () => {
    const configuredHost = process.env.MINIO_HOST || "127.0.0.1";
    if (process.env.NODE_ENV !== "production" && (configuredHost === "db" || configuredHost === "minio")) {
        return "127.0.0.1";
    }
    return configuredHost;
};

export const privateMediaMinioClient = new MinioClient({
    endPoint: resolveMinioHost(),
    port: parseInt(process.env.MINIO_PORT || "9000", 10),
    useSSL: false,
    accessKey: process.env.MINIO_ROOT_USERNAME || "minioadmin",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "minioadmin",
});

export async function ensurePrivateMediaBucketExists(
    client: Pick<MinioClient, "bucketExists" | "makeBucket" | "getBucketPolicy"> = privateMediaMinioClient,
): Promise<void> {
    const bucket = getPrivateMediaBucketName();
    if (bucket === getPublicMediaBucketName()) {
        throw new Error("Private media bucket must be different from the public media bucket");
    }
    if (!(await client.bucketExists(bucket))) {
        try {
            await client.makeBucket(bucket);
        } catch (error) {
            // Another application instance may have created it after our first check.
            if (!(await client.bucketExists(bucket))) throw error;
        }
    }

    // A missing policy is the expected private state. Never rewrite infrastructure
    // here: an unexpected or public policy must stop private-media use.
    try {
        const policy = JSON.parse(await client.getBucketPolicy(bucket));
        if (policyAllowsAnonymousObjectReads(policy)) {
            throw new Error("Private media bucket must not allow anonymous object reads");
        }
    } catch (error) {
        if (!isNoBucketPolicyError(error)) throw error;
    }
}

const isNoBucketPolicyError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") return false;
    const code = "code" in error ? String(error.code) : "";
    return code === "NoSuchBucketPolicy" || code === "NoSuchPolicy";
};

const containsPublicPrincipal = (principal: unknown): boolean => {
    if (typeof principal === "string") return principal.includes("*");
    if (Array.isArray(principal)) return principal.some(containsPublicPrincipal);
    if (principal && typeof principal === "object") {
        return Object.values(principal).some(containsPublicPrincipal);
    }
    return false;
};

const actionAllowsObjectRead = (action: unknown): boolean => {
    const actions = Array.isArray(action) ? action : [action];
    return actions.some((value) => {
        if (typeof value !== "string") return false;
        const pattern = value
            .toLowerCase()
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replaceAll("*", ".*");
        return new RegExp(`^${pattern}$`).test("s3:getobject");
    });
};

export const policyAllowsAnonymousObjectReads = (policy: unknown): boolean => {
    if (!policy || typeof policy !== "object") return false;
    const statementValue = "Statement" in policy ? policy.Statement : undefined;
    const statements = Array.isArray(statementValue) ? statementValue : [statementValue];
    return statements.some(
        (statement) =>
            statement &&
            typeof statement === "object" &&
            "Effect" in statement &&
            String(statement.Effect).toLowerCase() === "allow" &&
            (("Principal" in statement && containsPublicPrincipal(statement.Principal)) ||
                "NotPrincipal" in statement) &&
            "Action" in statement &&
            actionAllowsObjectRead(statement.Action),
    );
};

export type PrivateMediaOwner =
    | { ownerType: "circle"; circleId: string }
    | { ownerType: "conversation"; conversationId: string; circleId?: string };

export type SavePrivateFileInput = PrivateMediaOwner & {
    file: Buffer | { arrayBuffer(): Promise<ArrayBuffer>; name?: string; type?: string; size?: number };
    resourceType: PrivateMedia["resourceType"];
    resourceId?: string;
    uploadedByDid: string;
    originalName?: string;
    contentType?: string;
};

export type PrivateFileInfo = {
    mediaId: string;
    storageClass: "private";
    originalName?: string;
    url: string;
};

type UploadDependencies = {
    ensureBucket: () => Promise<void>;
    putObject: (
        bucket: string,
        key: string,
        data: Buffer,
        size: number,
        metadata: Record<string, string>,
    ) => Promise<unknown>;
    removeObject: (bucket: string, key: string) => Promise<unknown>;
    insertRecord: (record: PrivateMedia) => Promise<{ insertedId: ObjectId }>;
};

const extensionFor = (name?: string) => {
    const extension = name ? path.extname(name).toLowerCase() : "";
    return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
};

async function fileToBuffer(file: SavePrivateFileInput["file"]): Promise<Buffer> {
    return Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
}

export async function savePrivateFileWithDependencies(
    input: SavePrivateFileInput,
    dependencies: UploadDependencies,
): Promise<PrivateFileInfo> {
    if (input.ownerType === "circle" && !ObjectId.isValid(input.circleId)) throw new Error("Invalid circle owner");
    if (input.ownerType === "conversation" && !input.conversationId) throw new Error("Invalid conversation owner");

    const buffer = await fileToBuffer(input.file);
    const originalName = input.originalName || (!Buffer.isBuffer(input.file) ? input.file.name : undefined);
    const contentType =
        input.contentType || (!Buffer.isBuffer(input.file) ? input.file.type : undefined) || "application/octet-stream";
    const ownerSegment = input.ownerType === "circle" ? input.circleId : input.conversationId;
    const objectKey = `${input.ownerType}/${ownerSegment}/${randomUUID()}${extensionFor(originalName)}`;
    const bucket = getPrivateMediaBucketName();

    await dependencies.ensureBucket();
    await dependencies.putObject(bucket, objectKey, buffer, buffer.length, { "Content-Type": contentType });

    const record: PrivateMedia = {
        storageClass: "private",
        bucket,
        objectKey,
        ownerType: input.ownerType,
        ...(input.ownerType === "circle"
            ? { circleId: input.circleId }
            : { conversationId: input.conversationId, circleId: input.circleId }),
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        uploadedByDid: input.uploadedByDid,
        originalName,
        contentType,
        size: buffer.length,
        createdAt: new Date(),
    };

    try {
        const result = await dependencies.insertRecord(record);
        const mediaId = result.insertedId.toHexString();
        return { mediaId, storageClass: "private", originalName, url: `${PRIVATE_MEDIA_PATH_PREFIX}${mediaId}` };
    } catch (error) {
        try {
            await dependencies.removeObject(bucket, objectKey);
        } catch (rollbackError) {
            throw new AggregateError(
                [error, rollbackError],
                "Private media record creation and uploaded-object rollback both failed",
            );
        }
        throw error;
    }
}

export const savePrivateFile = (input: SavePrivateFileInput) =>
    savePrivateFileWithDependencies(input, {
        ensureBucket: () => ensurePrivateMediaBucketExists(),
        putObject: (...args) => privateMediaMinioClient.putObject(...args),
        removeObject: (bucket, key) => privateMediaMinioClient.removeObject(bucket, key),
        insertRecord: (record) => PrivateMediaCollection.insertOne(record),
    });

type DeletePrivateFileDependencies = {
    findRecord: (id: ObjectId) => Promise<PrivateMedia | null>;
    removeObject: (bucket: string, key: string) => Promise<unknown>;
    deleteRecord: (id: ObjectId) => Promise<unknown>;
};

const defaultDeletePrivateFileDependencies: DeletePrivateFileDependencies = {
    findRecord: (id) => PrivateMediaCollection.findOne({ _id: id }),
    removeObject: (bucket, key) => privateMediaMinioClient.removeObject(bucket, key),
    deleteRecord: (id) => PrivateMediaCollection.deleteOne({ _id: id }),
};

async function deletePrivateFileWithOwnerCheck(
    mediaId: string,
    expectedCircleId: string | undefined,
    dependencies: DeletePrivateFileDependencies,
): Promise<void> {
    if (!ObjectId.isValid(mediaId)) throw new Error("Invalid private media ID");
    const _id = new ObjectId(mediaId);
    const record = await dependencies.findRecord(_id);
    if (!record) return;
    if (!isValidPrivateMediaRecordStorage(record)) throw new Error("Invalid private media record");
    if (
        expectedCircleId !== undefined &&
        (record.ownerType !== "circle" ||
            !ObjectId.isValid(expectedCircleId) ||
            record.circleId !== new ObjectId(expectedCircleId).toHexString())
    ) {
        throw new Error("Private media is unavailable");
    }

    // Object-first means a database failure cannot leave an anonymously retrievable private object.
    await dependencies.removeObject(record.bucket, record.objectKey);
    await dependencies.deleteRecord(_id);
}

export const deletePrivateFile = (mediaId: string): Promise<void> =>
    deletePrivateFileWithOwnerCheck(mediaId, undefined, defaultDeletePrivateFileDependencies);

export const deleteCirclePrivateFileWithDependencies = (
    mediaId: string,
    expectedCircleId: string,
    dependencies: DeletePrivateFileDependencies,
): Promise<void> => deletePrivateFileWithOwnerCheck(mediaId, expectedCircleId, dependencies);

export const deleteCirclePrivateFile = (mediaId: string, expectedCircleId: string): Promise<void> =>
    deletePrivateFileWithOwnerCheck(mediaId, expectedCircleId, defaultDeletePrivateFileDependencies);

export const parsePrivateMediaUrl = (url?: string | null): string | null => {
    if (typeof url !== "string") return null;
    return PRIVATE_MEDIA_URL_PATTERN.exec(url)?.[1] ?? null;
};

export const isPrivateMediaUrl = (url?: string | null): boolean => parsePrivateMediaUrl(url) !== null;

export const isValidPrivateMediaRecordStorage = (record: PrivateMedia): boolean => {
    if (record.storageClass !== "private" || record.bucket !== getPrivateMediaBucketName()) return false;
    if (record.ownerType === "circle") {
        if (!record.circleId || !ObjectId.isValid(record.circleId)) return false;
        const prefix = `circle/${new ObjectId(record.circleId).toHexString()}/`;
        return new RegExp(
            `^${prefix}[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\\.[a-z0-9]{1,10})?$`,
        ).test(record.objectKey);
    }
    return Boolean(
        record.ownerType === "conversation" &&
            record.conversationId &&
            record.objectKey.startsWith(`conversation/${record.conversationId}/`),
    );
};

export function getPrivateMediaResponseHeaders(record: PrivateMedia): Record<string, string> {
    const safeType = /^[\w.+-]+\/[\w.+-]+$/.test(record.contentType) ? record.contentType : "application/octet-stream";
    const inlineTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const disposition = inlineTypes.has(safeType) ? "inline" : "attachment";
    const filename = encodeURIComponent(record.originalName || "download");
    return {
        "Content-Type": safeType,
        "Content-Length": String(record.size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    };
}

type AccessDependencies = {
    findCircle: (circleId: string) => Promise<Circle | null>;
    isMember: (userDid: string, circleId: string) => Promise<boolean>;
    canReadCircle?: (userDid: string | undefined, circle: Circle) => Promise<boolean>;
};

export async function canReadPrivateMediaRecord(
    userDid: string | undefined,
    record: PrivateMedia,
    dependencies: AccessDependencies,
): Promise<boolean> {
    if (!userDid || !isValidPrivateMediaRecordStorage(record)) return false;
    if (record.ownerType !== "circle" || !record.circleId || !ObjectId.isValid(record.circleId)) return false;

    const circle = await dependencies.findCircle(record.circleId);
    if (
        !circle ||
        circle._id?.toString() !== new ObjectId(record.circleId).toHexString() ||
        !(await (dependencies.canReadCircle ?? canReadCircle)(userDid, circle))
    )
        return false;
    // Private-media records remain member-only even for public circles.
    return dependencies.isMember(userDid, record.circleId);
}

export const canAuthenticatedUserReadPrivateMedia = (userDid: string | undefined, record: PrivateMedia) =>
    canReadPrivateMediaRecord(userDid, record, {
        findCircle: (circleId) => Circles.findOne({ _id: new ObjectId(circleId) }),
        isMember: async (memberDid, circleId) => Boolean(await Members.findOne({ userDid: memberDid, circleId })),
    });

type RequestAccessDependencies = {
    findRecord: (id: ObjectId) => Promise<PrivateMedia | null>;
    canRead: (userDid: string | undefined, record: PrivateMedia) => Promise<boolean>;
    objectExists: (record: PrivateMedia) => Promise<boolean>;
};

export async function resolvePrivateMediaRequest(
    mediaId: string,
    userDid: string | undefined,
    dependencies: RequestAccessDependencies,
): Promise<PrivateMedia | null> {
    if (!ObjectId.isValid(mediaId) || !userDid) return null;
    const record = await dependencies.findRecord(new ObjectId(mediaId));
    if (!record || !(await dependencies.canRead(userDid, record))) return null;
    return (await dependencies.objectExists(record)) ? record : null;
}
