import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ObjectId } from "mongodb";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole, useFakeNow, useSpyCleanup } from "@/test/hooks";
import { mockDb, namedCollection } from "@/test/mock-db";
import { createJsonRequest } from "@/test/next-request";

const restoreEnv = snapshotEnv("NEXT_PUBLIC_SITE_URL", "CIRCLES_URL");
const usersDir = fs.mkdtempSync(path.join(os.tmpdir(), "circles-vibe-id-test-"));
const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const MINUTE = 60 * 1000;

// --- module mocks -----------------------------------------------------------------------------

const db = mockDb();

const createSignInChallenge = mock((options: { requestId: string; origin: string; ttlMs: number; nowMs: number }) => ({
    payload: `challenge-for-${options.requestId}`,
    expiresAt: options.nowMs + options.ttlMs,
}));
const createSignInDeepLink = mock(
    (options: { payload: string; callbackUrl: string; requestId: string }) => `vibeid://signin?r=${options.requestId}`,
);
const parseCallbackPayload = mock((raw: unknown) => (raw ?? {}) as Record<string, unknown>);
const verifySignInCallback = mock(
    (_options: unknown): { ok: true; verified: { did: string; profile?: unknown } } | { ok: false; error: string; message: string } => ({
        ok: true,
        verified: { did: "did:vibe:1", profile: { displayName: "Vee" } },
    }),
);
mock.module("@vibe-id/core", () => ({
    createSignInChallenge,
    createSignInDeepLink,
    parseCallbackPayload,
    verifySignInCallback,
}));

const addMember = mock(async (..._args: unknown[]) => {});
mock.module("@/lib/data/member", () => ({ addMember }));

const sendEmail = mock(async (_message: unknown) => {});
mock.module("@/lib/data/email", () => ({
    generateSecureToken: () => "plain-token",
    hashToken: (token: string) => `hashed:${token}`,
    sendEmail,
}));

const ensureWelcomeMessageForNewUser = mock(async (..._args: unknown[]) => {});
mock.module("@/lib/data/mongo-chat", () => ({ ensureWelcomeMessageForNewUser }));

const getResolvedWelcomeTemplate = mock(async () => ({ config: { threadName: "Welcome" }, senderDid: "system:kamooni" }));
mock.module("@/lib/data/system-message-templates", () => ({ getResolvedWelcomeTemplate }));

const createNewUser = mock(
    (did: string, publicKey: string, name: string, handle: string, type: string, email: string, verified: boolean, token: string, expiry: Date) => ({
        did,
        publicKey,
        name,
        handle,
        type,
        email,
        isEmailVerified: verified,
        emailVerificationToken: token,
        emailVerificationTokenExpiry: expiry,
        circleType: "user",
    }),
);
const getUserPrivate = mock(async (did: string): Promise<Record<string, unknown>> => ({ did }));
mock.module("@/lib/data/user", () => ({ createNewUser, getUserPrivate }));

const createUserSession = mock(async (..._args: unknown[]) => "session-token");
const getAuthenticatedUserDid = mock(async (): Promise<string | undefined> => undefined);
mock.module("@/lib/auth/auth", () => ({
    createUserSession,
    getAuthenticatedUserDid,
    PUBLIC_KEY_FILENAME: "publicKey.pem",
    USERS_DIR: usersDir,
}));

const {
    completeVibeIdSignup,
    createVibeIdRequest,
    handleVibeIdCallback,
    readVibeIdStatus,
} = await import("./vibe-id");

// --- helpers ----------------------------------------------------------------------------------

const requests = () => namedCollection(db, "vibeIdSignInRequests");
const storedRequest = (requestId: string) => requests().docs.find((doc) => doc.requestId === requestId)!;
const storedUser = (did: string) => db.Circles.docs.find((doc) => doc.did === did)!;

const seedRequest = (overrides: Record<string, unknown> = {}) => {
    requests().docs.push({
        _id: new ObjectId(),
        requestId: "req-1",
        intent: "signin",
        challenge: "challenge-req-1",
        origin: "http://localhost:3000",
        status: "pending",
        expiresAt: new Date(NOW.getTime() + 5 * MINUTE),
        createdAt: NOW,
        ...overrides,
    });
    return "req-1";
};

const seedVibeUser = (overrides: Record<string, unknown> = {}) => {
    const _id = new ObjectId();
    db.Circles.docs.push({
        _id,
        did: "did:kamooni:1",
        circleType: "user",
        metadata: { authProviders: { vibeId: { did: "did:vibe:1", linkedAt: new Date("2026-01-01T00:00:00.000Z") } } },
        ...overrides,
    });
    return _id;
};

