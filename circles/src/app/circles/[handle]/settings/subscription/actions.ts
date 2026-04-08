"use server";

import { revalidatePath } from "next/cache";
import { getPrivateUserByDid, getUserPrivate, updateUser } from "@/lib/data/user";
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

export async function updateMissedMessageEmailSetting(enabled: boolean) {
    if (typeof enabled !== "boolean") {
        return {
            success: false,
            message: "Invalid missed-message email setting.",
        };
    }

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return {
                success: false,
                message: "You need to be logged in to update this setting.",
            };
        }

        const user = await getPrivateUserByDid(userDid);
        if (!user?._id) {
            return {
                success: false,
                message: "User not found.",
            };
        }

        await updateUser(
            {
                _id: user._id,
                emailMissedMessages: enabled,
            },
            userDid,
        );

        if (user.handle) {
            revalidatePath(`/circles/${user.handle}/settings/subscription`);
        }

        return {
            success: true,
            message: enabled
                ? "Missed-message email reminders enabled."
                : "Missed-message email reminders disabled.",
            emailMissedMessages: enabled,
        };
    } catch (error) {
        console.error("Error updating missed-message email setting:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update missed-message email setting.",
        };
    }
}
