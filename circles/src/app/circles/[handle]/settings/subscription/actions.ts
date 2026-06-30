"use server";

import { revalidatePath } from "next/cache";
import { getPrivateUserByDid, getUserPrivate, updateUser } from "@/lib/data/user";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import {
    createTelegramConnectToken,
    disconnectTelegramChannelForUser,
    isTelegramPrivacyMode,
    updateTelegramChannelPrivacyMode,
} from "@/lib/data/external-notification-channels";

const DONORBOX_API_KEY = process.env.DONORBOX_API_KEY;
const DONORBOX_API_URL = "https://donorbox.org/api/v1";
const emailPreferenceLabels = {
    emailMissedMessages: "Missed-message digest emails",
    emailTaskAssigned: "Task assignment digest emails",
    emailTaskUpdates: "Task update digest emails",
    emailVerificationUpdates: "Verification update digest emails",
} as const;

type EmailPreferenceKey = keyof typeof emailPreferenceLabels;

const getTelegramSettingsPath = (handle?: string) => (handle ? `/circles/${handle}/settings/subscription` : undefined);

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

export async function updateEmailPreferenceSetting(preference: EmailPreferenceKey, enabled: boolean) {
    if (!(preference in emailPreferenceLabels) || typeof enabled !== "boolean") {
        return {
            success: false,
            message: "Invalid email preference setting.",
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
                [preference]: enabled,
            },
            userDid,
        );

        if (user.handle) {
            revalidatePath(`/circles/${user.handle}/settings/subscription`);
        }

        return {
            success: true,
            message: `${emailPreferenceLabels[preference]} ${enabled ? "enabled" : "disabled"}.`,
            preference,
            enabled,
        };
    } catch (error) {
        console.error("Error updating email preference setting:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update email preference setting.",
        };
    }
}

export async function createTelegramConnectLink() {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to connect Telegram." };
        }

        const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
        if (!botUsername) {
            return { success: false, message: "Telegram bot username is not configured." };
        }

        const token = await createTelegramConnectToken(userDid);
        return {
            success: true,
            url: `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`,
        };
    } catch (error) {
        console.error("Error creating Telegram connect link:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to create Telegram connect link.",
        };
    }
}

export async function disconnectTelegramNotifications() {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to disconnect Telegram." };
        }

        const user = await getPrivateUserByDid(userDid);
        await disconnectTelegramChannelForUser(userDid);

        const path = getTelegramSettingsPath(user?.handle);
        if (path) revalidatePath(path);

        return { success: true, message: "Telegram notifications disconnected." };
    } catch (error) {
        console.error("Error disconnecting Telegram notifications:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to disconnect Telegram notifications.",
        };
    }
}

export async function updateTelegramPrivacyMode(mode: unknown) {
    if (!isTelegramPrivacyMode(mode)) {
        return { success: false, message: "Invalid Telegram privacy mode." };
    }

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to update Telegram settings." };
        }

        const user = await getPrivateUserByDid(userDid);
        await updateTelegramChannelPrivacyMode(userDid, mode);

        const path = getTelegramSettingsPath(user?.handle);
        if (path) revalidatePath(path);

        return { success: true, message: "Telegram privacy setting updated.", mode };
    } catch (error) {
        console.error("Error updating Telegram privacy mode:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update Telegram privacy setting.",
        };
    }
}
