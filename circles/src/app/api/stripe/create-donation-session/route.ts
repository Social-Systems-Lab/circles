import { NextRequest, NextResponse } from "next/server";
import { getAppUrl, getStripe } from "@/lib/stripe";

const ALLOWED_AMOUNTS = new Set([5, 10, 25, 50, 100]);
const MIN_DONATION_AMOUNT = 1;
const MAX_DONATION_AMOUNT = 10000;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const amount = Number(body?.amount);
        const amountSource = ALLOWED_AMOUNTS.has(amount) ? "preset" : "custom";

        if (!Number.isInteger(amount) || amount < MIN_DONATION_AMOUNT || amount > MAX_DONATION_AMOUNT) {
            return NextResponse.json({ error: "Invalid donation amount" }, { status: 400 });
        }

        const stripe = getStripe();
        const appUrl = getAppUrl();

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [
                {
                    price_data: {
                        currency: "eur",
                        product_data: {
                            name: "Kamooni general donation",
                        },
                        unit_amount: amount * 100,
                    },
                    quantity: 1,
                },
            ],
            success_url: `${appUrl}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/donate?canceled=1`,
            metadata: {
                purpose: "general_donation",
                donationType: "one_off",
                amountEur: String(amount),
                amountSource,
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error("Error creating Stripe donation checkout session:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create donation checkout session" },
            { status: 500 },
        );
    }
}
