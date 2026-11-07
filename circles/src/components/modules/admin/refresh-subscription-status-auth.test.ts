// @ts-expect-error Bun's runtime test API is available when this test is run with `bun test`.
import { beforeEach, describe, expect, mock, test } from "bun:test";

const TARGET_USER_ID = "64a000000000000000000001";
const defaultTargetUser = {
    _id: TARGET_USER_ID,
    subscription: { donorboxDonorId: "donor-1" },
};

let authorizationError: Error | null = null;
let targetUser: typeof defaultTargetUser | { _id: string; subscription?: undefined } = defaultTargetUser;
let targetLookupCount = 0;
let writes: Array<{ filter: unknown; update: unknown }> = [];
let revalidatedPaths: string[] = [];

const circles = {
    findOne: async () => {
        targetLookupCount++;
        return targetUser;
    },
    updateOne: async (filter: unknown, update: unknown) => {
        writes.push({ filter, update });
        return { modifiedCount: 1 };
    },
};

mock.module("next/cache", () => ({
    revalidatePath: (path: string) => revalidatedPaths.push(path),
}));
mock.module("@/lib/data/db", () => ({
    Circles: circles,
    Notifications: {},
    db: { collection: () => circles },
}));
mock.module("@/lib/auth/superadmin", () => ({
    requireSuperAdmin: async () => {
        if (authorizationError) throw authorizationError;
        return "did:test:admin";
    },
}));
mock.module("@/lib/data/circle", () => ({ deleteCircle: async () => undefined, getCircleById: async () => null }));
mock.module("@/lib/auth/auth", () => ({
    getAuthenticatedUserDid: async () => undefined,
    getServerPublicKey: async () => "",
}));
mock.module("@/lib/data/user", () => ({ getUserPrivate: async () => null, getUserByDid: async () => null }));
mock.module("@/lib/data/notifications", () => ({
    sendNotifications: async () => undefined,
    sendUserVerificationRejectedNotification: async () => undefined,
    sendUserVerifiedNotification: async () => undefined,
}));
mock.module("@/lib/data/email", () => ({ sendEmail: async () => undefined }));
mock.module("@/lib/data/server-settings", () => ({
    getServerSettings: async () => null,
    registerServer: async () => undefined,
    updateServerSettings: async () => undefined,
    urlIsLocal: () => false,
}));
mock.module("@/lib/data/vdb", () => ({ upsertVdbCollections: async () => undefined }));
mock.module("@/lib/data/system-message-templates", () => ({
    getWelcomeTemplateDraft: async () => null,
    saveWelcomeTemplate: async () => undefined,
}));
mock.module("@/config/platform-banner", () => ({ PLATFORM_BANNER_TYPES: [] }));
mock.module("@/lib/data/system-banners", () => ({
    getWelcomeBannerDraft: async () => null,
    saveWelcomeBanner: async () => undefined,
}));
mock.module("@/lib/data/platform-broadcasts", () => ({
    createPlatformBroadcastMessage: async () => undefined,
    deletePlatformBroadcastMessage: async () => undefined,
    getPlatformBroadcastMessage: async () => null,
    listPlatformBroadcastMessages: async () => [],
    previewPlatformBroadcastForUser: async () => undefined,
    savePlatformBroadcastMessage: async () => undefined,
    syncPlatformBroadcastsForUser: async () => undefined,
    updatePlatformBroadcastMessage: async () => undefined,
}));
mock.module("@/lib/auth/verification", () => ({
    buildUnverifiedUserUpdate: () => ({}),
    buildVerifiedUserSet: () => ({}),
}));
mock.module("@/lib/data/account-lifecycle", () => ({ activateUserAccount: async () => ({}) }));
mock.module("@/lib/data/circle-lifecycle", () => ({ changeCircleModerationStatus: async () => ({}) }));

const { refreshSubscriptionStatus } = await import("./actions");

const setFetchResponse = (response: { ok: boolean; json: () => Promise<unknown> }) => {
    globalThis.fetch = mock(async () => response) as unknown as typeof fetch;
};

beforeEach(() => {
    authorizationError = null;
    targetUser = defaultTargetUser;
    targetLookupCount = 0;
    writes = [];
    revalidatedPaths = [];
    process.env.DONORBOX_API_USER = "test-user";
    process.env.DONORBOX_API_KEY = "test-key";
    setFetchResponse({ ok: true, json: async () => [] });
});

describe("refreshSubscriptionStatus authorization", () => {
    test("unauthenticated callers fail before target lookup, fetch, or writes", async () => {
        authorizationError = new Error("Unauthorized: superadmin access required.");

        const result = await refreshSubscriptionStatus(TARGET_USER_ID);

        expect(result).toEqual({ success: false, message: "Unauthorized: superadmin access required." });
        expect(targetLookupCount).toBe(0);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(writes).toEqual([]);
    });

    test("non-admin callers fail before target lookup, fetch, or writes", async () => {
        authorizationError = new Error("Unauthorized: superadmin access required.");

        const result = await refreshSubscriptionStatus(TARGET_USER_ID);

        expect(result.success).toBe(false);
        expect(targetLookupCount).toBe(0);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(writes).toEqual([]);
    });

    test("authorized admins refresh an active subscription", async () => {
        setFetchResponse({
            ok: true,
            json: async () => [
                {
                    status: "active",
                    plan_id: "plan-1",
                    id: "subscription-1",
                    amount: "25.00",
                    currency: "USD",
                    created_at: "2026-01-01T00:00:00.000Z",
                    last_payment_date: "2026-11-01T00:00:00.000Z",
                },
            ],
        });

        const result = await refreshSubscriptionStatus(TARGET_USER_ID);

        expect(result.success).toBe(true);
        expect(targetLookupCount).toBe(1);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(writes).toHaveLength(1);
        expect((writes[0].filter as { _id: { toString: () => string } })._id.toString()).toBe(TARGET_USER_ID);
        expect(writes[0]).toMatchObject({
            update: {
                $set: {
                    isMember: true,
                    subscription: {
                        donorboxPlanId: "plan-1",
                        donorboxSubscriptionId: "subscription-1",
                        status: "active",
                    },
                },
            },
        });
        expect(revalidatedPaths).toEqual(["/admin"]);
    });

    test("authorized admins preserve the inactive-subscription behavior", async () => {
        const result = await refreshSubscriptionStatus(TARGET_USER_ID);

        expect(result.success).toBe(true);
        expect(writes[0]).toMatchObject({
            update: { $set: { isMember: false, subscription: { status: "inactive" } } },
        });
    });

    test("authorized admins do not write when Donorbox fails", async () => {
        setFetchResponse({ ok: false, json: async () => ({ error: "test failure" }) });

        const result = await refreshSubscriptionStatus(TARGET_USER_ID);

        expect(result).toEqual({ success: false, message: "Failed to fetch subscription status from Donorbox." });
        expect(writes).toEqual([]);
    });

    test("authorized admins do not fetch or write when the target has no Donorbox donor ID", async () => {
        targetUser = { _id: TARGET_USER_ID };

        const result = await refreshSubscriptionStatus(TARGET_USER_ID);

        expect(result).toEqual({ success: false, message: "User does not have a Donorbox donor ID." });
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(writes).toEqual([]);
    });

    test("authorized admins do not fetch or write when Donorbox credentials are missing", async () => {
        delete process.env.DONORBOX_API_USER;

        const result = await refreshSubscriptionStatus(TARGET_USER_ID);

        expect(result).toEqual({ success: false, message: "Donorbox credentials are not configured." });
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(writes).toEqual([]);
    });
});
