import Stripe from "stripe";

let stripeClient: Stripe | null = null;

const MONTHLY_TIER_AMOUNTS = [1, 2, 5, 10] as const;
export type StripeMonthlyTierAmount = (typeof MONTHLY_TIER_AMOUNTS)[number];

export function getStripe(): Stripe {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    if (!stripeClient) {
        stripeClient = new Stripe(secretKey, {
            apiVersion: "2026-05-27.dahlia",
        });
    }

    return stripeClient;
}

export const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
export const STRIPE_PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY;
export const STRIPE_PRICE_MONTHLY_1 = process.env.STRIPE_PRICE_MONTHLY_1;
export const STRIPE_PRICE_MONTHLY_2 = process.env.STRIPE_PRICE_MONTHLY_2;
export const STRIPE_PRICE_MONTHLY_5 = process.env.STRIPE_PRICE_MONTHLY_5;
export const STRIPE_PRICE_MONTHLY_10 = process.env.STRIPE_PRICE_MONTHLY_10;

const MONTHLY_TIER_PRICE_IDS: Record<StripeMonthlyTierAmount, string | undefined> = {
    1: STRIPE_PRICE_MONTHLY_1,
    2: STRIPE_PRICE_MONTHLY_2,
    5: STRIPE_PRICE_MONTHLY_5 || STRIPE_PRICE_MONTHLY,
    10: STRIPE_PRICE_MONTHLY_10,
};

export function getStripePriceId(interval: "month" | "year"): string {
    const priceId = interval === "month" ? STRIPE_PRICE_MONTHLY : STRIPE_PRICE_YEARLY;
    if (!priceId) {
        throw new Error(`Stripe price is not configured for interval: ${interval}`);
    }
    return priceId;
}

export function getStripeMonthlyTierPriceId(amount: StripeMonthlyTierAmount): string {
    const priceId = MONTHLY_TIER_PRICE_IDS[amount];
    if (!priceId) {
        throw new Error(`Stripe monthly supporter price is not configured for amount: ${amount}`);
    }
    return priceId;
}

export function isStripeMonthlyTierAmount(value: unknown): value is StripeMonthlyTierAmount {
    return typeof value === "number" && MONTHLY_TIER_AMOUNTS.includes(value as StripeMonthlyTierAmount);
}

export function parseStripeMonthlyTierAmount(value: unknown): StripeMonthlyTierAmount | undefined {
    return isStripeMonthlyTierAmount(value) ? value : undefined;
}

export function getAppUrl(): string {
    const url = process.env.NEXT_PUBLIC_APP_URL || process.env.CIRCLES_URL || "http://localhost:3000";
    return url.replace(/\/+$/, "");
}
