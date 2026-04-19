import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    if (!stripeClient) {
        stripeClient = new Stripe(secretKey, {
            apiVersion: "2026-03-25.dahlia",
        });
    }

    return stripeClient;
}

export const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
export const STRIPE_PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY;

export function getStripePriceId(interval: "month" | "year"): string {
    const priceId = interval === "month" ? STRIPE_PRICE_MONTHLY : STRIPE_PRICE_YEARLY;
    if (!priceId) {
        throw new Error(`Stripe price is not configured for interval: ${interval}`);
    }
    return priceId;
}

export function getAppUrl(): string {
    const url = process.env.NEXT_PUBLIC_APP_URL || process.env.CIRCLES_URL || "http://localhost:3000";
    return url.replace(/\/+$/, "");
}
