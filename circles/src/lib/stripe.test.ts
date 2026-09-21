import { afterEach, describe, expect, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";

const ENV_NAMES = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_MONTHLY",
    "STRIPE_PRICE_YEARLY",
    "STRIPE_PRICE_MONTHLY_1",
    "STRIPE_PRICE_MONTHLY_2",
    "STRIPE_PRICE_MONTHLY_5",
    "STRIPE_PRICE_MONTHLY_10",
    "NEXT_PUBLIC_APP_URL",
    "CIRCLES_URL",
];
const restoreEnv = snapshotEnv(...ENV_NAMES);

// Price ids are read from the environment when the module loads, so each configuration gets its own instance.
let instance = 0;
const loadStripe = async (env: Record<string, string | undefined> = {}) => {
    for (const name of ENV_NAMES) setEnv(name, env[name]);
    instance += 1;
    return (await import(`./stripe?instance=${instance}`)) as typeof import("./stripe");
};

afterEach(restoreEnv);

describe("getStripe", () => {
    test("throws when the secret key is not configured", async () => {
        const stripe = await loadStripe();

        expect(() => stripe.getStripe()).toThrow("STRIPE_SECRET_KEY is not configured");
    });

    test("throws for an empty secret key", async () => {
        const stripe = await loadStripe({ STRIPE_SECRET_KEY: "" });

        expect(() => stripe.getStripe()).toThrow("STRIPE_SECRET_KEY is not configured");
    });

    test("returns a Stripe client", async () => {
        const stripe = await loadStripe({ STRIPE_SECRET_KEY: "sk_test_123" });

        const client = stripe.getStripe();

        expect(typeof client.checkout.sessions.create).toBe("function");
        expect(typeof client.webhooks.constructEvent).toBe("function");
    });

    test("reuses the same client on later calls", async () => {
        const stripe = await loadStripe({ STRIPE_SECRET_KEY: "sk_test_123" });

        expect(stripe.getStripe()).toBe(stripe.getStripe());
    });

    test("keeps using the first client even if the key changes afterwards", async () => {
        const stripe = await loadStripe({ STRIPE_SECRET_KEY: "sk_test_first" });
        const first = stripe.getStripe();

        setEnv("STRIPE_SECRET_KEY", "sk_test_second");

        expect(stripe.getStripe()).toBe(first);
    });

    test("still requires the key on every call, even after a client exists", async () => {
        const stripe = await loadStripe({ STRIPE_SECRET_KEY: "sk_test_123" });
        stripe.getStripe();

        setEnv("STRIPE_SECRET_KEY", undefined);

        expect(() => stripe.getStripe()).toThrow("STRIPE_SECRET_KEY is not configured");
    });
});

describe("getStripePriceId", () => {
    test("returns the monthly and yearly price ids", async () => {
        const stripe = await loadStripe({ STRIPE_PRICE_MONTHLY: "price_m", STRIPE_PRICE_YEARLY: "price_y" });

        expect(stripe.getStripePriceId("month")).toBe("price_m");
        expect(stripe.getStripePriceId("year")).toBe("price_y");
    });

    test.each(["month", "year"] as const)("throws when the %s price is not configured", async (interval) => {
        const stripe = await loadStripe();

        expect(() => stripe.getStripePriceId(interval)).toThrow(`Stripe price is not configured for interval: ${interval}`);
    });

    test("treats an empty price id as not configured", async () => {
        const stripe = await loadStripe({ STRIPE_PRICE_MONTHLY: "" });

        expect(() => stripe.getStripePriceId("month")).toThrow("not configured");
    });

    test("exposes the configured price ids as constants", async () => {
        const stripe = await loadStripe({
            STRIPE_PRICE_MONTHLY: "m",
            STRIPE_PRICE_YEARLY: "y",
            STRIPE_PRICE_MONTHLY_1: "m1",
            STRIPE_PRICE_MONTHLY_2: "m2",
            STRIPE_PRICE_MONTHLY_5: "m5",
            STRIPE_PRICE_MONTHLY_10: "m10",
        });

        expect([
            stripe.STRIPE_PRICE_MONTHLY,
            stripe.STRIPE_PRICE_YEARLY,
            stripe.STRIPE_PRICE_MONTHLY_1,
            stripe.STRIPE_PRICE_MONTHLY_2,
            stripe.STRIPE_PRICE_MONTHLY_5,
            stripe.STRIPE_PRICE_MONTHLY_10,
        ]).toEqual(["m", "y", "m1", "m2", "m5", "m10"]);
    });
});

