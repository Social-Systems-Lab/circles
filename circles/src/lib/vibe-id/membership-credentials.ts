import crypto, { type JsonWebKey, type KeyObject } from "crypto";
import { ObjectId } from "mongodb";
import type { Circle, Member } from "@/models/models";

const CREDENTIAL_KIND = "credential.v1";
const CREDENTIAL_ALGORITHM = "P-256";
const CREDENTIAL_TYPE = "CircleMembershipCredential";
const DEFAULT_ISSUER_DID = "did:web:kamooni.org";
const DEFAULT_ISSUER_KEY_ID = "kamooni-platform-v1";
const DEFAULT_EXPIRY_DAYS = 365;

type JsonRecord = Record<string, unknown>;

export type VibeUnsignedCredential = {
    id: string;
    type: string;
    issuer: string;
    issuerKeyId: string;
    subjectDid: string;
    claims: JsonRecord;
    issuedAt: string;
    expiresAt?: string | null;
    statusUrl?: string | null;
};

export type VibeSignedCredential = VibeUnsignedCredential & {
    alg: typeof CREDENTIAL_ALGORITHM;
    signature: string;
};

export type VibeCredentialEnvelope = {
    kind: typeof CREDENTIAL_KIND;
    credential: VibeSignedCredential;
};

export type CircleMembershipCredentialCardData = {
    circleName: string;
    circleHandle?: string;
    credentialId: string;
    issuedAt: string;
    expiresAt?: string | null;
    subjectDid: string;
    issuer: string;
    deepLinkUrl: string;
    credentialUrl: string;
    statusUrl: string;
};

export type CircleMembershipCredentialVerificationResult =
    | {
          ok: true;
          subjectDid: string;
          circleId: string;
          roles: string[];
          credentialId: string;
      }
    | {
          ok: false;
          error: string;
          message: string;
      };

type IssuerKeyMaterial = {
    issuer: string;
    issuerKeyId: string;
    privateKey: KeyObject;
};

let issuerKeyMaterial: IssuerKeyMaterial | null | undefined;

function getSiteOrigin(): string {
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.CIRCLES_URL || "http://localhost:3000";
    return new URL(configuredOrigin).origin;
}

function getIssuerKeyMaterial(): IssuerKeyMaterial | null {
    if (issuerKeyMaterial !== undefined) {
        return issuerKeyMaterial;
    }

    const rawPrivateJwk =
        process.env.VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK ||
        process.env.KAMOONI_VIBE_ID_ISSUER_PRIVATE_JWK ||
        "";
    if (!rawPrivateJwk.trim()) {
        issuerKeyMaterial = null;
        return issuerKeyMaterial;
    }

    const privateJwk = parseJsonWebKey(rawPrivateJwk);
    issuerKeyMaterial = {
        issuer: process.env.VIBE_ID_CREDENTIAL_ISSUER_DID || DEFAULT_ISSUER_DID,
        issuerKeyId: process.env.VIBE_ID_CREDENTIAL_ISSUER_KID || DEFAULT_ISSUER_KEY_ID,
        privateKey: crypto.createPrivateKey({ key: privateJwk, format: "jwk" }),
    };
    return issuerKeyMaterial;
}

export function isMembershipCredentialIssuerConfigured(): boolean {
    return getIssuerKeyMaterial() !== null;
}

export function getMembershipCredentialIssuerMetadata() {
    const keyMaterial = getIssuerKeyMaterial();
    if (!keyMaterial) {
        return null;
    }

    const publicJwk = crypto.createPublicKey(keyMaterial.privateKey).export({ format: "jwk" });
    return {
        issuer: keyMaterial.issuer,
        issuerKeyId: keyMaterial.issuerKeyId,
        alg: CREDENTIAL_ALGORITHM,
        publicJwk,
    };
}

export function getLinkedVibeIdDid(user: Circle | null | undefined): string | null {
    const did = user?.metadata?.authProviders?.vibeId?.did;
    return typeof did === "string" && did.trim() ? did.trim() : null;
}

export function createCircleMembershipCredentialCard(input: {
    circle: Circle;
    member: Member;
    subjectVibeDid: string;
}): CircleMembershipCredentialCardData | null {
    const keyMaterial = getIssuerKeyMaterial();
    if (!keyMaterial || !input.circle._id) {
        return null;
    }

    const circleId = String(input.circle._id);
    const statusUrl = new URL("/api/vibe-id/credentials/circle-membership/status", getSiteOrigin());
    statusUrl.searchParams.set("circleId", circleId);
    statusUrl.searchParams.set("subjectDid", input.subjectVibeDid);
    const credentialUrl = new URL("/api/vibe-id/credentials/circle-membership/claim", getSiteOrigin());
    credentialUrl.searchParams.set("circleId", circleId);
    credentialUrl.searchParams.set("subjectDid", input.subjectVibeDid);
    const envelope = createSignedCircleMembershipCredentialEnvelope(input);
    if (!envelope) {
        return null;
    }
    const signedCredential = envelope.credential;

    return {
        circleName: input.circle.name || "Circle",
        circleHandle: input.circle.handle,
        credentialId: signedCredential.id,
        issuedAt: signedCredential.issuedAt,
        expiresAt: signedCredential.expiresAt,
        subjectDid: signedCredential.subjectDid,
        issuer: signedCredential.issuer,
        deepLinkUrl: createCredentialClaimDeepLink(credentialUrl.toString()),
        credentialUrl: credentialUrl.toString(),
        statusUrl: statusUrl.toString(),
    };
}