const consoleSpy = silenceConsole("error");
const trackSpy = useSpyCleanup();

beforeEach(() => {
    setEnv("NEXT_PUBLIC_SITE_URL", undefined);
    setEnv("CIRCLES_URL", undefined);
    db.Circles.docs = [];
    requests().docs = [];
    requests().aggregations = [];
    for (const fn of [
        createSignInChallenge,
        createSignInDeepLink,
        parseCallbackPayload,
        verifySignInCallback,
        addMember,
        sendEmail,
        ensureWelcomeMessageForNewUser,
        getResolvedWelcomeTemplate,
        createNewUser,
        getUserPrivate,
        createUserSession,
        getAuthenticatedUserDid,
    ]) {
        fn.mockClear();
    }
    getAuthenticatedUserDid.mockResolvedValue(undefined);
    getUserPrivate.mockImplementation(async (did: string) => ({ did }));
    verifySignInCallback.mockReturnValue({ ok: true, verified: { did: "did:vibe:1", profile: { displayName: "Vee" } } });
    sendEmail.mockResolvedValue(undefined);
    ensureWelcomeMessageForNewUser.mockResolvedValue(undefined);
    getResolvedWelcomeTemplate.mockResolvedValue({ config: { threadName: "Welcome" }, senderDid: "system:kamooni" });
});

afterAll(() => {
    fs.rmSync(usersDir, { recursive: true, force: true });
    restoreEnv();
});

// --- createVibeIdRequest ----------------------------------------------------------------------

describe("createVibeIdRequest", () => {
    test("creates a pending sign-in request and returns what the client needs to start it", async () => {
        const response = await createVibeIdRequest(createJsonRequest({}));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.requestId).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(body).toEqual({
            requestId: body.requestId,
            deepLinkUrl: `vibeid://signin?r=${body.requestId}`,
            statusUrl: `/api/vibe-id/status/${body.requestId}`,
            expiresAt: NOW.getTime() + 5 * MINUTE,
            intent: "signin",
        });
    });

    test("stores the request with the challenge and a five minute expiry", async () => {
        const { requestId } = await (await createVibeIdRequest(createJsonRequest({}))).json();

        expect(storedRequest(requestId)).toMatchObject({
            requestId,
            intent: "signin",
            challenge: `challenge-for-${requestId}`,
            origin: "http://localhost:3000",
            status: "pending",
            expiresAt: new Date(NOW.getTime() + 5 * MINUTE),
            createdAt: NOW,
        });
        expect(storedRequest(requestId).linkUserDid).toBeUndefined();
    });

    test("asks the library for a challenge bound to the request and origin", async () => {
        const { requestId } = await (await createVibeIdRequest(createJsonRequest({}))).json();

        expect(createSignInChallenge).toHaveBeenCalledWith({
            requestId,
            origin: "http://localhost:3000",
            ttlMs: 5 * MINUTE,
            nowMs: NOW.getTime(),
        });
        expect(createSignInDeepLink).toHaveBeenCalledWith({
            payload: `challenge-for-${requestId}`,
            callbackUrl: "http://localhost:3000/api/vibe-id/callback",
            requestId,
        });
    });

    test("generates a different request id every time", async () => {
        const first = await (await createVibeIdRequest(createJsonRequest({}))).json();
        const second = await (await createVibeIdRequest(createJsonRequest({}))).json();

        expect(first.requestId).not.toBe(second.requestId);
    });

    test("url-encodes the request id in the status url", async () => {
        const { requestId, statusUrl } = await (await createVibeIdRequest(createJsonRequest({}))).json();

        expect(statusUrl).toBe(`/api/vibe-id/status/${encodeURIComponent(requestId)}`);
    });

    test.each([
        ["an unparseable body", "not json"],
        ["an empty body", ""],
        ["an unknown intent", { intent: "delete-everything" }],
        ["a non-string intent", { intent: 7 }],
    ])("defaults to signin for %s", async (_label, body) => {
        const { intent, requestId } = await (await createVibeIdRequest(createJsonRequest(body))).json();

        expect(intent).toBe("signin");
        expect(storedRequest(requestId).intent).toBe("signin");
        expect(getAuthenticatedUserDid).not.toHaveBeenCalled();
    });

    describe("linking", () => {
        test("requires a signed-in user", async () => {
            const response = await createVibeIdRequest(createJsonRequest({ intent: "link" }));

            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ success: false, message: "You need to be logged in to connect VibeID." });
            expect(requests().docs).toHaveLength(0);
        });

        test("records which user is linking", async () => {
            getAuthenticatedUserDid.mockResolvedValue("did:kamooni:1");

            const { requestId, intent } = await (await createVibeIdRequest(createJsonRequest({ intent: "link" }))).json();

            expect(intent).toBe("link");
            expect(storedRequest(requestId)).toMatchObject({ intent: "link", linkUserDid: "did:kamooni:1" });
        });

        test("ignores a link user smuggled into the body", async () => {
            const { requestId } = await (
                await createVibeIdRequest(createJsonRequest({ intent: "signin", linkUserDid: "did:victim" }))
            ).json();

            expect(storedRequest(requestId).linkUserDid).toBeUndefined();
        });
    });

    describe("origin", () => {
        const originOf = async () => (await createVibeIdRequest(createJsonRequest({}, { path: "http://request-host:4000/api" }))).json();

        test("falls back to the origin of the incoming request", async () => {
            const { requestId } = await originOf();

            expect(storedRequest(requestId).origin).toBe("http://request-host:4000");
        });

        test("prefers CIRCLES_URL over the request origin", async () => {
            setEnv("CIRCLES_URL", "https://circles.example");
            const { requestId } = await originOf();

            expect(storedRequest(requestId).origin).toBe("https://circles.example");
        });

        test("prefers NEXT_PUBLIC_SITE_URL over everything else", async () => {
            setEnv("CIRCLES_URL", "https://circles.example");
            setEnv("NEXT_PUBLIC_SITE_URL", "https://kamooni.example");
            const { requestId } = await originOf();

            expect(storedRequest(requestId).origin).toBe("https://kamooni.example");
        });

        test("strips any path from the configured site url", async () => {
            setEnv("NEXT_PUBLIC_SITE_URL", "https://kamooni.example/some/path?x=1");
            const { requestId } = await originOf();

            expect(storedRequest(requestId).origin).toBe("https://kamooni.example");
        });

        test("derives the callback url from the configured origin", async () => {
            setEnv("NEXT_PUBLIC_SITE_URL", "https://kamooni.example/base");
            await originOf();

            expect(createSignInDeepLink.mock.calls[0][0].callbackUrl).toBe("https://kamooni.example/api/vibe-id/callback");
        });

        test("throws for a configured url that is not a valid url", async () => {
            setEnv("NEXT_PUBLIC_SITE_URL", "not a url");

            await expect(originOf()).rejects.toThrow();
        });
    });
});

