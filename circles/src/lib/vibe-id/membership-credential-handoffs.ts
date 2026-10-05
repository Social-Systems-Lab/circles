import crypto from "crypto";
import type { Collection, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circles, MembershipCredentialHandoffs } from "@/lib/data/db";
import {
    createCircleMembershipCredentialEnvelopeForAccount,
    createPlatformMembershipCredentialEnvelopeForAccount,
    getLinkedVibeIdDid,
    revalidateCircleMembershipCredentialAuthorization,
    revalidatePlatformMembershipCredentialAuthorization,
    type VibeCredentialEnvelope,
} from "@/lib/vibe-id/membership-credentials";
import { createMembershipCredentialStatusCapability } from "@/lib/vibe-id/membership-credential-statuses";

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type MembershipCredentialHandoff = {
    tokenHash: string;
    credentialType: "platform" | "circle";
    authenticatedUserDid: string;
    linkedVibeDid: string;
    circleId?: string;
    createdAt: Date;
    expiresAt: Date;
    state: "pending" | "redeeming" | "consumed";
    redemptionAttemptId?: string;
    redeemingAt?: Date;
    consumedAt?: Date;
};

type HandoffCollection = Pick<Collection<MembershipCredentialHandoff>, "insertOne" | "findOne" | "findOneAndUpdate">;

export type MembershipCredentialHandoffDependencies = {
    authenticate: () => Promise<string | undefined>;
    findUser: (authenticatedUserDid: string) => Promise<{
        did?: string;
        metadata?: { authProviders?: { vibeId?: { did?: string } } };
    } | null>;
    collection: HandoffCollection;
    issuePlatform: (input: {
        authenticatedUserDid: string;
        expectedSubjectVibeDid: string;
        statusUrl?: string;
    }) => Promise<VibeCredentialEnvelope | null>;
    issueCircle: (input: {
        circleId: string;
        authenticatedUserDid: string;
        expectedSubjectVibeDid: string;
        statusUrl?: string;
    }) => Promise<VibeCredentialEnvelope | null>;
    revalidatePlatform: typeof revalidatePlatformMembershipCredentialAuthorization;
    revalidateCircle: typeof revalidateCircleMembershipCredentialAuthorization;
    now: () => Date;
    randomToken: () => string;
    createStatusCapability: typeof createMembershipCredentialStatusCapability;
};

const defaultDependencies: MembershipCredentialHandoffDependencies = {
    authenticate: getAuthenticatedUserDid,
    findUser: async (authenticatedUserDid) =>
        Circles.findOne(
            { circleType: "user", did: authenticatedUserDid },
            { projection: { did: 1, "metadata.authProviders.vibeId.did": 1 } },
        ),
    collection: MembershipCredentialHandoffs,
    issuePlatform: createPlatformMembershipCredentialEnvelopeForAccount,
    issueCircle: createCircleMembershipCredentialEnvelopeForAccount,
    revalidatePlatform: revalidatePlatformMembershipCredentialAuthorization,
    revalidateCircle: revalidateCircleMembershipCredentialAuthorization,
    now: () => new Date(),
    randomToken: () => crypto.randomBytes(TOKEN_BYTES).toString("base64url"),
    createStatusCapability: createMembershipCredentialStatusCapability,
};

export type MembershipCredentialHandoffResult = {
    token: string;
    subjectVibeDid: string;
    credentialUrl: string;
    deepLinkUrl: string;
};

export async function createMembershipCredentialHandoffForSession(
    input: { credentialType: "platform" } | { credentialType: "circle"; circleId: string },
    dependencies: MembershipCredentialHandoffDependencies = defaultDependencies,
): Promise<MembershipCredentialHandoffResult | null> {
    const authenticatedUserDid = await dependencies.authenticate();
    if (!authenticatedUserDid) return null;

    if (input.credentialType === "circle" && !ObjectId.isValid(input.circleId)) return null;

    const user = await dependencies.findUser(authenticatedUserDid);
    const linkedVibeDid = getLinkedVibeIdDid(user);
    if (!user?.did || user.did !== authenticatedUserDid || !linkedVibeDid) return null;

    const envelope =
        input.credentialType === "platform"
            ? await dependencies.issuePlatform({
                  authenticatedUserDid,
                  expectedSubjectVibeDid: linkedVibeDid,
              })
            : await dependencies.issueCircle({
                  circleId: input.circleId,
                  authenticatedUserDid,
                  expectedSubjectVibeDid: linkedVibeDid,
              });
    if (!envelope || envelope.credential.subjectDid !== linkedVibeDid) return null;

    const token = dependencies.randomToken();
    const createdAt = dependencies.now();
    const expiresAt = new Date(createdAt.getTime() + HANDOFF_TTL_MS);
    await dependencies.collection.insertOne({
        tokenHash: hashToken(token),
        credentialType: input.credentialType,
        authenticatedUserDid,
        linkedVibeDid,
        circleId: input.credentialType === "circle" ? input.circleId : undefined,
        createdAt,
        expiresAt,
        state: "pending",
    });

    const credentialUrl = new URL(`/api/vibe-id/credentials/${input.credentialType}-membership/claim`, getSiteOrigin());
    credentialUrl.searchParams.set("token", token);
    const deepLinkUrl = new URL("vibe-id://credential");
    deepLinkUrl.searchParams.set("u", credentialUrl.toString());

    return {
        token,
        subjectVibeDid: linkedVibeDid,
        credentialUrl: credentialUrl.toString(),
        deepLinkUrl: deepLinkUrl.toString(),
    };
}

