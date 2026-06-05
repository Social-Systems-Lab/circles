import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { findOrCreateStripeCustomerForUser } from "@/lib/data/membership";
import {
    getAppUrl,
    getStripe,
    getStripeMonthlyTierPriceId,
    getStripePriceId,
    parseStripeMonthlyTierAmount,
} from "@/lib/stripe";

export async function POST(req: NextRequest) {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const interval = body?.interval === "year" ? "year" : "month";
        const requestedAmount = body?.amount;
        const amount =
            interval === "month"
                ? requestedAmount === undefined
                    ? 5
                    : parseStripeMonthlyTierAmount(Number(requestedAmount))
                : undefined;

        if (interval === "month" && amount === undefined) {
            return NextResponse.json({ error: "Unsupported supporter tier" }, { status: 400 });
        }

        const { user, customerId } = await findOrCreateStripeCustomerForUser(userDid);
        const stripe = getStripe();
        const appUrl = getAppUrl();
        const priceId =
            interval === "month" && amount !== undefined
                ? getStripeMonthlyTierPriceId(amount)
                : getStripePriceId(interval);

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            client_reference_id: user._id,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            allow_promotion_codes: true,
            success_url: `${appUrl}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/circles/${user.handle}/settings/subscription`,
            metadata: {
                userDid: user.did || "",
                userId: user._id || "",
                handle: user.handle || "",
                interval,
                ...(amount !== undefined ? { amount: String(amount) } : {}),
            },
            subscription_data: {
                metadata: {
                    userDid: user.did || "",
                    userId: user._id || "",
                    handle: user.handle || "",
                    interval,
                    ...(amount !== undefined ? { amount: String(amount) } : {}),
                },
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Error creating Stripe checkout session:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create checkout session" },
            { status: 500 },
        );
    }
}
