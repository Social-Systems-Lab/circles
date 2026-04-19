import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
    applyStripeMembershipUpdate,
    getUserByEmail,
    getUserByStripeCustomerId,
    getUserByStripeSubscriptionId,
    markStripeWebhookEventProcessed,
} from "@/lib/data/membership";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function getWebhookSecret(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }
    return secret;
}

function toDate(unixSeconds?: number | null): Date | undefined {
    return unixSeconds ? new Date(unixSeconds * 1000) : undefined;
}

function getInterval(price: Stripe.Price | null | undefined): "month" | "year" | undefined {
    const interval = price?.recurring?.interval;
    return interval === "year" || interval === "month" ? interval : undefined;
}

async function resolveUserFromEvent(event: Stripe.Event) {
    const data = event.data.object as any;

    const customerId =
        typeof data.customer === "string"
            ? data.customer
            : typeof data.customer?.id === "string"
              ? data.customer.id
              : undefined;

    const subscriptionId =
        typeof data.subscription === "string"
            ? data.subscription
            : typeof data.id === "string" && event.type.startsWith("customer.subscription.")
              ? data.id
              : undefined;

    if (subscriptionId) {
        const bySubscription = await getUserByStripeSubscriptionId(subscriptionId);
        if (bySubscription) {
            return bySubscription;
        }
    }

    if (customerId) {
        const byCustomer = await getUserByStripeCustomerId(customerId);
        if (byCustomer) {
            return byCustomer;
        }
    }

    const email =
        data.customer_details?.email ||
        data.customer_email ||
        data.receipt_email ||
        data.email ||
        data?.customer?.email;

    if (email) {
        return await getUserByEmail(email);
    }

    return null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
    const user = await resolveUserFromEvent({
        id: eventId,
        type: "checkout.session.completed",
        data: { object: session },
    } as Stripe.Event);

    if (!user?._id) {
        console.warn("Stripe checkout.session.completed: user not found");
        return;
    }

    await applyStripeMembershipUpdate({
        userId: user._id.toString(),
        stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
        stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
        stripeCheckoutSessionId: session.id,
        status: "active",
        membershipState: "active",
        membershipSource: "stripe",
        lastWebhookEventId: eventId,
    });
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string) {
    const user = await resolveUserFromEvent({
        id: eventId,
        type: "invoice.paid",
        data: { object: invoice },
    } as Stripe.Event);

    if (!user?._id) {
        console.warn("Stripe invoice.paid: user not found");
        return;
    }

    const line = invoice.lines.data[0] as any;
    const periodEnd = toDate(line?.period?.end);
    const price = line?.pricing?.price_details?.price ?? line?.price ?? null;
    const priceId = typeof price?.id === "string" ? price.id : undefined;

    await applyStripeMembershipUpdate({
        userId: user._id.toString(),
        stripeCustomerId: typeof invoice.customer === "string" ? invoice.customer : undefined,
        stripeSubscriptionId: typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : undefined,
        stripePriceId: priceId,
        status: "active",
        membershipState: "active",
        membershipSource: "stripe",
        membershipExpiresAt: periodEnd,
        stripeCurrentPeriodEnd: periodEnd,
        amount: typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : undefined,
        currency: invoice.currency || undefined,
        interval: getInterval(price),
        lastPaymentDate: new Date(),
        lastWebhookEventId: eventId,
    });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
    const user = await resolveUserFromEvent({
        id: eventId,
        type: "invoice.payment_failed",
        data: { object: invoice },
    } as Stripe.Event);

    if (!user?._id) {
        console.warn("Stripe invoice.payment_failed: user not found");
        return;
    }

    const currentExpiry =
        user.subscription?.membershipExpiresAt ||
        user.subscription?.stripeCurrentPeriodEnd ||
        user.subscription?.endsAt;

    await applyStripeMembershipUpdate({
        userId: user._id.toString(),
        stripeCustomerId: typeof invoice.customer === "string" ? invoice.customer : undefined,
        stripeSubscriptionId: typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : undefined,
        status: "past_due",
        membershipState: currentExpiry && new Date(currentExpiry) > new Date() ? "grace_period" : "past_due",
        membershipSource: "stripe",
        membershipExpiresAt: currentExpiry ? new Date(currentExpiry) : undefined,
        membershipGraceUntil: currentExpiry ? new Date(currentExpiry) : undefined,
        lastWebhookEventId: eventId,
    });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventId: string) {
    const user = await resolveUserFromEvent({
        id: eventId,
        type: "customer.subscription.updated",
        data: { object: subscription },
    } as Stripe.Event);

    if (!user?._id) {
        console.warn("Stripe customer.subscription.updated: user not found");
        return;
    }

    const price = subscription.items.data[0]?.price;
    const periodEnd = toDate((subscription as any).current_period_end);

    let membershipState: "active" | "grace_period" | "cancelled" | "past_due" | "unpaid" | "inactive" = "inactive";

    if (subscription.status === "active" || subscription.status === "trialing") {
        membershipState = "active";
    } else if (subscription.status === "past_due") {
        membershipState = periodEnd && periodEnd > new Date() ? "grace_period" : "past_due";
    } else if (subscription.status === "unpaid") {
        membershipState = "unpaid";
    } else if (subscription.status === "canceled") {
        membershipState = periodEnd && periodEnd > new Date() ? "grace_period" : "cancelled";
    }

    await applyStripeMembershipUpdate({
        userId: user._id.toString(),
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : undefined,
        stripeSubscriptionId: subscription.id,
        stripePriceId: price?.id,
        status:
            subscription.status === "canceled"
                ? "cancelled"
                : subscription.status === "trialing"
                  ? "trialing"
                  : subscription.status === "past_due"
                    ? "past_due"
                    : subscription.status === "unpaid"
                      ? "unpaid"
                      : subscription.status === "active"
                        ? "active"
                        : "inactive",
        membershipState,
        membershipSource: "stripe",
        membershipExpiresAt: periodEnd,
        stripeCurrentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        amount: typeof price?.unit_amount === "number" ? price.unit_amount / 100 : undefined,
        currency: price?.currency || undefined,
        interval: getInterval(price),
        startDate: toDate((subscription as any).start_date),
        lastWebhookEventId: eventId,
    });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string) {
    const user = await resolveUserFromEvent({
        id: eventId,
        type: "customer.subscription.deleted",
        data: { object: subscription },
    } as Stripe.Event);

    if (!user?._id) {
        console.warn("Stripe customer.subscription.deleted: user not found");
        return;
    }

    const periodEnd = toDate((subscription as any).current_period_end);
    const stillPaidThrough = periodEnd && periodEnd > new Date();

    await applyStripeMembershipUpdate({
        userId: user._id.toString(),
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : undefined,
        stripeSubscriptionId: subscription.id,
        status: "cancelled",
        membershipState: stillPaidThrough ? "grace_period" : "cancelled",
        membershipSource: "stripe",
        membershipExpiresAt: periodEnd,
        membershipGraceUntil: stillPaidThrough ? periodEnd : undefined,
        stripeCurrentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
        lastWebhookEventId: eventId,
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.text();
        const signature = req.headers.get("stripe-signature");

        if (!signature) {
            return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
        }

        const stripe = getStripe();
        const event = stripe.webhooks.constructEvent(body, signature, getWebhookSecret());

        const shouldProcess = await markStripeWebhookEventProcessed(event.id, event.type);
        if (!shouldProcess) {
            return NextResponse.json({ received: true, duplicate: true });
        }

        switch (event.type) {
            case "checkout.session.completed":
                await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id);
                break;
            case "invoice.paid":
                await handleInvoicePaid(event.data.object as Stripe.Invoice, event.id);
                break;
            case "invoice.payment_failed":
                await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event.id);
                break;
            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.id);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
                break;
            default:
                console.log(`Unhandled Stripe event type: ${event.type}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Stripe webhook error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Webhook handler failed" },
            { status: 400 },
        );
    }
}
