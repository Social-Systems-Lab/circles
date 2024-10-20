"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { countCirclesAndUsers, getCirclePath, updateCircle } from "@/lib/data/circle";
import { causes, skills, features } from "@/lib/data/constants";
import { getUserByDid, getUserByHandle } from "@/lib/data/user";
import { getWeaviateClient } from "@/lib/data/weaviate";
import { Cause, Circle, Metrics, MissionDisplay, PlatformMetrics, Skill, WithMetric } from "@/models/models";
import { revalidatePath } from "next/cache";
import { generateUuid5 } from "weaviate-client";

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

        // add mission step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("mission")) {
            circle.completedOnboardingSteps.push("mission");
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

export const getPlatformMetrics = async (): Promise<PlatformMetrics> => {
    // get number of circles and users on the platform
    return await countCirclesAndUsers();
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

        // add causes step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("causes")) {
            circle.completedOnboardingSteps.push("causes");
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

        // add skills step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("skills")) {
            circle.completedOnboardingSteps.push("skills");
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

export const fetchCausesMatchedToCircle = async (circleHandle: string): Promise<FetchCausesResponse> => {
    try {
        const client = await getWeaviateClient();
        const collection = client.collections.get("Causes");

        // get source circle vector
        let circleUuid = generateUuid5("Circle", circleHandle);
        const circleObject = await client.collections.get("Circle").query.fetchObjectById(circleUuid, {
            includeVector: true,
        });

        const circleVector = circleObject?.vectors.default;
        if (!circleVector) {
            // return all causes if no circle vector
            return { success: true, causes: causes as WithMetric<Cause>[] };
        }

        let causesMatched: WithMetric<Cause>[] = [];

        const response = await collection.query.nearVector(circleVector, {
            limit: 100,
            returnMetadata: ["distance"],
        });

        // Map the response to the Cause type
        causesMatched = response.objects.map((item: any) => {
            const matchedCause = causes.find((cause: any) => cause.handle === item.properties.handle);

            const metrics: Metrics = { vibe: item.metadata?.distance ?? 1 };

            return {
                handle: item.properties.handle,
                name: item.properties.name,
                description: item.properties.description,
                picture: matchedCause?.picture ?? "",
                metrics,
            } as WithMetric<Cause>;
        });

        return { success: true, causes: causesMatched as WithMetric<Cause>[] };
    } catch (error) {
        console.error("Error fetching causes from Weaviate:", error);
        return { success: true, causes: causes as WithMetric<Cause>[] };
    }
};

type FetchSkillsResponse = {
    success: boolean;
    skills: WithMetric<Skill>[];
    message?: string;
};

export const fetchSkillsMatchedToCircle = async (circleHandle: string): Promise<FetchSkillsResponse> => {
    try {
        const client = await getWeaviateClient();

        let circleUuid = generateUuid5("Circle", circleHandle);
        const circleObject = await client.collections.get("Circle").query.fetchObjectById(circleUuid, {
            includeVector: true,
        });
        const circleVector = circleObject?.vectors.default;

        let skillsMatched: WithMetric<Skill>[] = [];
        if (circleVector) {
            const response = await client.collections.get("Skills").query.nearVector(circleVector, {
                returnMetadata: ["distance"],
            });

            // Map the response to the Skill type
            skillsMatched = response.objects.map((item: any) => {
                const matchedSkill = skills.find((skill: any) => skill.handle === item.properties.handle);

                const metrics: Metrics = { vibe: item.metadata?.distance ?? 1 };

                return {
                    handle: item.properties.handle,
                    name: item.properties.name,
                    description: item.properties.description,
                    picture: matchedSkill?.picture ?? "",
                    metrics,
                } as WithMetric<Skill>;
            });
        } else {
            skillsMatched = skills;
        }

        return { success: true, skills: skillsMatched as WithMetric<Skill>[] };
    } catch (error) {
        console.error("Error fetching skills from Weaviate:", error);
        return { success: false, skills: [], message: error instanceof Error ? error.message : String(error) };
    }
};

type FetchMissionStatementsResponse = {
    success: boolean;
    missions: MissionDisplay[];
    message?: string;
};

export const fetchMissionStatements = async (circleHandle: string): Promise<FetchMissionStatementsResponse> => {
    try {
        const client = await getWeaviateClient();

        let circleUuid = generateUuid5("Circle", circleHandle);
        const circleObject = await client.collections.get("Circle").query.fetchObjectById(circleUuid, {
            includeVector: true,
        });
        const circleVector = circleObject?.vectors.default;

        let missionsMatched: WithMetric<MissionDisplay>[] = [];
        if (!circleVector) {
            return { success: true, missions: [] };
        }
        const response = await client.collections.get("Circle").query.nearVector(circleVector, {
            limit: 30,
            returnMetadata: ["distance"],
        });

        for (const item of response.objects) {
            const metrics: Metrics = { vibe: item.metadata?.distance ?? 1 };
            if (item.properties.mission === undefined || (item.properties.mission as string)?.length <= 25) {
                continue;
            }

            // get user picture
            const user = await getUserByHandle(item.properties.handle as string);

            missionsMatched.push({
                name: item.properties.name,
                picture: user?.picture?.url ?? "",
                mission: item.properties.mission,
                metrics,
            } as WithMetric<MissionDisplay>);
        }

        return { success: true, missions: missionsMatched as WithMetric<MissionDisplay>[] };
    } catch (error) {
        console.error("Error fetching mission statements from Weaviate:", error);
        return { success: false, missions: [], message: error instanceof Error ? error.message : String(error) };
    }
};
