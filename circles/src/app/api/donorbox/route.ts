import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/data/db";
import { ObjectId } from "mongodb";
import { sendUserBecomesMemberNotification } from "@/lib/data/notifications";
import { getUserPrivate } from "@/lib/data/user";
import { sendEmail } from "@/lib/data/email";
import { verifyDonorboxSignature } from "@/lib/security/donorbox";

const DONORBOX_WEBHOOK_SECRET = process.env.DONORBOX_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    if (!DONORBOX_WEBHOOK_SECRET) {
        console.error("DONORBOX_WEBHOOK_SECRET is not set");
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const signatureHeader = req.headers.get("donorbox-signature");
    const body = await req.text();

    if (!verifyDonorboxSignature({ body, header: signatureHeader, secret: DONORBOX_WEBHOOK_SECRET })) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let events;
    try {
        events = JSON.parse(body);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!Array.isArray(events)) {
        events = [events];
    }

    try {
        console.log("--- Donorbox Webhook Received ---");

        for (const event of events) {
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
    const wasActive = user.accountStatus === "active";
    const now = new Date();

    const newSubSet: Record<string, unknown> = {
        isMember: true,
        isVerified: true,
        accountStatus: "active",
        "subscription.donorboxPlanId": donorboxPlanId.toString(),
        "subscription.donorboxDonationId": donorboxDonationId,
        "subscription.donorboxDonorId": donorboxDonorId,
        "subscription.status": "active",
        "subscription.amount": parseFloat(amount),
        "subscription.currency": currency,
        "subscription.startDate": new Date(donationDate),
    };
    if (!wasActive) {
        newSubSet.verifiedAt = now;
        newSubSet.verifiedBy = "system:payment";
    }

    await circles.updateOne({ _id: user._id }, { $set: newSubSet });

    if (!wasMember) {
        const userPrivate = await getUserPrivate(user.did);
        if (userPrivate) {
            await sendUserBecomesMemberNotification(userPrivate);
            await sendEmail({
                to: user.email,
                templateAlias: "new-member-welcome",
                templateModel: {
                    name: user.name,
                    action_url: process.env.CIRCLES_URL || "http://localhost:3000",
                },
            });
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
    const wasActive = user.accountStatus === "active";
    const isNowMember = status === "active";
    const now = new Date();

    const planUpdateSet: Record<string, unknown> = {
        isMember: isNowMember,
        isVerified: isNowMember,
        "subscription.status": status,
        "subscription.lastPaymentDate": new Date(lastDonationDate),
    };
    if (isNowMember) {
        planUpdateSet.accountStatus = "active";
        if (!wasActive) {
            planUpdateSet.verifiedAt = now;
            planUpdateSet.verifiedBy = "system:payment";
        }
    }
    await circles.updateOne({ _id: user._id }, { $set: planUpdateSet });

    if (isNowMember && !wasMember) {
        const userPrivate = await getUserPrivate(user.did);
        if (userPrivate) {
            await sendUserBecomesMemberNotification(userPrivate);
            await sendEmail({
                to: user.email,
                templateAlias: "new-member-welcome",
                templateModel: {
                    name: user.name,
                    action_url: process.env.CIRCLES_URL || "http://localhost:3000",
                },
            });
        }
    }
}
