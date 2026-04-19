import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { findOrCreateStripeCustomerForUser } from "@/lib/data/membership";
import { getAppUrl, getStripe, getStripePriceId } from "@/lib/stripe";

export async function POST(req: NextRequest) {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const interval = body?.interval === "year" ? "year" : "month";

        const { user, customerId } = await findOrCreateStripeCustomerForUser(userDid);
        const stripe = getStripe();
        const appUrl = getAppUrl();

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            client_reference_id: user._id,
            line_items: [
                {
                    price: getStripePriceId(interval),
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
            },
            subscription_data: {
                metadata: {
                    userDid: user.did || "",
                    userId: user._id || "",
                    handle: user.handle || "",
                    interval,
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