describe("getStripeMonthlyTierPriceId", () => {
    test.each([
        [1, "STRIPE_PRICE_MONTHLY_1"],
        [2, "STRIPE_PRICE_MONTHLY_2"],
        [5, "STRIPE_PRICE_MONTHLY_5"],
        [10, "STRIPE_PRICE_MONTHLY_10"],
    ] as const)("returns the price for the %d tier", async (amount, variable) => {
        const stripe = await loadStripe({ [variable]: `price_${amount}` });

        expect(stripe.getStripeMonthlyTierPriceId(amount)).toBe(`price_${amount}`);
    });

    test("falls back to the generic monthly price for the 5 tier only", async () => {
        const stripe = await loadStripe({ STRIPE_PRICE_MONTHLY: "price_generic" });

        expect(stripe.getStripeMonthlyTierPriceId(5)).toBe("price_generic");
        expect(() => stripe.getStripeMonthlyTierPriceId(1)).toThrow();
        expect(() => stripe.getStripeMonthlyTierPriceId(2)).toThrow();
        expect(() => stripe.getStripeMonthlyTierPriceId(10)).toThrow();
    });

    test("prefers the dedicated 5 tier price over the generic monthly price", async () => {
        const stripe = await loadStripe({ STRIPE_PRICE_MONTHLY: "price_generic", STRIPE_PRICE_MONTHLY_5: "price_5" });

        expect(stripe.getStripeMonthlyTierPriceId(5)).toBe("price_5");
    });

    test("throws a descriptive error for an unconfigured tier", async () => {
        const stripe = await loadStripe();

        expect(() => stripe.getStripeMonthlyTierPriceId(2)).toThrow("Stripe monthly supporter price is not configured for amount: 2");
    });
});

describe("isStripeMonthlyTierAmount / parseStripeMonthlyTierAmount", () => {
    test.each([1, 2, 5, 10])("accepts %d", async (amount) => {
        const stripe = await loadStripe();

        expect(stripe.isStripeMonthlyTierAmount(amount)).toBe(true);
        expect(stripe.parseStripeMonthlyTierAmount(amount)).toBe(amount as never);
    });

    test.each<[unknown]>([[0], [3], [-1], [1.5], ["5"], [null], [undefined], [NaN], [{}], [[5]]])("rejects %p", async (value) => {
        const stripe = await loadStripe();

        expect(stripe.isStripeMonthlyTierAmount(value)).toBe(false);
        expect(stripe.parseStripeMonthlyTierAmount(value)).toBeUndefined();
    });
});

describe("getAppUrl", () => {
    test("prefers NEXT_PUBLIC_APP_URL, then CIRCLES_URL, then localhost", async () => {
        const stripe = await loadStripe();

        setEnv("CIRCLES_URL", "https://circles.example");
        expect(stripe.getAppUrl()).toBe("https://circles.example");

        setEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
        expect(stripe.getAppUrl()).toBe("https://app.example");

        setEnv("NEXT_PUBLIC_APP_URL", undefined);
        setEnv("CIRCLES_URL", undefined);
        expect(stripe.getAppUrl()).toBe("http://localhost:3000");
    });

    test("removes trailing slashes", async () => {
        const stripe = await loadStripe({ CIRCLES_URL: "https://circles.example///" });

        expect(stripe.getAppUrl()).toBe("https://circles.example");
    });

    test("keeps paths and only trims the end", async () => {
        const stripe = await loadStripe({ CIRCLES_URL: "https://circles.example/base/" });

        expect(stripe.getAppUrl()).toBe("https://circles.example/base");
    });

    test("falls through empty values", async () => {
        const stripe = await loadStripe({ NEXT_PUBLIC_APP_URL: "", CIRCLES_URL: "" });

        expect(stripe.getAppUrl()).toBe("http://localhost:3000");
    });
});
