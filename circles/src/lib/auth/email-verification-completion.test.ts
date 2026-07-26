import assert from "node:assert/strict";
import { verifyEmailToken } from "@/lib/auth/email-verification-completion";
import { hashToken } from "@/lib/data/email";
import type { Circle } from "@/models/models";

const fixedNow = new Date("2026-07-26T12:00:00.000Z");

type TestUser = Partial<Circle> & {
    _id: string;
};

const makeUser = (overrides: Partial<Circle> = {}): TestUser => ({
    _id: "user-id",
    did: "did:user",
    handle: "test-user",
    isEmailVerified: false,
    emailVerificationToken: hashToken("valid-token"),
    emailVerificationTokenExpiry: new Date("2026-07-27T12:00:00.000Z"),
    ...overrides,
});

async function runVerification(initialUser: TestUser | null, token = "valid-token") {
    let user = initialUser;
    let cleared = false;

    const result = await verifyEmailToken(token, {
        hashToken,
        findUserByHashedToken: async (hashedToken) =>
            user?.emailVerificationToken === hashedToken ? (user as Circle) : null,
        clearToken: async () => {
            cleared = true;
            if (user) {
                user.emailVerificationToken = null;
                user.emailVerificationTokenExpiry = null;
            }
        },
        markEmailVerified: async ({ hashedToken, now }) => {
            if (
                !user ||
                user.isEmailVerified === true ||
                user.emailVerificationToken !== hashedToken ||
                !(user.emailVerificationTokenExpiry instanceof Date) ||
                user.emailVerificationTokenExpiry <= now
            ) {
                return false;
            }

            user.isEmailVerified = true;
            user.emailVerificationToken = null;
            user.emailVerificationTokenExpiry = null;
            return true;
        },
        now: () => fixedNow,
    });

    return { result, user, cleared };
}

async function main() {
    {
        const { result, user, cleared } = await runVerification(makeUser());

        assert.deepEqual(
            result,
            { success: true, message: "Email verified", handle: "test-user" },
            "valid token verifies with DB-derived handle",
        );
        assert.equal(user?.isEmailVerified, true, "valid token marks user verified");
        assert.equal(user?.emailVerificationToken, null, "valid token clears token");
        assert.equal(user?.emailVerificationTokenExpiry, null, "valid token clears expiry");
        assert.equal(cleared, false, "valid token uses verify update rather than clear-only path");
    }

    {
        const { result, user, cleared } = await runVerification(
            makeUser({ emailVerificationTokenExpiry: new Date("2026-07-26T11:59:59.000Z") }),
        );

        assert.equal(result.success, false, "expired token fails");
        assert.match(result.message, /expired/i, "expired token returns expired message");
        assert.equal(cleared, true, "expired token is cleared");
        assert.equal(user?.isEmailVerified, false, "expired token does not verify");
    }

    {
        const { result, user, cleared } = await runVerification(makeUser({ emailVerificationTokenExpiry: undefined }));

        assert.equal(result.success, false, "missing expiry fails safely");
        assert.match(result.message, /expired/i, "missing expiry uses expired-token recovery copy");
        assert.equal(cleared, true, "missing expiry token is cleared");
        assert.equal(user?.isEmailVerified, false, "missing expiry does not verify");
    }

    {
        const first = await runVerification(makeUser());
        assert.equal(first.result.success, true, "first use succeeds");

        const second = await runVerification(first.user, "valid-token");
        assert.equal(second.result.success, false, "reused token fails");
        assert.match(second.result.message, /invalid|expired/i, "reused token returns safe failure");
    }

    {
        const { result, cleared } = await runVerification(makeUser({ isEmailVerified: true }));

        assert.equal(result.success, false, "already verified token fails safely");
        assert.match(result.message, /already/i, "already verified token reports already used");
        assert.equal(cleared, true, "already verified stale token is cleared");
    }

    console.log("email-verification-completion tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
