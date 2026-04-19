import { ObjectId } from "mongodb";
import { Circles, StripeWebhookEvents } from "@/lib/data/db";
import { getPrivateUserByDid } from "@/lib/data/user";
import { getStripe } from "@/lib/stripe";

type MembershipState = "inactive" | "active" | "grace_period" | "cancelled" | "past_due" | "unpaid";

type ApplyStripeMembershipUpdateInput = {
    userId: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    stripeCheckoutSessionId?: string;
    status?: "active" | "inactive" | "cancelled" | "past_due" | "unpaid" | "trialing";
    membershipState: MembershipState;
    membershipSource?: "stripe" | "manual" | "admin";
    membershipExpiresAt?: Date;
    membershipGraceUntil?: Date;
    stripeCurrentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    amount?: number;
    currency?: string;
    interval?: "month" | "year";
    startDate?: Date;
    lastPaymentDate?: Date;
    lastWebhookEventId?: string;
};

export async function getUserByStripeCustomerId(stripeCustomerId: string) {
    return await Circles.findOne({
        circleType: "user",
        "subscription.stripeCustomerId": stripeCustomerId,
    });
}

export async function getUserByStripeSubscriptionId(stripeSubscriptionId: string) {
    return await Circles.findOne({
        circleType: "user",
        "subscription.stripeSubscriptionId": stripeSubscriptionId,
    });
}

export async function getUserByEmail(email: string) {
    return await Circles.findOne({
        circleType: "user",
        email,
    });
}

export async function applyStripeMembershipUpdate(input: ApplyStripeMembershipUpdateInput) {
    const isActiveMember = input.membershipState === "active" || input.membershipState === "grace_period";

    await Circles.updateOne(
        { _id: new ObjectId(input.userId), circleType: "user" as any },
        {
            $set: {
                isMember: isActiveMember,
                isVerified: isActiveMember,
                "subscription.provider": "stripe",
                "subscription.stripeCustomerId": input.stripeCustomerId,
                "subscription.stripeSubscriptionId": input.stripeSubscriptionId,
                "subscription.stripePriceId": input.stripePriceId,
                "subscription.stripeCheckoutSessionId": input.stripeCheckoutSessionId,
                "subscription.status": input.status,
                "subscription.membershipState": input.membershipState,
                "subscription.membershipSource": input.membershipSource || "stripe",
                "subscription.membershipExpiresAt": input.membershipExpiresAt,
                "subscription.membershipGraceUntil": input.membershipGraceUntil,
                "subscription.stripeCurrentPeriodEnd": input.stripeCurrentPeriodEnd,
                "subscription.cancelAtPeriodEnd": input.cancelAtPeriodEnd,
                "subscription.amount": input.amount,
                "subscription.currency": input.currency,
                "subscription.interval": input.interval,
                "subscription.startDate": input.startDate,
                "subscription.lastPaymentDate": input.lastPaymentDate,
                "subscription.lastWebhookEventId": input.lastWebhookEventId,
            },
        },
    );
}

export async function markStripeWebhookEventProcessed(eventId: string, eventType: string) {
    const result = await StripeWebhookEvents.updateOne(
        { eventId },
        {
            $setOnInsert: {
                eventId,
                eventType,
                processedAt: new Date(),
            },
        },
        { upsert: true },
    );

    return Boolean(result.upsertedCount);
}

export async function findOrCreateStripeCustomerForUser(userDid: string) {
    const user = await getPrivateUserByDid(userDid);
    if (!user?._id) {
        throw new Error("User not found");
    }
    if (!user.email) {
        throw new Error("User does not have an email address");
    }

    if (user.subscription?.stripeCustomerId) {
        return {
            user,
            customerId: user.subscription.stripeCustomerId,
        };
    }

    const stripe = getStripe();
    const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
            userDid: user.did || "",
            userId: user._id,
            handle: user.handle || "",
        },
    });

    await Circles.updateOne(
        { _id: new ObjectId(user._id), circleType: "user" as any },
        {
            $set: {
                "subscription.provider": "stripe",
                "subscription.stripeCustomerId": customer.id,
                "subscription.membershipSource": "stripe",
            },
        },
    );

    return {
        user,
        customerId: customer.id,
    };
}
