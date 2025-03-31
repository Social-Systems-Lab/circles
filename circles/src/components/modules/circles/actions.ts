"use server";

import { deleteCircle, getCircleById, getDefaultCircle } from "@/lib/data/circle";
import { getServerSettings } from "@/lib/data/server-settings";
import { FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";

export async function getCircleByIdAction(id: string) {
    try {
        return await getCircleById(id);
    } catch (error) {
        console.error("Error getting circle by ID:", error);
        throw new Error("Failed to get circle");
    }
}

// This is a separate action for deleting a circle
export async function deleteCircleAction(circleId: string, confirmationName: string): Promise<FormSubmitResponse> {
    try {
        // Get the circle to be deleted
        const circle = await getCircleById(circleId);
        if (!circle) {
            return {
                success: false,
                message: "Circle not found",
            };
        }

        // Check if this is the default circle (which shouldn't be deletable)
        const serverSettings = await getServerSettings();
        const defaultCircle = await getDefaultCircle(serverSettings);

        if (defaultCircle._id === circleId) {
            return {
                success: false,
                message: "Cannot delete the default circle",
            };
        }

        // Verify the confirmation name matches the circle name
        if (confirmationName !== circle.name) {
            return {
                success: false,
                message: "Confirmation name does not match circle name",
            };
        }

        // Delete the circle
        await deleteCircle(circleId);

        // Revalidate paths
        revalidatePath("/circles");
        revalidatePath(`/circles/${circle.handle}`);

        return {
            success: true,
            message: "Circle deleted successfully",
            data: { redirectTo: "/circles" },
        };
    } catch (error) {
        console.error("Error deleting circle:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "An unknown error occurred",
        };
    }
}