// --- handleVibeIdCallback ---------------------------------------------------------------------

describe("handleVibeIdCallback", () => {
    const callback = (payload: Record<string, unknown> = { requestId: "req-1" }) => handleVibeIdCallback(createJsonRequest(payload));

    describe("request lookup", () => {
        test("rejects a callback without a request id", async () => {
            const response = await callback({});

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ success: false, message: "Missing request id" });
        });

        test("rejects an unreadable body as a missing request id", async () => {
            const response = await handleVibeIdCallback(createJsonRequest("not json"));

            expect(response.status).toBe(400);
            expect((await response.json()).message).toBe("Missing request id");
        });

        test("rejects an unknown request", async () => {
            const response = await callback({ requestId: "nope" });

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ success: false, message: "Unknown or completed request" });
        });

        test.each(["approved", "needs_signup", "linked", "rejected", "failed", "expired"])(
            "rejects a request that is already %s so a callback cannot be replayed",
            async (status) => {
                seedRequest({ status });

                const response = await callback();

                expect(response.status).toBe(400);
                expect((await response.json()).message).toBe("Unknown or completed request");
                expect(storedRequest("req-1").status).toBe(status);
                expect(verifySignInCallback).not.toHaveBeenCalled();
            },
        );

        test("expires a request whose time has run out", async () => {
            seedRequest({ expiresAt: new Date(NOW.getTime() - 1) });

            const response = await callback();

            expect(response.status).toBe(400);
            expect((await response.json()).message).toBe("Request expired");
            expect(storedRequest("req-1")).toMatchObject({ status: "expired", error: "expired", completedAt: NOW });
            expect(verifySignInCallback).not.toHaveBeenCalled();
        });

        test("treats the exact moment of expiry as expired", async () => {
            seedRequest({ expiresAt: NOW });

            expect((await callback()).status).toBe(400);
            expect(storedRequest("req-1").status).toBe("expired");
        });

        test("still accepts a request one millisecond before it expires", async () => {
            seedRequest({ expiresAt: new Date(NOW.getTime() + 1) });

            expect((await callback()).status).toBe(200);
        });
    });

    describe("errors reported by the wallet", () => {
        test("records a rejection by the user", async () => {
            seedRequest();

            const response = await callback({ requestId: "req-1", status: "error", error: "user_rejected", message: "No thanks" });

            expect(await response.json()).toEqual({ success: true });
            expect(storedRequest("req-1")).toMatchObject({
                status: "rejected",
                error: "user_rejected",
                message: "No thanks",
                completedAt: NOW,
            });
            expect(verifySignInCallback).not.toHaveBeenCalled();
        });

        test("records any other wallet error as a failure", async () => {
            seedRequest();

            await callback({ requestId: "req-1", status: "error", error: "wallet_locked" });

            expect(storedRequest("req-1")).toMatchObject({ status: "failed", error: "wallet_locked" });
        });

        test("uses a generic error code when the wallet gives none", async () => {
            seedRequest();

            await callback({ requestId: "req-1", status: "error" });

            expect(storedRequest("req-1")).toMatchObject({ status: "failed", error: "vibeid_error" });
        });
    });

    describe("verification", () => {
        test("fails the request when the callback does not verify", async () => {
            seedRequest();
            verifySignInCallback.mockReturnValue({ ok: false, error: "bad_signature", message: "Signature mismatch" });

            const response = await callback();

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ success: false, message: "Signature mismatch" });
            expect(storedRequest("req-1")).toMatchObject({ status: "failed", error: "bad_signature", message: "Signature mismatch" });
        });

        test("verifies the callback against the challenge that was stored for the request", async () => {
            seedRequest({ challenge: "stored-challenge" });

            await callback({ requestId: "req-1", proof: "abc" });

            expect(verifySignInCallback).toHaveBeenCalledWith({
                callbackPayload: { requestId: "req-1", proof: "abc" },
                challengePayload: "stored-challenge",
            });
        });
    });

    describe("sign-in", () => {
        test("asks a new VibeID to finish signing up", async () => {
            seedRequest();

            const response = await callback();

            expect(await response.json()).toEqual({ success: true });
            expect(storedRequest("req-1")).toMatchObject({
                status: "needs_signup",
                vibeDid: "did:vibe:1",
                profile: { displayName: "Vee" },
                completedAt: NOW,
            });
            expect(storedRequest("req-1").userDid).toBeUndefined();
        });

        test("approves a VibeID that is already linked to an account", async () => {
            seedRequest();
            seedVibeUser();

            const response = await callback();

            expect(await response.json()).toEqual({ success: true });
            expect(storedRequest("req-1")).toMatchObject({
                status: "approved",
                vibeDid: "did:vibe:1",
                userDid: "did:kamooni:1",
                profile: { displayName: "Vee" },
            });
        });

        test("refreshes the stored profile and last sign-in time of the linked account", async () => {
            seedRequest();
            const id = seedVibeUser();

            await callback();

            const user = db.Circles.byId(id)!;
            expect(user.metadata.authProviders.vibeId.profile).toEqual({ displayName: "Vee" });
            expect(user.metadata.authProviders.vibeId.lastSignedInAt).toEqual(NOW);
            expect(user.metadata.authProviders.vibeId.did).toBe("did:vibe:1");
        });

        test("does not sign in accounts that only look similar", async () => {
            seedRequest();
            db.Circles.docs.push({
                _id: new ObjectId(),
                did: "did:circle",
                circleType: "circle",
                metadata: { authProviders: { vibeId: { did: "did:vibe:1" } } },
            });
            seedVibeUser({ metadata: { authProviders: { vibeId: { did: "did:vibe:other" } } } });

            await callback();

            expect(storedRequest("req-1").status).toBe("needs_signup");
        });

        test("handles a verified callback without a profile", async () => {
            seedRequest();
            verifySignInCallback.mockReturnValue({ ok: true, verified: { did: "did:vibe:1" } });

            await callback();

            expect(storedRequest("req-1")).toMatchObject({ status: "needs_signup", vibeDid: "did:vibe:1" });
        });
    });

    describe("linking to an existing account", () => {
        const linking = () => seedRequest({ intent: "link", linkUserDid: "did:kamooni:2" });
        const seedLinker = (overrides: Record<string, unknown> = {}) =>
            db.Circles.docs.push({ _id: new ObjectId(), did: "did:kamooni:2", circleType: "user", ...overrides });

        test("connects the VibeID to the signed-in account", async () => {
            linking();
            seedLinker();

            const response = await callback();

            expect(await response.json()).toEqual({ success: true });
            expect(storedUser("did:kamooni:2").metadata.authProviders.vibeId).toEqual({
                did: "did:vibe:1",
                profile: { displayName: "Vee" },
                linkedAt: NOW,
                lastSignedInAt: NOW,
            });
            expect(storedRequest("req-1")).toMatchObject({
                status: "linked",
                vibeDid: "did:vibe:1",
                userDid: "did:kamooni:2",
                profile: { displayName: "Vee" },
            });
        });

        test("keeps the original link time when the account was already linked", async () => {
            linking();
            seedLinker();
            const linkedAt = new Date("2026-01-01T00:00:00.000Z");
            getUserPrivate.mockResolvedValue({ metadata: { authProviders: { vibeId: { linkedAt } } } });

            await callback();

            expect(storedUser("did:kamooni:2").metadata.authProviders.vibeId.linkedAt).toEqual(linkedAt);
            expect(storedUser("did:kamooni:2").metadata.authProviders.vibeId.lastSignedInAt).toEqual(NOW);
        });

        test("allows relinking a VibeID that already belongs to the same account", async () => {
            linking();
            seedVibeUser({ did: "did:kamooni:2" });

            const response = await callback();

            expect(response.status).toBe(200);
            expect(storedRequest("req-1").status).toBe("linked");
        });

        test("refuses a VibeID that is connected to a different account", async () => {
            linking();
            seedLinker();
            seedVibeUser({ did: "did:kamooni:1" });

            const response = await callback();

            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({
                success: false,
                message: "This VibeID is already connected to another Kamooni account.",
            });
            expect(storedRequest("req-1")).toMatchObject({ status: "failed", error: "vibeid_already_linked" });
            expect(storedUser("did:kamooni:2").metadata).toBeUndefined();
        });

        test("fails a linking request that has no user", async () => {
            seedRequest({ intent: "link", linkUserDid: undefined });

            const response = await callback();

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ success: false, message: "The linking request is missing a user." });
            expect(storedRequest("req-1")).toMatchObject({ status: "failed", error: "missing_link_user" });
        });

        test("only updates user profiles, never circles", async () => {
            linking();
            db.Circles.docs.push({ _id: new ObjectId(), did: "did:kamooni:2", circleType: "circle" });

            await callback();

            expect(db.Circles.docs[0].metadata).toBeUndefined();
        });
    });
});

