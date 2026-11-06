import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { afterAll, beforeEach, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalCirclesUrl = process.env.CIRCLES_URL;
const originalNodeEnv = process.env.NODE_ENV;
const state = {
    enabled: true,
    routed: true,
    verificationResult: {
        success: true,
        pendingRegistrationId: "pending-registration-id",
        verifiedContinuationSecret: "verified-continuation-secret",
    } as Record<string, unknown>,
    verificationCalls: 0,
};

mock.module("@/lib/auth/pending-registration", () => ({
    isPendingRegistrationEnabled: () => state.enabled,
    verifyPendingRegistrationEmail: async () => {
        state.verificationCalls += 1;
        return state.verificationResult;
    },
}));
mock.module("@/lib/auth/pending-registration-runtime", () => ({
    createPendingRegistrationRuntimeDependencies: async () => ({}),
}));
mock.module("@/lib/auth/registration-routing", () => ({
    isRegistrationModeAllowed: async () => state.routed,
}));

const { GET } = await import("@/app/(auth)/signup/verify/route");

beforeEach(() => {
    mutableEnv.CIRCLES_URL = "https://staging.kamooni.org";
    mutableEnv.NODE_ENV = "production";
    state.enabled = true;
    state.routed = true;
    state.verificationResult = {
        success: true,
        pendingRegistrationId: "pending-registration-id",
        verifiedContinuationSecret: "verified-continuation-secret",
    };
    state.verificationCalls = 0;
});

afterAll(() => {
    if (originalCirclesUrl === undefined) delete mutableEnv.CIRCLES_URL;
    else mutableEnv.CIRCLES_URL = originalCirclesUrl;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
});

function internalRequest(token = "synthetic-verification-token") {
    return new NextRequest(`https://0.0.0.0:3000/signup/verify?token=${encodeURIComponent(token)}`, {
        headers: {
            host: "evil.example",
            "x-forwarded-host": "attacker.example",
            "x-forwarded-proto": "http",
        },
    });
}

test("successful verification redirects from an internal request URL to the configured public origin", async () => {
    const response = await GET(internalRequest());
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://staging.kamooni.org/signup/continue");
    assert.doesNotMatch(response.headers.get("location") || "", /token/i);
    assert.equal(state.verificationCalls, 1);

    const cookie = response.headers.get("set-cookie") || "";
    assert.match(cookie, /__Host-kamooni-verified-registration=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=strict/i);
    assert.match(cookie, /Path=\//i);
    assert.match(cookie, /Max-Age=1800/i);
});

for (const condition of ["invalid", "expired", "replayed"]) {
    test(`${condition} verification redirects to the configured public failure URL`, async () => {
        state.verificationResult = { success: false };
        const response = await GET(internalRequest(`${condition}-synthetic-token`));
        assert.equal(response.status, 303);
        assert.equal(response.headers.get("location"), "https://staging.kamooni.org/signup?verification=invalid");
        assert.doesNotMatch(response.headers.get("location") || "", /token/i);
    });
}

test("spoofed host and forwarded-host headers cannot change the public redirect", async () => {
    const response = await GET(internalRequest());
    assert.equal(new URL(response.headers.get("location") || "").origin, "https://staging.kamooni.org");
});

for (const configuredOrigin of [undefined, "not a URL", "http://staging.kamooni.org", "https://0.0.0.0:3000"]) {
    test(`unsafe configured origin fails closed before token processing: ${String(configuredOrigin)}`, async () => {
        if (configuredOrigin === undefined) delete mutableEnv.CIRCLES_URL;
        else mutableEnv.CIRCLES_URL = configuredOrigin;
        const response = await GET(internalRequest());
        assert.equal(response.status, 500);
        assert.equal(response.headers.get("location"), null);
        assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
        assert.equal(state.verificationCalls, 0);
    });
}
