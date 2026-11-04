import crypto from "crypto";
import type { Collection } from "mongodb";
import { ObjectId } from "mongodb";
import { Circles, Members, MembershipCredentialStatuses } from "@/lib/data/db";
import { getLinkedVibeIdDid, isPlatformMember } from "@/lib/vibe-id/membership-credentials";
import type { Circle, Member } from "@/models/models";

const STATUS_TOKEN_BYTES = 32;
const STATUS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATUS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export type MembershipCredentialStatus = {
    tokenHash: string;
    credentialType: "platform" | "circle";
    authenticatedUserDid: string;
    linkedVibeDid: string;
    circleId?: string;
    createdAt: Date;
    expiresAt: Date;
};

type StatusCollection = Pick<Collection<MembershipCredentialStatus>, "insertOne" | "findOne">;

export type MembershipCredentialStatusDependencies = {
    collection: StatusCollection;
    findUser: (did: string) => Promise<Circle | null>;
    findCircle: (circleId: string) => Promise<Circle | null>;
    findMember: (did: string, circleId: string) => Promise<Member | null>;
    now: () => Date;
    randomToken: () => string;
};

const defaultDependencies: MembershipCredentialStatusDependencies = {
    collection: MembershipCredentialStatuses,
    findUser: (did) => Circles.findOne({ circleType: "user", did }),
    findCircle: (circleId) => Circles.findOne({ _id: new ObjectId(circleId) }),
    findMember: (did, circleId) => Members.findOne({ userDid: did, circleId }),
    now: () => new Date(),
    randomToken: () => crypto.randomBytes(STATUS_TOKEN_BYTES).toString("base64url"),
};

export async function createMembershipCredentialStatusCapability(
    input: {
        credentialType: "platform" | "circle";
        authenticatedUserDid: string;
        linkedVibeDid: string;
        circleId?: string;
    },
    dependencies: MembershipCredentialStatusDependencies = defaultDependencies,
): Promise<{ statusUrl: string; token: string }> {
    const token = dependencies.randomToken();
    const createdAt = dependencies.now();
    await dependencies.collection.insertOne({
        tokenHash: hashToken(token),
        credentialType: input.credentialType,
        authenticatedUserDid: input.authenticatedUserDid,
        linkedVibeDid: input.linkedVibeDid,
        circleId: input.credentialType === "circle" ? input.circleId : undefined,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + STATUS_TTL_MS),
    });

    const statusUrl = new URL(`/api/vibe-id/credentials/${input.credentialType}-membership/status`, getSiteOrigin());
    statusUrl.searchParams.set("token", token);
    return { statusUrl: statusUrl.toString(), token };
}

export async function resolveMembershipCredentialStatus(
    input: { token: string; credentialType: "platform" | "circle" },
    dependencies: MembershipCredentialStatusDependencies = defaultDependencies,
): Promise<"active" | "revoked" | "unknown"> {
    if (!STATUS_TOKEN_PATTERN.test(input.token)) return "unknown";
    const status = await dependencies.collection.findOne({
        tokenHash: hashToken(input.token),
        credentialType: input.credentialType,
        expiresAt: { $gt: dependencies.now() },
    } as never);
    if (!status) return "unknown";

    const user = await dependencies.findUser(status.authenticatedUserDid);
    if (!user?.did || user.did !== status.authenticatedUserDid || getLinkedVibeIdDid(user) !== status.linkedVibeDid) {
        return "revoked";
    }
    if (status.credentialType === "platform") return isPlatformMember(user) ? "active" : "revoked";
    if (!status.circleId || !ObjectId.isValid(status.circleId)) return "revoked";
    const circle = await dependencies.findCircle(status.circleId);
    if (!circle || circle.circleType === "user") return "revoked";
    const member = await dependencies.findMember(status.authenticatedUserDid, status.circleId);
    return member?.userDid === status.authenticatedUserDid && member?.circleId === status.circleId
        ? "active"
        : "revoked";
}

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("base64url");
}

function getSiteOrigin(): string {
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.CIRCLES_URL || "http://localhost:3000";
    return new URL(configuredOrigin).origin;
}
