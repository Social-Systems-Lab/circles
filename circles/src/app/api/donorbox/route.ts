import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/data/db";
import { ObjectId } from "mongodb";

const DONORBOX_WEBHOOK_SECRET = process.env.DONORBOX_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    if (!DONORBOX_WEBHOOK_SECRET) {
        console.error("DONORBOX_WEBHOOK_SECRET is not set");
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const signature = req.headers.get("x-donorbox-signature");
    const body = await req.text();

    const expectedSignature = crypto.createHmac("sha256", DONORBOX_WEBHOOK_SECRET).update(body).digest("hex");

    if (signature !== expectedSignature) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);

    try {
        switch (event.type) {
            case "subscription.updated":
                await handleSubscriptionUpdated(event.data);
                break;
            case "subscription.cancelled":
                await handleSubscriptionCancelled(event.data);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    } catch (error) {
        console.error("Error processing webhook:", error);
        return NextResponse.json({ error: "Error processing webhook" }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
}

async function handleSubscriptionUpdated(subscription: any) {
    const {
        id: donorboxSubscriptionId,
        plan_id: donorboxPlanId,
        status,
        ends_at: endsAt,
        amount,
        supporter: { custom_fields },
    } = subscription;
    const circleId = custom_fields.find((field: any) => field.name === "circleId")?.value;

    if (!circleId) {
        console.error("circleId not found in custom fields");
        return;
    }

    const circles = await db.collection("circles");
    await circles.updateOne(
        { _id: new ObjectId(circleId) },
        {
            $set: {
                "subscription.donorboxPlanId": donorboxPlanId,
                "subscription.donorboxSubscriptionId": donorboxSubscriptionId,
                "subscription.status": status,
                "subscription.endsAt": endsAt ? new Date(endsAt) : null,
                "subscription.amount": parseFloat(amount),
            },
        },
    );
}

async function handleSubscriptionCancelled(subscription: any) {
    const {
        id: donorboxSubscriptionId,
        supporter: { custom_fields },
    } = subscription;
    const circleId = custom_fields.find((field: any) => field.name === "circleId")?.value;

    if (!circleId) {
        console.error("circleId not found in custom fields");
        return;
    }

    const circles = await db.collection("circles");
    await circles.updateOne(
        { _id: new ObjectId(circleId) },
        {
            $set: {
                "subscription.status": "cancelled",
            },
        },
    );
}
