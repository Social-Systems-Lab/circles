import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getPrivateUserByDid } from "@/lib/data/user";
import { getAppUrl, getStripe } from "@/lib/stripe";

export async function POST() {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await getPrivateUserByDid(userDid);
        const customerId = user?.subscription?.stripeCustomerId;

        if (!customerId) {
            return NextResponse.json({ error: "No Stripe customer found for this user" }, { status: 400 });
        }

        const stripe = getStripe();
        const portal = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${getAppUrl()}/circles/${user.handle}/settings/subscription`,
        });

        return NextResponse.json({ url: portal.url });
    } catch (error) {
        console.error("Error creating Stripe portal session:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create portal session" },
            { status: 500 },
        );
    }
}