export async function redeemMembershipCredentialHandoff(
    input: { token: string; credentialType: "platform" | "circle" },
    dependencies: MembershipCredentialHandoffDependencies = defaultDependencies,
): Promise<VibeCredentialEnvelope | null> {
    if (!TOKEN_PATTERN.test(input.token)) return null;

    const tokenHash = hashToken(input.token);
    const attemptId = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
    const claimedAt = dependencies.now();
    const handoff = await dependencies.collection.findOneAndUpdate(
        {
            tokenHash,
            credentialType: input.credentialType,
            state: "pending",
            expiresAt: { $gt: claimedAt },
        },
        { $set: { state: "redeeming", redemptionAttemptId: attemptId, redeemingAt: claimedAt } },
        { returnDocument: "after" },
    );
    if (!handoff) return null;

    try {
        const statusCapability = await dependencies.createStatusCapability({
            credentialType: handoff.credentialType,
            authenticatedUserDid: handoff.authenticatedUserDid,
            linkedVibeDid: handoff.linkedVibeDid,
            circleId: handoff.circleId,
        });
        const envelope = await issueFromStoredContext(handoff, statusCapability.statusUrl, dependencies);
        if (!envelope || envelope.credential.subjectDid !== handoff.linkedVibeDid) {
            await consumeClaimedHandoff(tokenHash, input.credentialType, attemptId, dependencies);
            return null;
        }

        const stillAuthorized = await revalidateStoredContext(handoff, dependencies);
        if (!stillAuthorized) {
            await consumeClaimedHandoff(tokenHash, input.credentialType, attemptId, dependencies);
            return null;
        }

        const consumed = await consumeClaimedHandoff(tokenHash, input.credentialType, attemptId, dependencies);
        return consumed ? envelope : null;
    } catch {
        await consumeClaimedHandoff(tokenHash, input.credentialType, attemptId, dependencies).catch(() => null);
        return null;
    }
}

async function revalidateStoredContext(
    handoff: WithId<MembershipCredentialHandoff> | MembershipCredentialHandoff,
    dependencies: MembershipCredentialHandoffDependencies,
): Promise<boolean> {
    if (handoff.credentialType === "platform") {
        return dependencies.revalidatePlatform({
            authenticatedUserDid: handoff.authenticatedUserDid,
            expectedSubjectVibeDid: handoff.linkedVibeDid,
        });
    }
    if (!handoff.circleId || !ObjectId.isValid(handoff.circleId)) return false;
    return dependencies.revalidateCircle({
        circleId: handoff.circleId,
        authenticatedUserDid: handoff.authenticatedUserDid,
        expectedSubjectVibeDid: handoff.linkedVibeDid,
    });
}

async function issueFromStoredContext(
    handoff: WithId<MembershipCredentialHandoff> | MembershipCredentialHandoff,
    statusUrl: string,
    dependencies: MembershipCredentialHandoffDependencies,
): Promise<VibeCredentialEnvelope | null> {
    if (handoff.credentialType === "platform") {
        return dependencies.issuePlatform({
            authenticatedUserDid: handoff.authenticatedUserDid,
            expectedSubjectVibeDid: handoff.linkedVibeDid,
            statusUrl,
        });
    }
    if (!handoff.circleId || !ObjectId.isValid(handoff.circleId)) return null;
    return dependencies.issueCircle({
        circleId: handoff.circleId,
        authenticatedUserDid: handoff.authenticatedUserDid,
        expectedSubjectVibeDid: handoff.linkedVibeDid,
        statusUrl,
    });
}

async function consumeClaimedHandoff(
    tokenHash: string,
    credentialType: "platform" | "circle",
    attemptId: string,
    dependencies: MembershipCredentialHandoffDependencies,
) {
    return dependencies.collection.findOneAndUpdate(
        {
            tokenHash,
            credentialType,
            state: "redeeming",
            redemptionAttemptId: attemptId,
        },
        { $set: { state: "consumed", consumedAt: dependencies.now() } },
        { returnDocument: "after" },
    );
}

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("base64url");
}

function getSiteOrigin(): string {
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.CIRCLES_URL || "http://localhost:3000";
    return new URL(configuredOrigin).origin;
}