// --- readVibeIdStatus -------------------------------------------------------------------------

describe("readVibeIdStatus", () => {
    const read = (requestId = "req-1") => readVibeIdStatus(createJsonRequest({}), requestId);

    test("reports an unknown request as not found", async () => {
        const response = await read("missing");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ status: "failed", message: "Sign-in request was not found" });
    });

    test("reports a pending request that is still valid", async () => {
        seedRequest();

        const response = await read();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "pending" });
    });

    test("expires a pending request that has timed out", async () => {
        seedRequest({ expiresAt: new Date(NOW.getTime() - 1) });

        const response = await read();

        expect(await response.json()).toEqual({ status: "expired", message: "Sign-in request expired" });
        expect(storedRequest("req-1")).toMatchObject({ status: "expired", error: "expired", completedAt: NOW });
    });

    test("does not rewrite requests that are no longer pending even when their time has passed", async () => {
        seedRequest({ status: "failed", error: "bad_signature", message: "nope", expiresAt: new Date(NOW.getTime() - 1) });

        expect(await (await read()).json()).toEqual({ status: "failed", error: "bad_signature", message: "nope" });
        expect(storedRequest("req-1").status).toBe("failed");
    });

    test("returns the profile of a VibeID that still needs to sign up", async () => {
        seedRequest({ status: "needs_signup", profile: { displayName: "Vee" }, vibeDid: "did:vibe:1" });

        expect(await (await read()).json()).toEqual({ status: "needs_signup", profile: { displayName: "Vee" } });
    });

    test("confirms a linked VibeID", async () => {
        seedRequest({ status: "linked", profile: { displayName: "Vee" }, vibeDid: "did:vibe:1" });

        expect(await (await read()).json()).toEqual({
            status: "linked",
            vibeDid: "did:vibe:1",
            profile: { displayName: "Vee" },
            message: "VibeID connected.",
        });
    });

    test.each(["rejected", "failed"])("passes on the message and error of a %s request", async (status) => {
        seedRequest({ status, message: "Because", error: "code" });

        expect(await (await read()).json()).toEqual({ status, message: "Because", error: "code" });
    });

    describe("approved requests", () => {
        test("signs the user in and returns their private profile", async () => {
            seedRequest({ status: "approved", userDid: "did:kamooni:1" });
            getUserPrivate.mockResolvedValue({ did: "did:kamooni:1", name: "Vee" });

            const response = await read();

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: "approved", user: { did: "did:kamooni:1", name: "Vee" } });
            expect(createUserSession).toHaveBeenCalledWith({ did: "did:kamooni:1", name: "Vee" }, "did:kamooni:1");
        });

        test("backdates the completion time so the request is treated as long finished", async () => {
            seedRequest({ status: "approved", userDid: "did:kamooni:1" });

            await read();

            expect(storedRequest("req-1").completedAt).toEqual(new Date(NOW.getTime() - 10 * MINUTE));
        });

        test("fails with a server error when the approval has no user", async () => {
            seedRequest({ status: "approved", userDid: undefined });

            const response = await read();

            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ status: "failed", message: "Sign-in request is missing a user" });
            expect(createUserSession).not.toHaveBeenCalled();
        });
    });
});

