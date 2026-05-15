import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
    createSignInChallenge,
    createSignInDeepLink,
    parseCallbackPayload,
    verifySignInCallback,
    type VibeCallbackPayload,
    type VibeProfile,
} from "@vibe-id/core";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { addMember } from "@/lib/data/member";
import { Circles, db } from "@/lib/data/db";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { getResolvedWelcomeTemplate } from "@/lib/data/system-message-templates";
import { createNewUser, getUserPrivate } from "@/lib/data/user";
import { createUserSession, PUBLIC_KEY_FILENAME, USERS_DIR } from "@/lib/auth/auth";
import type { Circle } from "@/models/models";

const REQUEST_TTL_MS = 5 * 60 * 1000;
const COMPLETED_TTL_MS = 10 * 60 * 1000;
type VibeIdProfile = VibeProfile;

type VibeIdRequestDoc = {
    _id?: ObjectId;
    requestId: string;
    challenge: string;
    origin: string;
    status: "pending" | "approved" | "rejected" | "failed" | "expired";
    expiresAt: Date;
    createdAt: Date;
    completedAt?: Date;
    vibeDid?: string;
    userDid?: string;
    profile?: VibeIdProfile;
    error?: string;
    message?: string;
};

const getRequestsCollection = () => db.collection<VibeIdRequestDoc>("vibeIdSignInRequests");

function normalizeSiteOrigin(request: NextRequest): string {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.CIRCLES_URL || request.nextUrl.origin;
    return new URL(siteUrl).origin;
}

function normalizeDisplayText(value: unknown, fallback: string, maxLength = 80): string {
    if (typeof value !== "string") {
        return fallback;
    }
    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized.slice(0, maxLength) || fallback;
}

function generateLocalDidAndPublicKey(): { did: string; publicKeyPem: string } {
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" }) as string;
    const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
    return { did, publicKeyPem };
}

function makeHandleSeed(profile: VibeIdProfile | undefined, vibeDid: string): string {
    const displayName = profile?.displayName || "vibe";
    return displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 14) || `vibe-${crypto.createHash("sha256").update(vibeDid).digest("hex").slice(0, 8)}`;
}

async function getAvailableHandle(profile: VibeIdProfile | undefined, vibeDid: string): Promise<string> {
    const hash = crypto.createHash("sha256").update(vibeDid).digest("hex").slice(0, 6);
    const seed = makeHandleSeed(profile, vibeDid).slice(0, 13);
    const base = `${seed}-${hash}`.slice(0, 20).replace(/-+$/g, "");

    for (let index = 0; index < 20; index += 1) {
        const suffix = index === 0 ? "" : `-${index}`;
        const candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
        const existing = await Circles.findOne({ handle: candidate });
        if (!existing) {
            return candidate;
        }
    }

    return `vibe-${crypto.randomBytes(7).toString("hex")}`.slice(0, 20);
}

async function createVibeIdUser(vibeDid: string, profile?: VibeIdProfile): Promise<Circle> {
    const { did, publicKeyPem } = generateLocalDidAndPublicKey();
    const handle = await getAvailableHandle(profile, vibeDid);
    const name = normalizeDisplayText(profile?.displayName, "VibeID user");
    const user = createNewUser(did, publicKeyPem, name, handle, "user", undefined, true);
    user.verificationStatus = "unverified";
    user.metadata = {
        ...(user.metadata ?? {}),
        authProviders: {
            vibeId: {
                did: vibeDid,
                profile,
                linkedAt: new Date(),
            },
        },
    };

    const accountPath = path.join(USERS_DIR, did);
    fs.mkdirSync(accountPath, { recursive: true });
    fs.writeFileSync(path.join(accountPath, PUBLIC_KEY_FILENAME), publicKeyPem);

    const result = await Circles.insertOne(user);
    user._id = result.insertedId.toString();
    await addMember(did, user._id, ["admins", "moderators", "members"], undefined);

    try {
        const resolvedWelcome = await getResolvedWelcomeTemplate();
        await ensureWelcomeMessageForNewUser(did, resolvedWelcome.config, resolvedWelcome.senderDid);
    } catch (error) {
        console.error("Failed to create VibeID signup welcome message:", error);
    }

    return user;
}

async function findOrCreateUserForVibeId(vibeDid: string, profile?: VibeIdProfile): Promise<Circle> {
    const existingUser = await Circles.findOne({
        "metadata.authProviders.vibeId.did": vibeDid,
        circleType: "user",
    });
    if (existingUser) {
        await Circles.updateOne(
            { _id: existingUser._id },
            {
                $set: {
                    "metadata.authProviders.vibeId.profile": profile,
                    "metadata.authProviders.vibeId.lastSignedInAt": new Date(),
                },
            },
        );
        return { ...existingUser, _id: existingUser._id?.toString() } as Circle;
    }

    return createVibeIdUser(vibeDid, profile);
}

