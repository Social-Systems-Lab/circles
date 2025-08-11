"use server";

import { Circle, FormSubmitResponse, ServerSettings } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { Circles } from "@/lib/data/db";
import { getServerSettings, updateServerSettings } from "@/lib/data/server-settings";
import { upsertVdbCollections } from "@/lib/data/vdb";

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
        const user = await Circles.findOne({ did: userDid });
        if (!user?.isAdmin) {
            return { success: false, message: "You are not authorized to edit server settings" };
        }

        let serverSettings: ServerSettings = {
            name: values.name,
            description: values.description,
            url: values.url,
            registryUrl: values.registryUrl,
            jwtSecret: values.jwtSecret,
            openaiKey: values.openaiKey,
            mapboxKey: values.mapboxKey,
        };

        // get current server settings
        let currentServerSettings = await getServerSettings();

        let appVersion = process.env.version;
        // upsert embeddings if versions differ
        if (serverSettings.serverVersion !== appVersion) {
            console.log("Server version and app version differ, doing intitialization logic");

            // update server version
            serverSettings.serverVersion = appVersion;

            // upsert causes and skills
            //console.log("Upserting causes and skills");
            //await upsertCausesAndSkills();

            try {
                console.log("Upserting embeddings");
                await upsertVdbCollections();
            } catch (error) {
                console.log("Failed to upsert embeddings", error);
            }
        }

        // save server settings
        await updateServerSettings(serverSettings);

        return {
            success: true,
            message: "Server settings updated successfully",
        };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle server settings. " + JSON.stringify(error) };
        }
    }
}
