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

    const events = JSON.parse(body);

    try {
        for (const event of events) {
            switch (event.action) {
                case "new":
                    if (event.recurring) {
                        await handleNewSubscription(event);
                    }
                    break;
                // Add cases for other events as needed
                default:
                    console.log(`Unhandled event action: ${event.action}`);
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
        donor: { id: donorboxDonorId },
        amount,
        currency,
        donation_date: donationDate,
        questions,
    } = donation;

    const circleIdQuestion = questions.find((q: any) => q.question === "circleId");
    if (!circleIdQuestion) {
        console.error("circleId not found in custom fields");
        return;
    }
    const circleId = circleIdQuestion.answer;

    const circles = await db.collection("circles");
    await circles.updateOne(
        { _id: new ObjectId(circleId) },
        {
            $set: {
                "subscription.donorboxDonationId": donorboxDonationId,
                "subscription.donorboxDonorId": donorboxDonorId,
                "subscription.status": "active",
                "subscription.amount": parseFloat(amount),
                "subscription.currency": currency,
                "subscription.startDate": new Date(donationDate),
            },
        },
    );
}
