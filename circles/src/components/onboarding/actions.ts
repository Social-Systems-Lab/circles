"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getCirclePath, updateCircle } from "@/lib/data/circle";
import { causes, skills, features } from "@/lib/data/constants";
import { getWeaviateClient } from "@/lib/data/weaviate";
import { Cause, Circle, Metrics, Skill, WithMetric } from "@/models/models";
import { revalidatePath } from "next/cache";

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

type SaveCausesActionResponse = {
    success: boolean;
    message: string;
};

export const saveCausesAction = async (
    causes: string[] | undefined,
    circleId: string,
): Promise<SaveCausesActionResponse> => {
    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            causes,
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

export const saveSkillsAction = async (
    skills: string[] | undefined,
    circleId: string,
): Promise<SaveCausesActionResponse> => {
    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            skills: skills,
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
    causes: WithMetric<Cause>[];
    message?: string;
};

export const fetchCausesByMission = async (mission: string): Promise<FetchCausesResponse> => {
    try {
        const client = await getWeaviateClient();
        if (!mission) {
            mission = "mission undefined"; // default mission statement
        }

        // Perform the vector search using `nearText` for the mission statement
        const response = await client.collections.get("Cause").query.nearText(mission, {
            limit: 100, // Adjust the limit as necessary
            returnMetadata: ["distance"], // Optional: return similarity score if needed
        });

        // Map the response to the Cause type
        const causesMatched = response.objects.map((item: any) => {
            const matchedCause = causes.find((cause: any) => cause.handle === item.properties.handle);

            const metrics: Metrics = { vibe: item.metadata?.distance ?? 1 };

            return {
                handle: item.properties.handle,
                name: item.properties.name,
                description: item.properties.description,
                picture: matchedCause?.picture ?? "",
                metrics,
            };
        });

        return { success: true, causes: causesMatched as WithMetric<Cause>[] };
    } catch (error) {
        console.error("Error fetching causes from Weaviate:", error);
        return { success: false, causes: [], message: error instanceof Error ? error.message : String(error) };
    }
};

type FetchSkillsResponse = {
    success: boolean;
    skills: WithMetric<Skill>[];
    message?: string;
};

export const fetchSkillsByProfile = async (mission: string): Promise<FetchSkillsResponse> => {
    try {
        const client = await getWeaviateClient();

        // Perform the vector search using `nearText` for the mission statement
        const response = await client.collections.get("Skill").query.nearText(mission, {
            limit: 100, // Adjust the limit as necessary
            returnMetadata: ["distance"], // Optional: return similarity score if needed
        });

        // Map the response to the Skill type
        const skillsMatched = response.objects.map((item: any) => {
            const matchedSkill = skills.find((skill: any) => skill.handle === item.properties.handle);

            const metrics: Metrics = { vibe: item.metadata?.distance ?? 1 };

            return {
                handle: item.properties.handle,
                name: item.properties.name,
                description: item.properties.description,
                picture: matchedSkill?.picture ?? "",
                metrics,
            };
        });

        return { success: true, skills: skillsMatched as WithMetric<Skill>[] };
    } catch (error) {
        console.error("Error fetching skills from Weaviate:", error);
        return { success: false, skills: [], message: error instanceof Error ? error.message : String(error) };
    }
};
