import { createHash } from "crypto";

type ObjectStat = { size: number; etag?: string };

export type VerificationObjectClient = {
    statObject(bucket: string, objectName: string): Promise<ObjectStat>;
    getObject(bucket: string, objectName: string): Promise<NodeJS.ReadableStream>;
    copyObject(bucket: string, objectName: string, source: string): Promise<unknown>;
};

const isMissingObjectError = (error: unknown): boolean => {
    const code = (error as { code?: string })?.code;
    return code === "NoSuchKey" || code === "NoSuchObject" || code === "NotFound";
};

const sha256 = async (stream: NodeJS.ReadableStream): Promise<string> => {
    const hash = createHash("sha256");
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest("hex");
};

const assertObjectsMatch = async (
    client: VerificationObjectClient,
    source: { bucket: string; objectName: string; stat: ObjectStat },
    destination: { bucket: string; objectName: string; stat: ObjectStat },
): Promise<void> => {
    if (source.stat.size !== destination.stat.size) {
        throw new Error(
            `Private destination mismatch for ${destination.objectName}: source size ${source.stat.size}, destination size ${destination.stat.size}`,
        );
    }

    const [sourceHash, destinationHash] = await Promise.all([
        sha256(await client.getObject(source.bucket, source.objectName)),
        sha256(await client.getObject(destination.bucket, destination.objectName)),
    ]);
    if (sourceHash !== destinationHash) {
        throw new Error(`Private destination content mismatch for ${destination.objectName}`);
    }
};

export const ensureVerifiedPrivateCopy = async (params: {
    client: VerificationObjectClient;
    publicBucket: string;
    privateBucket: string;
    sourceObject: string;
    destinationObject: string;
}): Promise<"copied" | "reused"> => {
    const sourceStat = await params.client.statObject(params.publicBucket, params.sourceObject);
    let destinationStat: ObjectStat | null = null;

    try {
        destinationStat = await params.client.statObject(params.privateBucket, params.destinationObject);
    } catch (error) {
        if (!isMissingObjectError(error)) throw error;
    }

    const result = destinationStat ? "reused" : "copied";
    if (!destinationStat) {
        await params.client.copyObject(
            params.privateBucket,
            params.destinationObject,
            `/${params.publicBucket}/${params.sourceObject}`,
        );
        destinationStat = await params.client.statObject(params.privateBucket, params.destinationObject);
    }

    await assertObjectsMatch(
        params.client,
        { bucket: params.publicBucket, objectName: params.sourceObject, stat: sourceStat },
        { bucket: params.privateBucket, objectName: params.destinationObject, stat: destinationStat },
    );
    return result;
};

type PolicyStatement = {
    Effect?: unknown;
    Principal?: unknown;
    Action?: unknown;
    Resource?: unknown;
    Condition?: unknown;
    NotPrincipal?: unknown;
    NotAction?: unknown;
    NotResource?: unknown;
};

const values = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const isAnonymousPrincipal = (principal: unknown): boolean => {
    if (principal === "*") return true;
    if (!principal || typeof principal !== "object" || Array.isArray(principal)) return false;
    return values((principal as { AWS?: unknown }).AWS).includes("*");
};

export const hasEffectiveAnonymousGetObjectDeny = (policy: unknown, requiredResources: string[]): boolean => {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) return false;
    const statements = (policy as { Statement?: unknown }).Statement;
    if (!Array.isArray(statements)) return false;

    return statements.some((statementValue) => {
        if (!statementValue || typeof statementValue !== "object" || Array.isArray(statementValue)) return false;
        const statement = statementValue as PolicyStatement;
        const actions = values(statement?.Action);
        const resources = values(statement?.Resource);
        const hasDisallowedConstraint = ["Condition", "NotPrincipal", "NotAction", "NotResource"].some((key) =>
            Object.prototype.hasOwnProperty.call(statement, key),
        );
        return (
            !hasDisallowedConstraint &&
            statement?.Effect === "Deny" &&
            isAnonymousPrincipal(statement.Principal) &&
            actions.includes("s3:GetObject") &&
            requiredResources.every((resource) => resources.includes(resource))
        );
    });
};

export const parseAndValidateAnonymousGetObjectDeny = (policyJson: string, requiredResources: string[]): boolean => {
    try {
        return hasEffectiveAnonymousGetObjectDeny(JSON.parse(policyJson), requiredResources);
    } catch {
        return false;
    }
};
