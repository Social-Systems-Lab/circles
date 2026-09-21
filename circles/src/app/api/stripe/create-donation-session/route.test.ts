import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { createJsonRequest } from "@/test/next-request";

const restoreEnv = snapshotEnv("STRIPE_SECRET_KEY", "NEXT_PUBLIC_APP_URL", "CIRCLES_URL");
setEnv("STRIPE_SECRET_KEY", "sk_test_donation");
setEnv("NEXT_PUBLIC_APP_URL", "https://kamooni.example/");

const createSession = mock(async (_params: Record<string, any>): Promise<{ url: string | null }> => ({ url: "https://checkout.stripe.test/s1" }));
mock.module("stripe", () => ({
    default: class FakeStripe {
        checkout = { sessions: { create: createSession } };
    },
}));

const { POST } = await import("./route");

const consoleSpy = silenceConsole("error");
const donate = (body: unknown) => POST(createJsonRequest(body));

beforeEach(() => {
    createSession.mockReset();
    createSession.mockResolvedValue({ url: "https://checkout.stripe.test/s1" });
});

afterAll(restoreEnv);

describe("POST /api/stripe/create-donation-session", () => {
    test("creates a one-off euro payment session and returns its url", async () => {
        const response = await donate({ amount: 25 });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/s1" });
        expect(createSession).toHaveBeenCalledWith({
            mode: "payment",
            line_items: [
                {
                    price_data: { currency: "eur", product_data: { name: "Kamooni general donation" }, unit_amount: 2500 },
                    quantity: 1,
                },
            ],
            success_url: "https://kamooni.example/donate/success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url: "https://kamooni.example/donate?canceled=1",
            metadata: { purpose: "general_donation", donationType: "one_off", amountEur: "25", amountSource: "preset" },
        });
    });

    test.each([5, 10, 25, 50, 100])("marks %d as a preset amount", async (amount) => {
        await donate({ amount });

        expect(createSession.mock.calls[0][0].metadata.amountSource).toBe("preset");
    });

    test.each([1, 7, 99, 101, 10000])("marks %d as a custom amount and charges it in cents", async (amount) => {
        await donate({ amount });

        expect(createSession.mock.calls[0][0].metadata.amountSource).toBe("custom");
        expect(createSession.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(amount * 100);
    });

    test("accepts the amount as a numeric string", async () => {
        await donate({ amount: "10" });

        expect(createSession.mock.calls[0][0].metadata).toMatchObject({ amountEur: "10", amountSource: "preset" });
    });

    test.each([
        ["zero", { amount: 0 }],
        ["negative", { amount: -5 }],
        ["above the maximum", { amount: 10001 }],
        ["fractional", { amount: 5.5 }],
        ["not a number", { amount: "lots" }],
        ["missing", {}],
        ["null", { amount: null }],
        ["not an integer string", { amount: "5.5" }],
        ["NaN", { amount: "NaN" }],
        ["infinite", { amount: "Infinity" }],
    ])("rejects an amount that is %s", async (_label, body) => {
        const response = await donate(body);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Invalid donation amount" });
        expect(createSession).not.toHaveBeenCalled();
    });

    test("rejects a body that is not JSON", async () => {
        expect((await donate("{broken")).status).toBe(400);
    });

    test("does not require the donor to be signed in", async () => {
        expect((await donate({ amount: 5 })).status).toBe(200);
    });

    test("returns a null url when Stripe gives none", async () => {
        createSession.mockResolvedValue({ url: null });

        expect(await (await donate({ amount: 5 })).json()).toEqual({ url: null });
    });

    test("reports Stripe's error message with a 500, and logs it", async () => {
        createSession.mockRejectedValue(new Error("Your card was declined"));

        const response = await donate({ amount: 5 });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Your card was declined" });
        expect(consoleSpy.error).toHaveBeenCalledWith("Error creating Stripe donation checkout session:", expect.any(Error));
    });

    test("uses a generic message when the failure is not an Error", async () => {
        createSession.mockRejectedValue("boom");

        expect(await (await donate({ amount: 5 })).json()).toEqual({ error: "Failed to create donation checkout session" });
    });
});
