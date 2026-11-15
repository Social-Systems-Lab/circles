import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import { resolvePostLoginRedirect, validateInternalLoginRedirect } from "@/lib/auth/post-login-navigation";
import type { Circle } from "@/models/models";

const pendingUser = (
    onboardingState?: Partial<NonNullable<Circle["onboardingState"]>> | null,
    onboardingFlow = "pending-registration-v1",
) =>
    ({
        handle: "new-member",
        metadata: { onboardingFlow },
        onboardingState: onboardingState as Circle["onboardingState"],
    }) as Partial<Circle>;

const unfinishedState = {
    version: 1 as const,
    currentCard: "introduction" as const,
    startedAt: new Date("2026-11-15T08:00:00Z"),
    lastSeenAt: new Date("2026-11-15T08:05:00Z"),
    skippedCards: [],
    completionAcknowledgedAt: null,
};

test("unfinished pending-registration onboarding resumes", () => {
    assert.equal(resolvePostLoginRedirect(pendingUser(unfinishedState)), "/onboarding");
});

test("pending-registration onboarding without initialized state resumes", () => {
    assert.equal(resolvePostLoginRedirect(pendingUser(undefined)), "/onboarding");
});

test("acknowledged pending-registration onboarding uses the profile", () => {
    assert.equal(
        resolvePostLoginRedirect(
            pendingUser({
                ...unfinishedState,
                completionAcknowledgedAt: new Date("2026-11-15T08:30:00Z"),
            }),
        ),
        "/circles/new-member",
    );
});

test("incompatible state, legacy users and older flows preserve profile fallback", () => {
    assert.equal(
        resolvePostLoginRedirect(pendingUser({ ...unfinishedState, version: 2 as never })),
        "/circles/new-member",
    );
    assert.equal(resolvePostLoginRedirect({ handle: "legacy-member", metadata: {} }), "/circles/legacy-member");
    assert.equal(resolvePostLoginRedirect(pendingUser(unfinishedState, "pilot-quick-signup")), "/circles/new-member");
    assert.equal(
        resolvePostLoginRedirect(pendingUser({ version: 1 } as never)),
        "/circles/new-member",
        "malformed version-1 state preserves the profile fallback",
    );
    assert.equal(resolvePostLoginRedirect(null), "/explore");
});

test("explicit safe internal redirects take precedence and preserve query and hash", () => {
    assert.equal(
        resolvePostLoginRedirect(pendingUser(unfinishedState), "/circles/team/home?tab=events#upcoming"),
        "/circles/team/home?tab=events#upcoming",
    );
    assert.equal(
        resolvePostLoginRedirect(pendingUser(unfinishedState), "/onboarding?card=community-guidelines"),
        "/onboarding?card=community-guidelines",
    );
    assert.equal(
        resolvePostLoginRedirect(
            pendingUser({
                ...unfinishedState,
                completionAcknowledgedAt: new Date("2026-11-15T08:30:00Z"),
            }),
            "/onboarding",
        ),
        "/onboarding",
        "an explicit onboarding destination also takes precedence after acknowledgement",
    );
});

test("external, protocol-relative, malformed and auth-route redirects are rejected", () => {
    const unsafe = [
        "https://evil.example/path",
        "//evil.example/path",
        "/\\evil.example/path",
        "/%5Cevil.example/path",
        "/%2F%2Fevil.example/path",
        "/%09%2F%2Fevil.example/path",
        "/%2e%2e//evil.example/path",
        "not-a-path",
        "/login",
        "/login?redirectTo=%2Fonboarding",
        "/signup",
        "/signup/verify?token=test",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/logout",
    ];
    for (const value of unsafe) {
        assert.equal(validateInternalLoginRedirect(value), null, `${value} must be rejected`);
    }
    assert.equal(resolvePostLoginRedirect(pendingUser(unfinishedState), "https://evil.example"), "/onboarding");
    assert.equal(
        resolvePostLoginRedirect({ handle: "legacy-member" }, "https://evil.example"),
        "/circles/legacy-member",
    );
});
