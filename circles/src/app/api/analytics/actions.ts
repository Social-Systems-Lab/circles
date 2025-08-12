"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";

export async function trackEvent(eventName: string, properties: Record<string, any>) {
    try {
        const userDid = await getAuthenticatedUserDid();
        console.log("Analytics event:", eventName, {
            userDid,
            ...properties,
        });
    } catch (error) {
        console.error("Error tracking event:", error);
    }
}
