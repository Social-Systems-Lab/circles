"use server";

import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";

export async function saveServerSettings(values: {
    name?: string;
    description?: string;
    url?: string;
    registryUrl?: string;
    jwtSecret?: string;
    openaiKey?: string;
    mapboxKey?: string;
}): Promise<FormSubmitResponse> {
    console.log("Saving server settings with values", values);

    // check if user is authorized to edit server settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit server settings" };
    }

    try {
        // Check if user is admin
        const user = await getCircleById(userDid);
        if (!user?.isAdmin) {
            return { success: false, message: "You are not authorized to edit server settings" };
        }

        // Create server settings object
        let serverSettings = {
            name: values.name,
            description: values.description,
            url: values.url,
            registryUrl: values.registryUrl,
            jwtSecret: values.jwtSecret,
            openaiKey: values.openaiKey,
            mapboxKey: values.mapboxKey,
        };

        // Update server settings
        // Note: This is a placeholder - you'll need to implement the actual server settings update
        // await updateServerSettings(serverSettings);

        // Revalidate the path
        revalidatePath(`/settings/server-settings`);

        return { success: true, message: "Server settings updated successfully" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle server settings. " + JSON.stringify(error) };
        }
    }
}
