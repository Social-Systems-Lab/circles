import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { afterAll, beforeEach, mock, test } from "bun:test";
import type { Circle, UserPrivate } from "@/models/models";

const profileMenuSource = readFileSync("src/components/layout/profile-menu.tsx", "utf8");
const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;
mutableEnv.NODE_ENV = "production";

assert.match(
    profileMenuSource,
    /router\.push\(redirectTo \? `\/login\?redirectTo=\$\{encodeURIComponent\(redirectTo\)\}` : "\/login"\)/,
    "ordinary profile-menu login does not manufacture a homepage return URL, while an explicit return URL is preserved",
);

const unfinishedState: NonNullable<Circle["onboardingState"]> = {
    version: 1,
    currentCard: "introduction",
    startedAt: new Date("2026-11-15T08:00:00Z"),
    lastSeenAt: new Date("2026-11-15T08:05:00Z"),
    skippedCards: [],
    completionAcknowledgedAt: null,
};

const state = {
    account: undefined as
        | (Partial<Circle> & {
              email: string;
              metadata?: Record<string, unknown>;
          })
        | undefined,
    privateUser: undefined as UserPrivate | undefined,
    authentications: 0,
    sessions: [] as string[],
    clearedLeases: [] as string[],
};

const lease = (suffix: string) => ({
    pairKey: `pair:${suffix}`,
    ipKey: "ip:synthetic",
    token: `lease-${suffix}`,
    priorPairFailures: 0,
});

class MockAuthenticationError extends Error {}
class MockLoginThrottledError extends Error {}
class MockLoginRateLimitStorageError extends Error {}

mock.module("@/lib/auth/auth", () => ({
    AuthenticationError: MockAuthenticationError,
    authenticateUser: () => {
        state.authentications += 1;
    },
    createUserSession: async (_user: UserPrivate, did: string) => {
        state.sessions.push(did);
    },
    USERS_DIR: "/tmp/kamooni-login-action-tests",
}));
mock.module("@/lib/data/db", () => ({
    Circles: {
        findOne: async () => state.account,
    },
}));
mock.module("@/lib/data/user", () => ({
    getUserPrivate: async () => state.privateUser,
}));
mock.module("next/headers", () => ({
    headers: async () => new Headers({ "x-real-ip": "203.0.113.10" }),
}));
mock.module("@/lib/auth/login-security", () => ({
    abandonLoginAttempt: async () => undefined,
    beginLoginAttempt: async () => lease("begin"),
    clearSuccessfulLogin: async (attempt: { token: string }) => {
        state.clearedLeases.push(attempt.token);
    },
    GENERIC_INVALID_CREDENTIALS: "Invalid email or password.",
    LOGIN_TEMPORARILY_UNAVAILABLE: "Login is temporarily unavailable. Please try again later.",
    LoginRateLimitStorageError: MockLoginRateLimitStorageError,
    LoginThrottledError: MockLoginThrottledError,
    normalizeLoginIdentifier: (value: string) => value.trim().toLowerCase(),
    recordFailedLogin: async () => undefined,
    trustedLoginClientIp: () => "203.0.113.10",
    verifyDummyLoginPassword: () => undefined,
}));

const { submitLoginFormAction } = await import("@/components/forms/login/actions");
const { resolveLoginFormDestination } = await import("@/components/forms/login/login-navigation");

afterAll(() => {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
});

function setAccount(
    onboardingFlow: string | undefined,
    onboardingState: Circle["onboardingState"],
    handle = "new-member",
): void {
    const metadata = onboardingFlow ? { onboardingFlow } : {};
    state.account = {
        _id: "synthetic-user-id",
        did: "synthetic-did",
        email: "member@example.test",
        handle,
        metadata,
    };
    state.privateUser = {
        _id: "synthetic-user-id",
        did: "synthetic-did",
        name: "Synthetic Member",
        email: "member@example.test",
        handle,
        circleType: "user",
        metadata,
        onboardingState,
        memberships: [],
        friends: [],
        pendingRequests: [],
        chatRoomMemberships: [],
        matrixAccessToken: "must-not-reach-the-client",
    } as UserPrivate;
}

beforeEach(() => {
    state.authentications = 0;
    state.sessions = [];
    state.clearedLeases = [];
    state.account = undefined;
    state.privateUser = undefined;
});

async function submitAndResolve(redirectTo?: string) {
    const result = await submitLoginFormAction({
        email: "member@example.test",
        password: "synthetic-password",
        redirectTo,
    });

    assert.equal(result.success, true);
    assert.equal(result.message, "User authenticated successfully");
    assert.equal(state.authentications, 1, "login authenticates only after the synthetic credentials are accepted");
    assert.deepEqual(state.sessions, ["synthetic-did"], "successful login creates one session for the account DID");
    assert.deepEqual(state.clearedLeases, ["lease-begin"], "successful login clears the active attempt lease");
    assert.equal(
        "onboardingState" in result.data.user,
        false,
        "the client user response does not expose onboarding state",
    );
    assert.equal("metadata" in result.data.user, false, "the client user response does not expose private metadata");
    assert.equal(
        "matrixAccessToken" in result.data.user,
        false,
        "the client user response does not expose private tokens",
    );

    return resolveLoginFormDestination(result);
}

test("unfinished pending-registration onboarding returns the server-selected destination to the form", async () => {
    setAccount("pending-registration-v1", unfinishedState);
    assert.equal(await submitAndResolve(), "/onboarding");
});

test("completed pending-registration onboarding returns the profile fallback to the form", async () => {
    setAccount("pending-registration-v1", {
        ...unfinishedState,
        completionAcknowledgedAt: new Date("2026-11-15T08:30:00Z"),
    });
    assert.equal(await submitAndResolve(), "/circles/new-member");
});

test("legacy accounts preserve the profile fallback", async () => {
    setAccount(undefined, undefined, "legacy-member");
    assert.equal(await submitAndResolve(), "/circles/legacy-member");
});

test("safe explicit redirects survive the action response and form consumption", async () => {
    setAccount("pending-registration-v1", unfinishedState);
    assert.equal(
        await submitAndResolve("/circles/team/home?tab=events#upcoming"),
        "/circles/team/home?tab=events#upcoming",
    );
});

test("malicious redirects are rejected before the action returns a destination", async () => {
    for (const requestedRedirect of [
        "https://evil.example/path",
        "//evil.example/path",
        "/%2F%2Fevil.example/path",
        "/%2e%2e//evil.example/path",
        "/login?redirectTo=%2Fonboarding",
    ]) {
        setAccount("pending-registration-v1", unfinishedState);
        state.authentications = 0;
        state.sessions = [];
        state.clearedLeases = [];
        assert.equal(await submitAndResolve(requestedRedirect), "/onboarding");
    }
});

test("the form fallback preserves the legacy profile destination when the server omits redirectTo", () => {
    assert.equal(
        resolveLoginFormDestination({
            success: true,
            data: { user: { handle: "fallback-member" } },
        }),
        "/circles/fallback-member",
    );
});
