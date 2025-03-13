"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserByDid, updateUser } from "@/lib/data/user";

export interface IgnoreCircleResult {
    success: boolean;
    message?: string;
}

export async function ignoreCircle(circleId: string): Promise<IgnoreCircleResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "Not authenticated" };
        }

        const user = await getUserByDid(userDid);
        if (!user) {
            return { success: false, message: "User not found" };
        }

        // Initialize ignoredCircles if it doesn't exist
        const ignoredCircles = user.ignoredCircles || [];

        // Check if the circle is already ignored
        if (ignoredCircles.includes(circleId)) {
            return { success: true, message: "Circle already ignored" };
        }

        // Add circle to ignored list
        ignoredCircles.push(circleId);

        // Update user with new ignoredCircles list
        await updateUser({ _id: user._id, ignoredCircles });

        revalidatePath("/");

        return { success: true };
    } catch (error) {
        console.error("Error ignoring circle:", error);
        return {
            success: false,
            message: `Error ignoring circle: ${(error as Error).message}`,
        };
    }
}

export async function unignoreCircle(circleId: string): Promise<IgnoreCircleResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "Not authenticated" };
        }

        const user = await getUserByDid(userDid);
        if (!user) {
            return { success: false, message: "User not found" };
        }

        // Check if ignoredCircles exists
        if (!user.ignoredCircles) {
            return { success: true, message: "No ignored circles" };
        }

        // Filter out the circleId from ignoredCircles
        const updatedIgnoredCircles = user.ignoredCircles.filter((id) => id !== circleId);

        // Update user with new ignoredCircles list
        await updateUser({ _id: user._id, ignoredCircles: updatedIgnoredCircles });

        revalidatePath("/");

        return { success: true };
    } catch (error) {
        console.error("Error removing circle from ignored list:", error);
        return {
            success: false,
            message: `Error removing circle from ignored list: ${(error as Error).message}`,
        };
    }
}
