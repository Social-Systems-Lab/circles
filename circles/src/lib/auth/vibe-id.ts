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
import { generateSecureToken, hashToken, sendEmail } from "@/lib/data/email";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { getResolvedWelcomeTemplate } from "@/lib/data/system-message-templates";
import { createNewUser, getUserPrivate } from "@/lib/data/user";
import { createUserSession, getAuthenticatedUserDid, PUBLIC_KEY_FILENAME, USERS_DIR } from "@/lib/auth/auth";
import type { Circle } from "@/models/models";

const REQUEST_TTL_MS = 5 * 60 * 1000;
const COMPLETED_TTL_MS = 10 * 60 * 1000;
type VibeIdProfile = VibeProfile;

type VibeIdRequestDoc = {
    _id?: ObjectId;
    requestId: string;
    intent: "signin" | "link";
    challenge: string;
    origin: string;
    status: "pending" | "approved" | "needs_signup" | "linked" | "rejected" | "failed" | "expired";
    expiresAt: Date;
    createdAt: Date;
    completedAt?: Date;
    vibeDid?: string;
    userDid?: string;
    linkUserDid?: string;
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

function normalizeEmail(value: unknown): string {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateLocalDidAndPublicKey(): { did: string; publicKeyPem: string } {
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" }) as string;
    const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
    return { did, publicKeyPem };
}

function makeHandleSeed(profile: VibeIdProfile | undefined, vibeDid: string): string {
    const displayName = profile?.displayName || "vibe";
    return (
        displayName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 14) || `vibe-${crypto.createHash("sha256").update(vibeDid).digest("hex").slice(0, 8)}`
    );
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

async function createVibeIdUser(params: {
    vibeDid: string;
    profile?: VibeIdProfile;
    name: string;
    email: string;
    handle?: string;
    skills?: string[];
    interests?: string[];
    metadata?: Record<string, unknown>;
}): Promise<Circle> {
    const { vibeDid, profile, name, email, skills, interests, metadata } = params;
    const { did, publicKeyPem } = generateLocalDidAndPublicKey();
    const handle = params.handle ?? (await getAvailableHandle(profile, vibeDid));
    const verificationToken = generateSecureToken();
    const user = createNewUser(
        did,
        publicKeyPem,
        name,
        handle,
        "user",
        email,
        false,
        hashToken(verificationToken),
        new Date(Date.now() + 24 * 3600 * 1000),
    );
    user.verificationStatus = "unverified";
    user.accountStatus = "pending_verification";
    if (skills?.length) {
        user.skills = skills;
        user.offers = {
            ...(user.offers ?? {}),
            skills,
            visibility: user.offers?.visibility ?? "public",
        };
    }
    if (interests?.length) {
        user.interests = interests;
    }
    user.metadata = {
        ...(user.metadata ?? {}),
        ...(metadata ?? {}),
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

    const verificationLink = `${process.env.CIRCLES_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/verify-email?token=${verificationToken}`;
    try {
        await sendEmail({
            to: email,
            templateAlias: "email-verification",
            templateModel: {
                name,
                actionUrl: verificationLink,
            },
        });
    } catch (error) {
        console.error(`Failed to send VibeID signup verification email to ${email}:`, error);
    }

    try {
        const resolvedWelcome = await getResolvedWelcomeTemplate();
        await ensureWelcomeMessageForNewUser(did, resolvedWelcome.config, resolvedWelcome.senderDid);
    } catch (error) {
        console.error("Failed to create VibeID signup welcome message:", error);
    }

    return user;
}

async function findUserForVibeId(vibeDid: string): Promise<Circle | null> {
    const existingUser = await Circles.findOne({
        "metadata.authProviders.vibeId.did": vibeDid,
        circleType: "user",
    });
    return existingUser ? ({ ...existingUser, _id: existingUser._id?.toString() } as Circle) : null;
}

async function refreshVibeIdProfileForUser(user: Circle, profile?: VibeIdProfile): Promise<Circle> {
    if (user._id) {
        await Circles.updateOne(
            { _id: new ObjectId(user._id) },
            {
                $set: {
                    "metadata.authProviders.vibeId.profile": profile,
                    "metadata.authProviders.vibeId.lastSignedInAt": new Date(),
                },
            },
        );
    }

    return user;
}

export async function createVibeIdRequest(request: NextRequest): Promise<NextResponse> {
    const body = await request.json().catch(() => ({}));
    const intent = body?.intent === "link" ? "link" : "signin";
    const linkUserDid = intent === "link" ? await getAuthenticatedUserDid() : undefined;

    if (intent === "link" && !linkUserDid) {
        return NextResponse.json(
            { success: false, message: "You need to be logged in to connect VibeID." },
            { status: 401 },
        );
    }

    const origin = normalizeSiteOrigin(request);
    const requestId = crypto.randomBytes(16).toString("base64url");
    const issuedAt = Date.now();
    const challenge = createSignInChallenge({ requestId, origin, ttlMs: REQUEST_TTL_MS, nowMs: issuedAt });
    const callbackUrl = new URL("/api/vibe-id/callback", origin).toString();
    const statusUrl = `/api/vibe-id/status/${encodeURIComponent(requestId)}`;

    await getRequestsCollection().insertOne({
        requestId,
        intent,
        linkUserDid,
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
        intent,
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
    const existingUser = await findUserForVibeId(verification.verified.did);

    if (storedRequest.intent === "link") {
        if (!storedRequest.linkUserDid) {
            await collection.updateOne(
                { requestId },
                { $set: { status: "failed", completedAt: new Date(), error: "missing_link_user" } },
            );
            return NextResponse.json(
                { success: false, message: "The linking request is missing a user." },
                { status: 400 },
            );
        }

        if (existingUser && existingUser.did !== storedRequest.linkUserDid) {
            await collection.updateOne(
                { requestId },
                {
                    $set: {
                        status: "failed",
                        completedAt: new Date(),
                        error: "vibeid_already_linked",
                        message: "This VibeID is already connected to another Kamooni account.",
                    },
                },
            );
            return NextResponse.json(
                { success: false, message: "This VibeID is already connected to another Kamooni account." },
                { status: 409 },
            );
        }

        const userToLink = await getUserPrivate(storedRequest.linkUserDid);
        await Circles.updateOne(
            { did: storedRequest.linkUserDid, circleType: "user" },
            {
                $set: {
                    "metadata.authProviders.vibeId": {
                        did: verification.verified.did,
                        profile,
                        linkedAt: userToLink.metadata?.authProviders?.vibeId?.linkedAt ?? new Date(),
                        lastSignedInAt: new Date(),
                    },
                },
            },
        );

        await collection.updateOne(
            { requestId },
            {
                $set: {
                    status: "linked",
                    completedAt: new Date(),
                    vibeDid: verification.verified.did,
                    userDid: storedRequest.linkUserDid,
                    profile,
                },
            },
        );

        return NextResponse.json({ success: true });
    }

    if (!existingUser) {
        await collection.updateOne(
            { requestId },
            {
                $set: {
                    status: "needs_signup",
                    completedAt: new Date(),
                    vibeDid: verification.verified.did,
                    profile,
                },
            },
        );

        return NextResponse.json({ success: true });
    }

    const user = await refreshVibeIdProfileForUser(existingUser, profile);

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

    if (storedRequest.status === "needs_signup") {
        return NextResponse.json({
            status: "needs_signup",
            profile: storedRequest.profile,
        });
    }

    if (storedRequest.status === "linked") {
        return NextResponse.json({
            status: "linked",
            message: "VibeID connected.",
        });
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
    await collection.updateOne({ requestId }, { $set: { completedAt: new Date(Date.now() - COMPLETED_TTL_MS) } });

    return NextResponse.json({
        status: "approved",
        user: privateUser,
    });
}

export async function completeVibeIdSignup(request: NextRequest): Promise<NextResponse> {
    const body = await request.json().catch(() => ({}));
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const name = normalizeDisplayText(body?.name, "", 80);
    const email = normalizeEmail(body?.email);
    const handle =
        typeof body?.handle === "string"
            ? body.handle.trim().toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")
            : "";
    const skills = Array.isArray(body?.skills)
        ? body.skills.filter((skill: unknown): skill is string => typeof skill === "string" && skill.trim().length > 0)
        : undefined;
    const interests = Array.isArray(body?.interests)
        ? body.interests.filter(
              (interest: unknown): interest is string => typeof interest === "string" && interest.trim().length > 0,
          )
        : undefined;
    const metadata =
        body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined;

    if (!requestId || !name || !email) {
        return NextResponse.json({ success: false, message: "Name and email are required." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
        return NextResponse.json({ success: false, message: "Enter a valid email address." }, { status: 400 });
    }

    if (handle) {
        if (handle.length < 3) {
            return NextResponse.json(
                { success: false, message: "Handle must be at least 3 characters." },
                { status: 400 },
            );
        }

        if (handle.length > 20) {
            return NextResponse.json(
                { success: false, message: "Handle can't be more than 20 characters." },
                { status: 400 },
            );
        }

        if (!/^[a-z0-9-]+$/.test(handle)) {
            return NextResponse.json(
                { success: false, message: "Use lowercase letters, numbers, and hyphens only." },
                { status: 400 },
            );
        }
    }

    const collection = getRequestsCollection();
    const storedRequest = await collection.findOne({ requestId });

    if (!storedRequest || storedRequest.status !== "needs_signup" || !storedRequest.vibeDid) {
        return NextResponse.json(
            { success: false, message: "This VibeID signup request is not ready." },
            { status: 400 },
        );
    }

    const existingVibeUser = await findUserForVibeId(storedRequest.vibeDid);
    if (existingVibeUser) {
        return NextResponse.json(
            { success: false, message: "This VibeID is already connected to a Kamooni account." },
            { status: 409 },
        );
    }

    const existingEmailUser = await Circles.findOne({ email }, { collation: { locale: "en", strength: 2 } });
    if (existingEmailUser) {
        return NextResponse.json(
            {
                success: false,
                message: "This email is already used. Log in with that account and connect VibeID in settings.",
            },
            { status: 409 },
        );
    }

    if (handle) {
        const existingHandleUser = await Circles.findOne({ handle });
        if (existingHandleUser) {
            return NextResponse.json({ success: false, message: "That handle is already taken." }, { status: 409 });
        }
    }

    const user = await createVibeIdUser({
        vibeDid: storedRequest.vibeDid,
        profile: storedRequest.profile,
        name,
        email,
        handle: handle || undefined,
        skills,
        interests,
        metadata,
    });

    await collection.updateOne(
        { requestId },
        {
            $set: {
                status: "approved",
                userDid: user.did,
                completedAt: new Date(),
            },
        },
    );

    const privateUser = await getUserPrivate(user.did!);
    await createUserSession(privateUser, user.did!);

    return NextResponse.json({
        success: true,
        status: "approved",
        user: privateUser,
    });
}
