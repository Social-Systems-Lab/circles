// @ts-expect-error Bun's runtime test API is available when this test is run with `bun test`.
import { describe, expect, mock, test } from "bun:test";

mock.module("next/cache", () => ({ revalidatePath: () => undefined }));
mock.module("next/navigation", () => ({ redirect: () => undefined }));
mock.module("@/lib/auth/auth", () => ({ getAuthenticatedUserDid: async () => undefined }));
mock.module("@/lib/data/user", () => ({
    getPrivateUserByDid: async () => null,
    getUserPrivate: async () => null,
    updateUser: async () => undefined,
}));
mock.module("@/lib/data/db", () => ({ Circles: { updateOne: async () => undefined } }));
mock.module("@/lib/data/email", () => ({
    generateSecureToken: () => "token",
    hashToken: () => "hash",
    sendEmail: async () => undefined,
}));
mock.module("@/lib/auth/email-verification-recovery", () => ({
    resendEmailVerificationForAuthenticatedUser: async () => ({ success: false }),
}));
mock.module("@/lib/data/external-notification-channels", () => ({
    createTelegramConnectToken: async () => "token",
    disconnectTelegramChannelForUser: async () => undefined,
    isTelegramPrivacyMode: () => false,
    updateTelegramChannelPrivacyMode: async () => undefined,
}));

const actions: Record<string, unknown> = await import("./actions");

describe("subscription settings server actions", () => {
    test("does not export unused Donorbox credential-backed read actions", () => {
        expect("getSubscription" in actions).toBe(false);
        expect("getPlans" in actions).toBe(false);
    });

    test("preserves the legitimate subscription settings exports", () => {
        for (const name of [
            "createSubscription",
            "updateEmailPreferenceSetting",
            "resendEmailVerificationAction",
            "createTelegramConnectLink",
            "disconnectTelegramNotifications",
            "updateTelegramPrivacyMode",
        ]) {
            expect(typeof actions[name]).toBe("function");
        }
    });
});
