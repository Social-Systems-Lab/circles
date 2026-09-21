import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";

const restoreEnv = snapshotEnv("STRIPE_SECRET_KEY", "NEXT_PUBLIC_APP_URL");
setEnv("STRIPE_SECRET_KEY", "sk_test_portal");
setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");

const createPortalSession = mock(async (_params: Record<string, any>): Promise<{ url: string }> => ({ url: "https://billing.stripe.test/p1" }));
mock.module("stripe", () => ({
    default: class FakeStripe {
        billingPortal = { sessions: { create: createPortalSession } };
    },
}));

const getAuthenticatedUserDid = mockAuthenticatedUser();

const getPrivateUserByDid = mock(async (_did: string): Promise<Record<string, unknown> | null> => ({
    handle: "vee",
    subscription: { stripeCustomerId: "cus_1" },
}));
mock.module("@/lib/data/user", () => ({ getPrivateUserByDid }));

const { POST } = await import("./route");

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    createPortalSession.mockReset();
    createPortalSession.mockResolvedValue({ url: "https://billing.stripe.test/p1" });
    getPrivateUserByDid.mockReset();
    getPrivateUserByDid.mockResolvedValue({ handle: "vee", subscription: { stripeCustomerId: "cus_1" } });
});

afterAll(restoreEnv);

describe("POST /api/stripe/create-portal-session", () => {
    test("opens the billing portal for the user's Stripe customer and returns its url", async () => {
        const response = await POST();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: "https://billing.stripe.test/p1" });
        expect(getPrivateUserByDid).toHaveBeenCalledWith("did:user");
        expect(createPortalSession).toHaveBeenCalledWith({
            customer: "cus_1",
            return_url: "https://kamooni.example/circles/vee/settings/subscription",
        });
    });

    test("rejects signed-out callers without loading anything", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await POST();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(getPrivateUserByDid).not.toHaveBeenCalled();
    });

    test.each([
        ["has no subscription", { handle: "vee" }],
        ["has no customer id", { handle: "vee", subscription: {} }],
        ["has an empty customer id", { handle: "vee", subscription: { stripeCustomerId: "" } }],
        ["cannot be found", null],
    ])("answers 400 when the user %s, without calling Stripe", async (_label, user) => {
        getPrivateUserByDid.mockResolvedValue(user);

        const response = await POST();

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "No Stripe customer found for this user" });
        expect(createPortalSession).not.toHaveBeenCalled();
    });

    test("only ever opens the portal of the signed-in user's own customer", async () => {
        await POST();

        expect(createPortalSession.mock.calls[0][0].customer).toBe("cus_1");
    });

    test("returns the error message with a 500 when Stripe fails, and logs it", async () => {
        createPortalSession.mockRejectedValue(new Error("Stripe is down"));

        const response = await POST();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Stripe is down" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error creating Stripe portal session:", expect.any(Error));
    });

    test("uses a generic message when the failure is not an Error", async () => {
        createPortalSession.mockRejectedValue("boom");

        expect(await (await POST()).json()).toEqual({ error: "Failed to create portal session" });
    });
});