export async function createCircleMembershipCredentialEnvelope(input: {
    circleId: string;
    subjectVibeDid: string;
}): Promise<VibeCredentialEnvelope | null> {
    const { Circles } = await import("@/lib/data/db");
    const { getMember } = await import("@/lib/data/member");
    const circle = await Circles.findOne({ _id: new ObjectId(input.circleId) });
    if (!circle) {
        return null;
    }

    const user = await Circles.findOne(
        {
            circleType: "user",
            "metadata.authProviders.vibeId.did": input.subjectVibeDid,
        },
        { projection: { did: 1 } },
    );
    if (!user?.did) {
        return null;
    }

    const member = await getMember(user.did, input.circleId);
    if (!member) {
        return null;
    }

    const card = createCircleMembershipCredentialCard({
        circle: { ...circle, _id: circle._id.toString() } as Circle,
        member,
        subjectVibeDid: input.subjectVibeDid,
    });
    return card ? createSignedCircleMembershipCredentialEnvelope({
        circle: { ...circle, _id: circle._id.toString() } as Circle,
        member,
        subjectVibeDid: input.subjectVibeDid,
    }) : null;
}

export function verifyCircleMembershipCredentialEnvelope(input: unknown): CircleMembershipCredentialVerificationResult {
    const keyMaterial = getIssuerKeyMaterial();
    if (!keyMaterial) {
        return {
            ok: false,
            error: "issuer_not_configured",
            message: "Credential issuer is not configured.",
        };
    }

    const envelope = parseCredentialEnvelope(input);
    if (!envelope) {
        return {
            ok: false,
            error: "invalid_envelope",
            message: "Credential envelope is not readable.",
        };
    }

    const { credential } = envelope;
    if (credential.type !== CREDENTIAL_TYPE) {
        return {
            ok: false,
            error: "unsupported_credential_type",
            message: "This endpoint only accepts circle membership credentials.",
        };
    }

    if (credential.issuer !== keyMaterial.issuer || credential.issuerKeyId !== keyMaterial.issuerKeyId) {
        return {
            ok: false,
            error: "issuer_mismatch",
            message: "Credential issuer does not match this Circles instance.",
        };
    }

    if (credential.expiresAt && Date.parse(credential.expiresAt) <= Date.now()) {
        return {
            ok: false,
            error: "credential_expired",
            message: "Credential has expired.",
        };
    }

    if (!verifyCredentialSignature(credential, keyMaterial.privateKey)) {
        return {
            ok: false,
            error: "invalid_signature",
            message: "Credential signature is not valid.",
        };
    }

    const circleId = typeof credential.claims.circleId === "string" ? credential.claims.circleId : "";
    if (!circleId) {
        return {
            ok: false,
            error: "missing_circle",
            message: "Credential does not identify a circle.",
        };
    }

    const roles = Array.isArray(credential.claims.roles)
        ? credential.claims.roles.filter((role): role is string => typeof role === "string")
        : [];

    return {
        ok: true,
        subjectDid: credential.subjectDid,
        circleId,
        roles,
        credentialId: credential.id,
    };
}

function createMembershipCredentialId(circleId: string, subjectDid: string): string {
    const digest = crypto
        .createHash("sha256")
        .update(`CircleMembershipCredential\n${circleId}\n${subjectDid}`)
        .digest("base64url")
        .slice(0, 32);
    return `urn:vibeid:credential:circle-membership:${digest}`;
}

