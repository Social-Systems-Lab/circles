"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCirclePath, updateCircle } from "@/lib/data/circle";
import { causes, features } from "@/lib/data/constants";
import { getWeaviateClient } from "@/lib/data/weaviate";
import { Circle } from "@/models/models";
import { revalidatePath } from "next/cache";
import { Cause } from "./onboarding";

type SaveMissionActionResponse = {
    success: boolean;
    message: string;
};

export const saveMissionAction = async (mission: string, circleId: string): Promise<SaveMissionActionResponse> => {
    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            mission,
        };

        // check if user is authorized to edit circle settings
        const userDid = await getAuthenticatedUserDid();
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        await updateCircle(circle);

        // clear page cache so pages update
        let circlePath = await getCirclePath(circle);
        revalidatePath(circlePath); // revalidate home page

        // experiment with weaviate
        let client = await getWeaviateClient();
        console.log("client", client);

        return { success: true, message: "Circle settings saved successfully" };
    } catch (error) {
        console.log("error", error);
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle settings. " + error };
        }
    }
};

type FetchCausesResponse = {
    success: boolean;
    causes: Cause[];
    message?: string;
};

export const fetchCausesByMission = async (mission: string): Promise<FetchCausesResponse> => {
    try {
        const client = await getWeaviateClient();

        // Perform the vector search using `nearText` for the mission statement
        const response = await client.collections.get("Cause").query.nearText(mission, {
            limit: 100, // Adjust the limit as necessary
            returnMetadata: ["distance"], // Optional: return similarity score if needed
        });

        // Map the response to the Cause type
        const causesMatched = response.objects.map((item: any) => {
            const matchedCause = causes.find((cause: any) => cause.handle === item.properties.handle);
            return {
                handle: item.properties.handle,
                name: item.properties.name,
                description: item.properties.description,
                picture: matchedCause?.picture ?? "",
            };
        });

        return { success: true, causes: causesMatched as Cause[] };
    } catch (error) {
        console.error("Error fetching causes from Weaviate:", error);
        return { success: false, causes: [], message: error instanceof Error ? error.message : String(error) };
    }
};
