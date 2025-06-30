import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/data/db";
import { ObjectId } from "mongodb";
import { sendUserBecomesMemberNotification } from "@/lib/data/notifications";
import { getUserPrivate } from "@/lib/data/user";

const DONORBOX_WEBHOOK_SECRET = process.env.DONORBOX_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    if (!DONORBOX_WEBHOOK_SECRET) {
        console.error("DONORBOX_WEBHOOK_SECRET is not set");
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const signatureHeader = req.headers.get("donorbox-signature");
    if (!signatureHeader) {
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const [timestamp, signature] = signatureHeader.split(",");
    const body = await req.text();

    const expectedSignature = crypto
        .createHmac("sha256", DONORBOX_WEBHOOK_SECRET)
        .update(`${timestamp}.${body}`)
        .digest("hex");

    if (signature !== expectedSignature) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let events = JSON.parse(body);
    if (!Array.isArray(events)) {
        events = [events];
    }

    try {
        console.log("--- Donorbox Webhook Received ---");
        console.log("Payload:", JSON.stringify(events, null, 2));

        for (const event of events) {
            console.log("Processing event:", JSON.stringify(event, null, 2));

            // A new subscription should be a recurring donation.
            if (event.event_name === "donation.created" && event.donation?.recurring === true) {
                console.log("Detected a recurring donation. Handling as a new subscription.");
                await handleNewSubscription(event.donation);
            } else if (event.event_name === "plan.updated") {
                console.log("Detected a plan update. Handling as a subscription update.");
                await handlePlanUpdate(event.plan);
            } else if (event.event_name === "plan.created") {
                console.log("Detected a plan creation. Handling as a subscription update.");
                await handlePlanUpdate(event.plan);
            } else {
                console.log(`Unhandled event: ${event.event_name}. Skipping.`);
            }
        }
    } catch (error) {
        console.error("Error processing webhook:", error);
        return NextResponse.json({ error: "Error processing webhook" }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
}

async function handleNewSubscription(donation: any) {
    const {
        id: donorboxDonationId,
        donor: { id: donorboxDonorId, email },
        amount,
        currency,
        donation_date: donationDate,
        plan_id: donorboxPlanId,
    } = donation;

    const circles = await db.collection("circles");
    const user = await circles.findOne({ email: email, circleType: "user" });

    if (!user) {
        console.error(`User with email ${email} not found.`);
        return;
    }

    console.log(`Found user ${user.name} (${user._id}) for subscription update.`);

    const wasMember = user.isMember;

    await circles.updateOne(
        { _id: user._id },
        {
            $set: {
                isMember: true,
                isVerified: true,
                "subscription.donorboxPlanId": donorboxPlanId.toString(),
                "subscription.donorboxDonationId": donorboxDonationId,
                "subscription.donorboxDonorId": donorboxDonorId,
                "subscription.status": "active",
                "subscription.amount": parseFloat(amount),
                "subscription.currency": currency,
                "subscription.startDate": new Date(donationDate),
            },
        },
    );

    if (!wasMember) {
        const userPrivate = await getUserPrivate(user.did);
        if (userPrivate) {
            await sendUserBecomesMemberNotification(userPrivate);
        }
    }
}

async function handlePlanUpdate(plan: any) {
    const {
        donor: { email },
        status,
        last_donation_date: lastDonationDate,
    } = plan;

    const circles = await db.collection("circles");
    const user = await circles.findOne({ email: email, circleType: "user" });

    if (!user) {
        console.error(`User with email ${email} not found for plan update.`);
        return;
    }

    console.log(`Found user ${user.name} (${user._id}) for plan update.`);

    const wasMember = user.isMember;
    const isNowMember = status === "active";

    await circles.updateOne(
        { _id: user._id },
        {
            $set: {
                isMember: isNowMember,
                isVerified: isNowMember,
                "subscription.status": status,
                "subscription.lastPaymentDate": new Date(lastDonationDate),
            },
        },
    );

    if (isNowMember && !wasMember) {
        const userPrivate = await getUserPrivate(user.did);
        if (userPrivate) {
            await sendUserBecomesMemberNotification(userPrivate);
        }
    }
}
