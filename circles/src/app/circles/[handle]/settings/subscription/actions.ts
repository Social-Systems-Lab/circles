"use server";

import { getUserPrivate } from "@/lib/data/user";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

const DONORBOX_API_KEY = process.env.DONORBOX_API_KEY;
const DONORBOX_API_URL = "https://donorbox.org/api/v1";

export async function createSubscription(circleId: string, planId: string) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("User not authenticated");
    }
    const user = await getUserPrivate(userDid);
    if (!user) {
        throw new Error("User not found");
    }

    const checkoutUrl = `https://donorbox.org/subscription/new?plan_id=${planId}&email=${encodeURIComponent(
        user.email!,
    )}&custom_fields[circleId]=${circleId}`;

    redirect(checkoutUrl);
}

export async function getSubscription(subscriptionId: string) {
    const response = await fetch(`${DONORBOX_API_URL}/subscriptions/${subscriptionId}`, {
        headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.DONORBOX_EMAIL}:${DONORBOX_API_KEY}`).toString("base64")}`,
        },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch subscription");
    }

    return response.json();
}

export async function getPlans() {
    const response = await fetch(`${DONORBOX_API_URL}/plans`, {
        headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.DONORBOX_EMAIL}:${DONORBOX_API_KEY}`).toString("base64")}`,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fetch plans:", errorText);
        throw new Error(`Failed to fetch plans: ${errorText}`);
    }

    return response.json();
}
