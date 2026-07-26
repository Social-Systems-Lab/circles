import assert from "node:assert/strict";
import {
    EMAIL_VERIFICATION_COOLDOWN_MESSAGE,
    EMAIL_VERIFICATION_PROVIDER_ERROR_MESSAGE,
    EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
    EMAIL_VERIFICATION_SUCCESS_MESSAGE,
    resendEmailVerificationForAuthenticatedUser,
    shouldShowEmailVerificationBanner,
} from "@/lib/auth/email-verification-recovery";
import { hashToken } from "@/lib/data/email";
import type { Circle } from "@/models/models";

const fixedNow = new Date("2026-07-26T12:00:00.000Z");

const baseUser = (overrides: Partial<Circle> = {}): Partial<Circle> => ({
    _id: "user-id",
    did: "did:user",
    name: "Test User",
    handle: "test-user",
    email: "test@example.invalid",
    isEmailVerified: false,
    ...overrides,
});

assert.equal(
    shouldShowEmailVerificationBanner(baseUser({ isEmailVerified: true })),
    false,
    "verified users do not see banner",
);
assert.equal(shouldShowEmailVerificationBanner(baseUser({ isEmailVerified: false })), true, "false shows banner");
assert.equal(shouldShowEmailVerificationBanner(baseUser({ isEmailVerified: undefined })), true, "missing shows banner");

async function runResend(
    overrides: {
        user?: Partial<Circle>;
        sendFails?: boolean;
        now?: Date;
    } = {},
) {
    const calls: {
        requestedDid?: string;
        sentTo?: string;
        sentActionUrl?: string;
        persisted?: {
            userDid: string;
            hashedToken: string;
            expiresAt: Date;
            sentAt: Date;
        };
    } = {};
    const token = "raw-token-value";
    const user = overrides.user === undefined ? baseUser() : overrides.user;

    const result = await resendEmailVerificationForAuthenticatedUser("did:user", {
        getUserByDid: async (did) => {
            calls.requestedDid = did;
            return user as Circle;
        },
        sendEmail: async (options) => {
            if (overrides.sendFails) {
                throw new Error("provider unavailable");
            }
            calls.sentTo = options.to;
            calls.sentActionUrl = String(options.templateModel.actionUrl);
        },
        persistToken: async (params) => {
            calls.persisted = params;
        },
        generateToken: () => token,
        hashToken,
        getBaseUrl: () => "https://kamooni.example/",
        now: () => overrides.now ?? fixedNow,
    });

    return { result, calls, token };
}

async function main() {
    {
        const { result, calls, token } = await runResend();

        assert.deepEqual(
            { success: result.success, status: result.status, message: result.message },
            { success: true, status: "sent", message: EMAIL_VERIFICATION_SUCCESS_MESSAGE },
            "unverified user gets generic success",
        );
        assert.equal(calls.requestedDid, "did:user", "resend derives account from authenticated DID");
        assert.equal(calls.sentTo, "test@example.invalid", "email goes to authenticated account");
        assert.equal(
            calls.sentActionUrl,
            `https://kamooni.example/verify-email?token=${token}`,
            "verification URL uses generated token",
        );
        assert.ok(calls.persisted, "successful send persists token state");
        assert.equal(calls.persisted?.hashedToken, hashToken(token), "stored token is hashed");
        assert.notEqual(calls.persisted?.hashedToken, token, "raw token is not stored");
        assert.equal(calls.persisted?.sentAt.toISOString(), fixedNow.toISOString(), "last-sent timestamp is stored");
        assert.equal(
            calls.persisted?.expiresAt.getTime(),
            fixedNow.getTime() + 24 * 60 * 60 * 1000,
            "expiry is approximately 24 hours ahead",
        );
    }

    {
        const originalLastSentAt = new Date(fixedNow.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS + 1);
        const { result, calls } = await runResend({
            user: baseUser({
                emailVerificationToken: "old-hash",
                emailVerificationTokenExpiry: new Date("2026-07-26T13:00:00.000Z"),
                emailVerificationLastSentAt: originalLastSentAt,
            }),
        });

        assert.deepEqual(
            { success: result.success, status: result.status, message: result.message },
            { success: false, status: "cooldown", message: EMAIL_VERIFICATION_COOLDOWN_MESSAGE },
            "cooldown returns controlled response",
        );
        assert.equal(calls.sentTo, undefined, "cooldown does not send");
        assert.equal(calls.persisted, undefined, "cooldown does not rotate token or timestamp");
    }

    {
        const { result, calls } = await runResend({
            user: baseUser({
                isEmailVerified: true,
            }),
        });

        assert.deepEqual(
            { success: result.success, status: result.status, message: result.message },
            { success: true, status: "already_verified", message: EMAIL_VERIFICATION_SUCCESS_MESSAGE },
            "already verified is safe no-op",
        );
        assert.equal(calls.sentTo, undefined, "already verified sends no email");
        assert.equal(calls.persisted, undefined, "already verified persists no token");
    }

    {
        const { result, calls } = await runResend({
            user: baseUser({
                emailVerificationToken: "expired-old-hash",
                emailVerificationTokenExpiry: new Date("2026-07-25T12:00:00.000Z"),
                emailVerificationLastSentAt: null,
            }),
        });

        assert.equal(result.success, true, "expired prior token can be replaced");
        assert.ok(calls.persisted, "expired prior token is replaced after send");
        assert.notEqual(calls.persisted?.hashedToken, "expired-old-hash", "replacement token differs from old token");
    }

    {
        const { result, calls } = await runResend({ sendFails: true });

        assert.deepEqual(
            { success: result.success, status: result.status, message: result.message },
            { success: false, status: "error", message: EMAIL_VERIFICATION_PROVIDER_ERROR_MESSAGE },
            "provider failure returns controlled error",
        );
        assert.equal(calls.persisted, undefined, "provider failure does not persist an unusable fresh token");
    }

    {
        const { result, calls } = await runResend({
            user: baseUser({
                emailVerificationLastSentAt: undefined,
            }),
        });

        assert.equal(result.success, true, "legacy user with missing timestamp can request verification");
        assert.ok(calls.persisted, "legacy missing timestamp is populated after successful send");
    }

    console.log("email-verification-recovery tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
