"use server";

import { getCircleById } from "@/lib/data/circle";
import { followCircle, cancelFollowRequest } from "@/components/modules/home/actions";
import { revalidatePath } from "next/cache";

/**
 * Server action: Request membership for a circle.
 * Accepts a FormData with a 'circleId' field.
 * Wraps followCircle to either auto-join public circles or create a pending request for private circles.
 */
export async function requestMembershipAction(formData: FormData) {
    const circleId = (formData.get("circleId") as string) ?? "";
    const redirectTo = (formData.get("redirectTo") as string) ?? "";
    try {
        if (!circleId) {
            return { success: false, message: "Missing circleId" };
        }
        const circle = await getCircleById(circleId);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }
        const res = await followCircle(circle);
        // Revalidate circle path if needed
        if (redirectTo) {
            try {
                await revalidatePath(redirectTo);
            } catch {}
        }
        return res;
    } catch (e: any) {
        return { success: false, message: e?.message || "Failed to request membership" };
    }
}

/**
 * Server action: Cancel a pending membership request for a circle.
 * Accepts a FormData with a 'circleId' field.
 */
export async function cancelMembershipRequestAction(formData: FormData) {
    const circleId = (formData.get("circleId") as string) ?? "";
    const redirectTo = (formData.get("redirectTo") as string) ?? "";
    try {
        if (!circleId) {
            return { success: false, message: "Missing circleId" };
        }
        const circle = await getCircleById(circleId);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }
        const res = await cancelFollowRequest(circle);
        if (redirectTo) {
            try {
                await revalidatePath(redirectTo);
            } catch {}
        }
        return res;
    } catch (e: any) {
        return { success: false, message: e?.message || "Failed to cancel membership request" };
    }
}