// --- completeVibeIdSignup ---------------------------------------------------------------------

describe("completeVibeIdSignup", () => {
    const signup = (body: Record<string, unknown> = {}) =>
        completeVibeIdSignup(createJsonRequest({ requestId: "req-1", name: "Vee Example", email: "vee@example.com", ...body }));
    const ready = (overrides: Record<string, unknown> = {}) =>
        seedRequest({ status: "needs_signup", vibeDid: "did:vibe:1", profile: { displayName: "Vee" }, ...overrides });

    const rejection = async (body: Record<string, unknown>, status: number, message: string) => {
        const response = await signup(body);
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ success: false, message });
        expect(db.Circles.docs.filter((doc) => doc.circleType === "user" && doc.did !== "did:existing")).toHaveLength(0);
    };

    describe("input validation", () => {
        test.each([
            ["request id", { requestId: "" }],
            ["missing request id", { requestId: undefined }],
            ["non-string request id", { requestId: 5 }],
            ["name", { name: "" }],
            ["blank name", { name: "   " }],
            ["non-string name", { name: 42 }],
            ["email", { email: "" }],
            ["non-string email", { email: 42 }],
        ])("requires a %s", async (_label, body) => {
            ready();

            await rejection(body, 400, "Name and email are required.");
        });

        test.each(["plainaddress", "no-at.example.com", "a@b", "a b@example.com", "a@b c.com", "@example.com"])(
            "rejects the invalid email %p",
            async (email) => {
                ready();

                await rejection({ email }, 400, "Enter a valid email address.");
            },
        );

        test.each([
            ["ab", "Handle must be at least 3 characters."],
            ["a".repeat(21), "Handle can't be more than 20 characters."],
            ["bad!chars", "Use lowercase letters, numbers, and hyphens only."],
            ["emoji😀", "Use lowercase letters, numbers, and hyphens only."],
        ])("rejects the handle %p", async (handle, message) => {
            ready();

            await rejection({ handle }, 400, message);
        });

        test("does not touch the database when validation fails", async () => {
            ready();

            await signup({ email: "invalid" });

            expect(createNewUser).not.toHaveBeenCalled();
            expect(createUserSession).not.toHaveBeenCalled();
        });

        test("treats an unreadable body as missing fields", async () => {
            const response = await completeVibeIdSignup(createJsonRequest("not json"));

            expect(response.status).toBe(400);
            expect((await response.json()).message).toBe("Name and email are required.");
        });
    });

    describe("request state", () => {
        test("rejects an unknown request", async () => {
            await rejection({}, 400, "This VibeID signup request is not ready.");
        });

        test.each(["pending", "approved", "linked", "rejected", "failed", "expired"])(
            "rejects a request that is %s",
            async (status) => {
                ready({ status });

                await rejection({}, 400, "This VibeID signup request is not ready.");
            },
        );

        test("rejects a needs_signup request that lost its VibeID", async () => {
            ready({ vibeDid: undefined });

            await rejection({}, 400, "This VibeID signup request is not ready.");
        });
    });

    describe("conflicts", () => {
        test("rejects a VibeID that already has an account", async () => {
            ready();
            seedVibeUser({ did: "did:existing" });

            await rejection({}, 409, "This VibeID is already connected to a Kamooni account.");
        });

        test("rejects an email that is already in use and points to linking instead", async () => {
            ready();
            db.Circles.docs.push({ _id: new ObjectId(), did: "did:existing", circleType: "user", email: "vee@example.com" });

            await rejection(
                {},
                409,
                "This email is already used. Log in with that account and connect VibeID in settings.",
            );
        });

        test("normalizes the email before checking it, and compares case-insensitively", async () => {
            ready();
            db.Circles.docs.push({ _id: new ObjectId(), did: "did:existing", circleType: "user", email: "vee@example.com" });
            const findOne = spyOn(db.Circles, "findOne");
            trackSpy(findOne);

            await signup({ email: "  VEE@Example.COM " });

            expect(findOne).toHaveBeenCalledWith(
                { email: "vee@example.com" },
                { collation: { locale: "en", strength: 2 } },
            );
        });

        test("rejects a handle that is already taken", async () => {
            ready();
            db.Circles.docs.push({ _id: new ObjectId(), did: "did:existing", circleType: "user", handle: "taken-handle" });

            await rejection({ handle: "taken-handle" }, 409, "That handle is already taken.");
        });

        test("normalizes the requested handle before checking it", async () => {
            ready();
            db.Circles.docs.push({ _id: new ObjectId(), did: "did:existing", circleType: "user", handle: "my-cool-handle" });

            await rejection({ handle: "  My_Cool Handle  " }, 409, "That handle is already taken.");
        });
    });

    describe("account creation", () => {
        test("creates the account, approves the request and signs the user in", async () => {
            ready();

            const response = await signup();
            const body = await response.json();

            expect(response.status).toBe(200);
            const user = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
            expect(body).toEqual({ success: true, status: "approved", user: { did: user.did } });
            expect(storedRequest("req-1")).toMatchObject({ status: "approved", userDid: user.did, completedAt: NOW });
            expect(createUserSession).toHaveBeenCalledWith({ did: user.did }, user.did);
        });

        test("creates an unverified pending user linked to the VibeID", async () => {
            ready();

            await signup();

            const user = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
            expect(user).toMatchObject({
                name: "Vee Example",
                type: "user",
                verificationStatus: "unverified",
                accountStatus: "pending_verification",
                emailVerificationToken: "hashed:plain-token",
            });
            expect(user.emailVerificationTokenExpiry).toEqual(new Date(NOW.getTime() + 24 * 3600 * 1000));
            expect(user.metadata.authProviders.vibeId).toEqual({
                did: "did:vibe:1",
                profile: { displayName: "Vee" },
                linkedAt: NOW,
            });
        });

        test("derives the did from the generated key and stores the public key on disk", async () => {
            ready();

            await signup();

            const user = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
            const stored = fs.readFileSync(path.join(usersDir, user.did, "publicKey.pem"), "utf8");
            expect(stored).toContain("BEGIN RSA PUBLIC KEY");
            expect(stored).toBe(user.publicKey);
            expect(user.did).toMatch(/^[0-9a-f]{64}$/);
        });

        test("makes the new user an admin, moderator and member of their own circle", async () => {
            ready();

            await signup();

            const user = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
            expect(addMember).toHaveBeenCalledWith(user.did, user._id.toString(), ["admins", "moderators", "members"], undefined);
        });

        test("emails a verification link with the plain token", async () => {
            ready();
            setEnv("CIRCLES_URL", "https://kamooni.example");

            await signup();

            expect(sendEmail).toHaveBeenCalledWith({
                to: "vee@example.com",
                templateAlias: "email-verification",
                templateModel: { name: "Vee Example", actionUrl: "https://kamooni.example/verify-email?token=plain-token" },
            });
            const user = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
            expect(user.emailVerificationLastSentAt).toEqual(NOW);
        });

        test("builds the verification link from NEXT_PUBLIC_SITE_URL, then localhost", async () => {
            ready();
            setEnv("NEXT_PUBLIC_SITE_URL", "https://site.example");
            await signup({ handle: "first-one" });
            expect(sendEmail.mock.calls[0][0]).toMatchObject({
                templateModel: { actionUrl: "https://site.example/verify-email?token=plain-token" },
            });

            requests().docs = [];
            ready({ vibeDid: "did:vibe:2" });
            setEnv("NEXT_PUBLIC_SITE_URL", undefined);
            await signup({ email: "second@example.com", handle: "second-one" });
            expect(sendEmail.mock.calls[1][0]).toMatchObject({
                templateModel: { actionUrl: "http://localhost:3000/verify-email?token=plain-token" },
            });
        });

        test("still signs the user up when the verification email cannot be sent", async () => {
            ready();
            sendEmail.mockRejectedValue(new Error("smtp down"));

            const response = await signup();

            expect(response.status).toBe(200);
            const user = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
            expect(user.emailVerificationLastSentAt).toBeUndefined();
            expect(consoleSpy.error).toHaveBeenCalledWith(
                "Failed to send VibeID signup verification email to vee@example.com:",
                expect.any(Error),
            );
        });

        test("sends the welcome message from the resolved template", async () => {
            ready();

            await signup();

            const user = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
            expect(ensureWelcomeMessageForNewUser).toHaveBeenCalledWith(user.did, { threadName: "Welcome" }, "system:kamooni");
        });

        test("still signs the user up when the welcome message cannot be created", async () => {
            ready();
            ensureWelcomeMessageForNewUser.mockRejectedValue(new Error("chat down"));

            const response = await signup();

            expect(response.status).toBe(200);
            expect(consoleSpy.error).toHaveBeenCalledWith("Failed to create VibeID signup welcome message:", expect.any(Error));
        });

        test("cleans up the display name and lowercases the email", async () => {
            ready();

            await signup({ name: "  Vee    \n Example  ", email: "  Vee@Example.COM " });

            expect(db.Circles.docs.find((doc) => doc.email === "vee@example.com")).toMatchObject({ name: "Vee Example" });
        });

        test("truncates an overly long display name to 80 characters", async () => {
            ready();

            await signup({ name: "x".repeat(200) });

            expect(db.Circles.docs.find((doc) => doc.email === "vee@example.com")!.name).toBe("x".repeat(80));
        });

        test("uses the normalized requested handle", async () => {
            ready();

            await signup({ handle: "  My_Cool Handle " });

            expect(db.Circles.docs.find((doc) => doc.email === "vee@example.com")!.handle).toBe("my-cool-handle");
        });

        describe("generated handles", () => {
            const handleFor = async (profile: unknown, vibeDid = "did:vibe:1") => {
                db.Circles.docs = [];
                requests().docs = [];
                ready({ profile, vibeDid });
                await signup();
                return db.Circles.docs.find((doc) => doc.email === "vee@example.com")!.handle as string;
            };

            test("combines a slug of the display name with a hash of the VibeID", async () => {
                const handle = await handleFor({ displayName: "Vee Example" });

                expect(handle).toMatch(/^vee-example-[0-9a-f]{6}$/);
            });

            test("is stable for the same VibeID and unique for different ones", async () => {
                const first = await handleFor({ displayName: "Vee" }, "did:vibe:1");
                const again = await handleFor({ displayName: "Vee" }, "did:vibe:1");
                const other = await handleFor({ displayName: "Vee" }, "did:vibe:2");

                expect(again).toBe(first);
                expect(other).not.toBe(first);
            });

            test("never exceeds 20 characters and is a valid handle", async () => {
                const handle = await handleFor({ displayName: "An Extremely Long Display Name Indeed" });

                expect(handle.length).toBeLessThanOrEqual(20);
                expect(handle).toMatch(/^[a-z0-9-]+$/);
            });

            test("falls back to a generic seed when the display name has no usable characters", async () => {
                expect(await handleFor({ displayName: "!!!" })).toMatch(/^vibe-[0-9a-f]{8}-[0-9a-f]{6}$/);
            });

            test("falls back to 'vibe' when there is no profile", async () => {
                expect(await handleFor(undefined)).toMatch(/^vibe-[0-9a-f]{6}$/);
            });

            test("adds a numeric suffix when the generated handle is taken", async () => {
                const first = await handleFor({ displayName: "Vee" });
                db.Circles.docs = [{ _id: new ObjectId(), did: "did:existing", circleType: "user", handle: first }];
                requests().docs = [];
                ready();

                await signup();

                const created = db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;
                expect(created.handle).toBe(`${first}-1`);
            });
        });

        describe("optional profile details", () => {
            const created = () => db.Circles.docs.find((doc) => doc.email === "vee@example.com")!;

            test("stores skills and interests as offers and interests", async () => {
                ready();

                await signup({ skills: ["gardening", "carpentry"], interests: ["music"] });

                expect(created().skills).toEqual(["gardening", "carpentry"]);
                expect(created().offers).toEqual({ skills: ["gardening", "carpentry"], visibility: "public" });
                expect(created().interests).toEqual(["music"]);
            });

            test("drops blank and non-string skills and interests", async () => {
                ready();

                await signup({ skills: ["ok", "", "  ", 5, null], interests: [{}, "fine", "   "] });

                expect(created().skills).toEqual(["ok"]);
                expect(created().interests).toEqual(["fine"]);
            });

            test("ignores skills and interests that are not arrays", async () => {
                ready();

                await signup({ skills: "gardening", interests: { a: 1 } });

                expect(created().skills).toBeUndefined();
                expect(created().offers).toBeUndefined();
                expect(created().interests).toBeUndefined();
            });

            test("ignores empty lists", async () => {
                ready();

                await signup({ skills: [], interests: [] });

                expect(created().skills).toBeUndefined();
                expect(created().interests).toBeUndefined();
            });

            test("merges caller metadata while keeping the VibeID link authoritative", async () => {
                ready();

                await signup({ metadata: { source: "app", authProviders: { vibeId: { did: "did:evil" } } } });

                expect(created().metadata.source).toBe("app");
                expect(created().metadata.authProviders.vibeId.did).toBe("did:vibe:1");
            });

            test.each([["a string", "x"], ["an array", [1]], ["null", null]])("ignores metadata that is %s", async (_label, metadata) => {
                ready();

                await signup({ metadata });

                expect(Object.keys(created().metadata)).toEqual(["authProviders"]);
            });
        });
    });
});
