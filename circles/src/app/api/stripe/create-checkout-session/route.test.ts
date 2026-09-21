import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { mockAuthenticatedUser } from "@/test/mock-auth";
import { createJsonRequest } from "@/test/next-request";

const restoreEnv = snapshotEnv(
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_MONTHLY",
    "STRIPE_PRICE_YEARLY",
    "STRIPE_PRICE_MONTHLY_1",
    "STRIPE_PRICE_MONTHLY_2",
    "STRIPE_PRICE_MONTHLY_5",
    "STRIPE_PRICE_MONTHLY_10",
    "NEXT_PUBLIC_APP_URL",
);
setEnv("STRIPE_SECRET_KEY", "sk_test_checkout");
setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example");
setEnv("STRIPE_PRICE_MONTHLY", "price_generic");
setEnv("STRIPE_PRICE_YEARLY", "price_year");
setEnv("STRIPE_PRICE_MONTHLY_1", "price_m1");
setEnv("STRIPE_PRICE_MONTHLY_2", "price_m2");
setEnv("STRIPE_PRICE_MONTHLY_5", "price_m5");
setEnv("STRIPE_PRICE_MONTHLY_10", "price_m10");

const createSession = mock(async (_params: Record<string, any>): Promise<{ url: string | null }> => ({ url: "https://checkout.stripe.test/sub" }));
mock.module("stripe", () => ({
    default: class FakeStripe {
        checkout = { sessions: { create: createSession } };
    },
}));

const getAuthenticatedUserDid = mockAuthenticatedUser();

const user = { _id: "user-1", did: "did:user", handle: "vee" };
const findOrCreateStripeCustomerForUser = mock(async (_did: string): Promise<{ user: Record<string, unknown>; customerId: string }> => ({ user, customerId: "cus_1" }));
mock.module("@/lib/data/membership", () => ({ findOrCreateStripeCustomerForUser }));

const { POST } = await import("./route");

const consoleSpy = silenceConsole("error");
const checkout = (body: unknown) => POST(createJsonRequest(body));

beforeEach(() => {
    createSession.mockReset();
    createSession.mockResolvedValue({ url: "https://checkout.stripe.test/sub" });
    findOrCreateStripeCustomerForUser.mockReset();
    findOrCreateStripeCustomerForUser.mockResolvedValue({ user, customerId: "cus_1" });
});

afterAll(restoreEnv);

describe("POST /api/stripe/create-checkout-session", () => {
    test("creates a subscription checkout for the signed-in user and returns its url", async () => {
        const response = await checkout({ interval: "month", amount: 10 });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/sub" });
        expect(findOrCreateStripeCustomerForUser).toHaveBeenCalledWith("did:user");
        expect(createSession).toHaveBeenCalledWith({
            mode: "subscription",
            customer: "cus_1",
            client_reference_id: "user-1",
            line_items: [{ price: "price_m10", quantity: 1 }],
            allow_promotion_codes: true,
            success_url: "https://kamooni.example/membership/success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url: "https://kamooni.example/circles/vee/settings/subscription",
            metadata: { userDid: "did:user", userId: "user-1", handle: "vee", interval: "month", amount: "10" },
            subscription_data: {
                metadata: { userDid: "did:user", userId: "user-1", handle: "vee", interval: "month", amount: "10" },
            },
        });
    });

    test("rejects signed-out callers before touching Stripe", async () => {
        getAuthenticatedUserDid.mockResolvedValue(undefined);

        const response = await checkout({ interval: "month" });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(findOrCreateStripeCustomerForUser).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
    });

    describe("monthly tiers", () => {
        test.each([[1, "price_m1"], [2, "price_m2"], [5, "price_m5"], [10, "price_m10"]])("uses the %d tier price", async (amount, price) => {
            await checkout({ interval: "month", amount });

            expect(createSession.mock.calls[0][0].line_items[0].price).toBe(price);
        });

        test("defaults to the 5 tier when no amount is given", async () => {
            await checkout({ interval: "month" });

            expect(createSession.mock.calls[0][0].line_items[0].price).toBe("price_m5");
            expect(createSession.mock.calls[0][0].metadata.amount).toBe("5");
        });

        test("defaults to a monthly subscription when no interval is given", async () => {
            await checkout({});

            expect(createSession.mock.calls[0][0].metadata.interval).toBe("month");
        });

        test("treats an unknown interval as monthly", async () => {
            await checkout({ interval: "weekly" });

            expect(createSession.mock.calls[0][0].metadata.interval).toBe("month");
        });

        test("accepts the amount as a numeric string", async () => {
            await checkout({ interval: "month", amount: "2" });

            expect(createSession.mock.calls[0][0].line_items[0].price).toBe("price_m2");
        });

        test.each([
            ["an unsupported tier", 3],
            ["zero", 0],
            ["negative", -5],
            ["fractional", 2.5],
            ["not a number", "many"],
            ["null", null],
            ["an empty string", ""],
        ])("rejects %s", async (_label, amount) => {
            const response = await checkout({ interval: "month", amount });

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: "Unsupported supporter tier" });
            expect(findOrCreateStripeCustomerForUser).not.toHaveBeenCalled();
        });
    });

    describe("yearly", () => {
        test("uses the yearly price and no tier amount", async () => {
            await checkout({ interval: "year" });

            const params = createSession.mock.calls[0][0];
            expect(params.line_items[0].price).toBe("price_year");
            expect(params.metadata).toEqual({ userDid: "did:user", userId: "user-1", handle: "vee", interval: "year" });
            expect(params.subscription_data.metadata).toEqual(params.metadata);
        });

        test("ignores a supplied amount, even an invalid one", async () => {
            const response = await checkout({ interval: "year", amount: 3 });

            expect(response.status).toBe(200);
            expect(createSession.mock.calls[0][0].metadata).not.toHaveProperty("amount");
        });
    });

    test("uses empty strings in the metadata for missing user fields, since Stripe needs strings", async () => {
        findOrCreateStripeCustomerForUser.mockResolvedValue({ user: { handle: "vee" }, customerId: "cus_1" });

        await checkout({ interval: "year" });

        expect(createSession.mock.calls[0][0].metadata).toMatchObject({ userDid: "", userId: "" });
        expect(createSession.mock.calls[0][0].client_reference_id).toBeUndefined();
    });

    test("treats a body that is not JSON as an empty request", async () => {
        await checkout("{broken");

        expect(createSession.mock.calls[0][0].line_items[0].price).toBe("price_m5");
    });

    test("returns a null url when Stripe gives none", async () => {
        createSession.mockResolvedValue({ url: null });

        expect(await (await checkout({})).json()).toEqual({ url: null });
    });

    test.each([
        ["creating the customer fails", () => findOrCreateStripeCustomerForUser.mockRejectedValue(new Error("customer error")), "customer error"],
        ["Stripe fails", () => createSession.mockRejectedValue(new Error("Stripe is down")), "Stripe is down"],
    ])("returns the error message with a 500 when %s, and logs it", async (_label, arrange, message) => {
        arrange();

        const response = await checkout({});

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: message });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error creating Stripe checkout session:", expect.any(Error));
    });

    test("uses a generic message when the failure is not an Error", async () => {
        createSession.mockRejectedValue("boom");

        expect(await (await checkout({})).json()).toEqual({ error: "Failed to create checkout session" });
    });
});