export async function createVibeIdRequest(request: NextRequest): Promise<NextResponse> {
    const origin = normalizeSiteOrigin(request);
    const requestId = crypto.randomBytes(16).toString("base64url");
    const issuedAt = Date.now();
    const challenge = createSignInChallenge({ requestId, origin, ttlMs: REQUEST_TTL_MS, nowMs: issuedAt });
    const callbackUrl = new URL("/api/vibe-id/callback", origin).toString();
    const statusUrl = `/api/vibe-id/status/${encodeURIComponent(requestId)}`;

    await getRequestsCollection().insertOne({
        requestId,
        challenge: challenge.payload,
        origin,
        status: "pending",
        expiresAt: new Date(challenge.expiresAt),
        createdAt: new Date(issuedAt),
    });

    return NextResponse.json({
        requestId,
        deepLinkUrl: createSignInDeepLink({
            payload: challenge.payload,
            callbackUrl,
            requestId,
        }),
        statusUrl,
        expiresAt: challenge.expiresAt,
    });
}

export async function handleVibeIdCallback(request: NextRequest): Promise<NextResponse> {
    const rawPayload = await request.json().catch(() => null);
    const payload: VibeCallbackPayload = parseCallbackPayload(rawPayload);
    const requestId = payload.requestId ?? "";

    if (!requestId) {
        return NextResponse.json({ success: false, message: "Missing request id" }, { status: 400 });
    }

    const collection = getRequestsCollection();
    const storedRequest = await collection.findOne({ requestId });
    if (!storedRequest || storedRequest.status !== "pending") {
        return NextResponse.json({ success: false, message: "Unknown or completed request" }, { status: 400 });
    }

    if (storedRequest.expiresAt.getTime() <= Date.now()) {
        await collection.updateOne(
            { requestId },
            { $set: { status: "expired", completedAt: new Date(), error: "expired" } },
        );
        return NextResponse.json({ success: false, message: "Request expired" }, { status: 400 });
    }

    if (payload?.status === "error") {
        await collection.updateOne(
            { requestId },
            {
                $set: {
                    status: payload.error === "user_rejected" ? "rejected" : "failed",
                    completedAt: new Date(),
                    error: payload.error || "vibeid_error",
                    message: payload.message ?? undefined,
                },
            },
        );
        return NextResponse.json({ success: true });
    }

    const verification = verifySignInCallback({
        callbackPayload: payload,
        challengePayload: storedRequest.challenge,
    });
    if (!verification.ok) {
        await collection.updateOne(
            { requestId },
            {
                $set: {
                    status: "failed",
                    completedAt: new Date(),
                    error: verification.error,
                    message: verification.message,
                },
            },
        );
        return NextResponse.json({ success: false, message: verification.message }, { status: 400 });
    }

    const profile = verification.verified.profile ?? undefined;
    const user = await findOrCreateUserForVibeId(verification.verified.did, profile);

    await collection.updateOne(
        { requestId },
        {
            $set: {
                status: "approved",
                completedAt: new Date(),
                vibeDid: verification.verified.did,
                userDid: user.did,
                profile,
            },
        },
    );

    return NextResponse.json({ success: true });
}

export async function readVibeIdStatus(_request: NextRequest, requestId: string): Promise<NextResponse> {
    const collection = getRequestsCollection();
    const storedRequest = await collection.findOne({ requestId });

    if (!storedRequest) {
        return NextResponse.json({ status: "failed", message: "Sign-in request was not found" }, { status: 404 });
    }

    if (storedRequest.status === "pending" && storedRequest.expiresAt.getTime() <= Date.now()) {
        await collection.updateOne(
            { requestId },
            { $set: { status: "expired", completedAt: new Date(), error: "expired" } },
        );
        return NextResponse.json({ status: "expired", message: "Sign-in request expired" });
    }

    if (storedRequest.status !== "approved") {
        return NextResponse.json({
            status: storedRequest.status,
            message: storedRequest.message,
            error: storedRequest.error,
        });
    }

    if (!storedRequest.userDid) {
        return NextResponse.json({ status: "failed", message: "Sign-in request is missing a user" }, { status: 500 });
    }

    const privateUser = await getUserPrivate(storedRequest.userDid);
    await createUserSession(privateUser, storedRequest.userDid);
    await collection.updateOne(
        { requestId },
        { $set: { completedAt: new Date(Date.now() - COMPLETED_TTL_MS) } },
    );

    return NextResponse.json({
        status: "approved",
        user: privateUser,
    });
}