function createSignedCircleMembershipCredentialEnvelope(input: {
    circle: Circle;
    member: Member;
    subjectVibeDid: string;
}): VibeCredentialEnvelope | null {
    const keyMaterial = getIssuerKeyMaterial();
    if (!keyMaterial || !input.circle._id) {
        return null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const circleId = String(input.circle._id);
    const statusUrl = new URL("/api/vibe-id/credentials/circle-membership/status", getSiteOrigin());
    statusUrl.searchParams.set("circleId", circleId);
    statusUrl.searchParams.set("subjectDid", input.subjectVibeDid);

    const credential: VibeUnsignedCredential = {
        id: createMembershipCredentialId(circleId, input.subjectVibeDid),
        type: CREDENTIAL_TYPE,
        issuer: keyMaterial.issuer,
        issuerKeyId: keyMaterial.issuerKeyId,
        subjectDid: input.subjectVibeDid,
        claims: {
            circleId,
            circleHandle: input.circle.handle || null,
            circleName: input.circle.name || "Circle",
            roles: input.member.userGroups ?? ["members"],
            joinedAt: input.member.joinedAt ? input.member.joinedAt.toISOString() : null,
            membership: "member",
        },
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        statusUrl: statusUrl.toString(),
    };

    return {
        kind: CREDENTIAL_KIND,
        credential: signCredential(credential, keyMaterial.privateKey),
    };
}

function signCredential(credential: VibeUnsignedCredential, privateKey: KeyObject): VibeSignedCredential {
    const credentialWithAlg: VibeUnsignedCredential & { alg: typeof CREDENTIAL_ALGORITHM } = {
        ...credential,
        alg: CREDENTIAL_ALGORITHM,
    };
    const signer = crypto.createSign("SHA256");
    signer.update(canonicalJson(credentialWithAlg));
    signer.end();

    return {
        ...credentialWithAlg,
        signature: signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url"),
    };
}

function verifyCredentialSignature(credential: VibeSignedCredential, privateKey: KeyObject): boolean {
    try {
        const verifier = crypto.createVerify("SHA256");
        verifier.update(createCredentialSigningPayload(credential));
        verifier.end();
        return verifier.verify(
            {
                key: crypto.createPublicKey(privateKey),
                dsaEncoding: "ieee-p1363",
            },
            Buffer.from(credential.signature, "base64url"),
        );
    } catch {
        return false;
    }
}

function createCredentialSigningPayload(credential: VibeSignedCredential): string {
    const { signature: _signature, ...unsigned } = credential;
    return canonicalJson(unsigned);
}

function parseCredentialEnvelope(value: unknown): VibeCredentialEnvelope | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const envelope = value as Partial<VibeCredentialEnvelope>;
    if (envelope.kind !== CREDENTIAL_KIND || !envelope.credential || typeof envelope.credential !== "object") {
        return null;
    }

    const credential = envelope.credential as Partial<VibeSignedCredential>;
    if (
        typeof credential.id !== "string" ||
        typeof credential.type !== "string" ||
        typeof credential.issuer !== "string" ||
        typeof credential.issuerKeyId !== "string" ||
        typeof credential.subjectDid !== "string" ||
        typeof credential.issuedAt !== "string" ||
        typeof credential.alg !== "string" ||
        typeof credential.signature !== "string" ||
        credential.alg !== CREDENTIAL_ALGORITHM ||
        !credential.claims ||
        typeof credential.claims !== "object" ||
        Array.isArray(credential.claims)
    ) {
        return null;
    }

    return {
        kind: CREDENTIAL_KIND,
        credential: {
            id: credential.id,
            type: credential.type,
            issuer: credential.issuer,
            issuerKeyId: credential.issuerKeyId,
            subjectDid: credential.subjectDid,
            claims: credential.claims as JsonRecord,
            issuedAt: credential.issuedAt,
            expiresAt: typeof credential.expiresAt === "string" || credential.expiresAt === null ? credential.expiresAt : undefined,
            statusUrl: typeof credential.statusUrl === "string" || credential.statusUrl === null ? credential.statusUrl : undefined,
            alg: CREDENTIAL_ALGORITHM,
            signature: credential.signature,
        },
    };
}

function createCredentialDeepLink(envelope: VibeCredentialEnvelope): string {
    const url = new URL("vibe-id://credential");
    url.searchParams.set("c", Buffer.from(canonicalJson(envelope), "utf8").toString("base64url"));
    return url.toString();
}

function createCredentialClaimDeepLink(credentialUrl: string): string {
    const url = new URL("vibe-id://credential");
    url.searchParams.set("u", credentialUrl);
    return url.toString();
}


function parseJsonWebKey(value: string): JsonWebKey {
    const trimmed = value.trim();
    if (trimmed.startsWith("{")) {
        return JSON.parse(trimmed) as JsonWebKey;
    }

    return JSON.parse(Buffer.from(trimmed, "base64url").toString("utf8")) as JsonWebKey;
}

function canonicalJson(value: unknown): string {
    return JSON.stringify(sortForCanonicalJson(value));
}

function sortForCanonicalJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortForCanonicalJson);
    }
    if (value && typeof value === "object") {
        return Object.keys(value as JsonRecord)
            .sort()
            .reduce<JsonRecord>((accumulator, key) => {
                const nextValue = (value as JsonRecord)[key];
                if (nextValue !== undefined) {
                    accumulator[key] = sortForCanonicalJson(nextValue);
                }
                return accumulator;
            }, {});
    }
    return value;
}
