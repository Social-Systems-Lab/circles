"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { countCirclesAndUsers, getCirclePath, updateCircle } from "@/lib/data/circle";
import { causes, skills, features } from "@/lib/data/constants";
import { getUserByDid, getUserByHandle } from "@/lib/data/user";
import { getQdrantClient, getVbdCircleById } from "@/lib/data/vdb";
import { Cause, Circle, Metrics, MissionDisplay, PlatformMetrics, Skill, WithMetric } from "@/models/models";
import { revalidatePath } from "next/cache";

type SaveMissionActionResponse = {
    success: boolean;
    message: string;
};

export const saveMissionAction = async (mission: string, circleId: string): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            mission,
        };

        // check if user is authorized to edit circle settings
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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            causes,
        };

        // check if user is authorized to edit circle settings
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
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            skills: skills,
        };

        // check if user is authorized to edit circle settings
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

export const fetchCausesMatchedToCircle = async (circleId: string): Promise<FetchCausesResponse> => {
    try {
        const client = await getQdrantClient();

        // Get the circle by ID (using the `retrieve` method)
        const circleObject = await getVbdCircleById(circleId);
        if (!circleObject || !circleObject.vector) {
            // Return all causes if no circle vector is found
            return { success: true, causes: causes as WithMetric<Cause>[] };
        }

        const circleVector = circleObject.vector as number[];

        // Perform the search for causes near the circle's vector
        const response = await client.search("causes", {
            vector: circleVector,
            limit: 100,
        });

        // Map the response to the Cause type
        const causesMatched: WithMetric<Cause>[] = response.map((item: any) => {
            const matchedCause = causes.find((cause: any) => cause.name === item.payload.name); // TODO fix so we store handle in db
            const metrics: Metrics = { similarity: item.score ?? 1 }; // Use the score as the "similarity" metric

            return {
                handle: matchedCause?.handle,
                name: item.payload.name,
                description: item.payload.description,
                picture: matchedCause?.picture ?? "",
                metrics,
            } as WithMetric<Cause>;
        });

        if (causesMatched.length === 0) {
            return { success: true, causes: causes as WithMetric<Cause>[] };
        }

        return { success: true, causes: causesMatched as WithMetric<Cause>[] };
    } catch (error) {
        console.error("Error fetching causes:", error);
        return { success: true, causes: causes as WithMetric<Cause>[] };
    }
};
type FetchSkillsResponse = {
    success: boolean;
    skills: WithMetric<Skill>[];
    message?: string;
};
export const fetchSkillsMatchedToCircle = async (circleId: string): Promise<FetchSkillsResponse> => {
    try {
        const client = await getQdrantClient();

        // Get the circle by ID (using the `retrieve` method)
        const circleObject = await getVbdCircleById(circleId);
        if (!circleObject || !circleObject.vector) {
            return { success: true, skills: skills as WithMetric<Skill>[] };
        }

        const circleVector = circleObject.vector as number[];

        // Perform the search for skills near the circle's vector
        const response = await client.search("skills", {
            vector: circleVector,
            limit: 100,
        });

        // Map the response to the Skill type
        const skillsMatched: WithMetric<Skill>[] = response.map((item: any) => {
            const matchedSkill = skills.find((skill: any) => skill.name === item.payload.name); // TODO fix so we store handle in db
            const metrics: Metrics = { similarity: item.score ?? 1 }; // Use the score as the "similarity" metric

            return {
                handle: matchedSkill?.handle,
                name: item.payload.name,
                description: item.payload.description,
                picture: matchedSkill?.picture ?? "",
                metrics,
            } as WithMetric<Skill>;
        });

        if (skillsMatched.length === 0) {
            return { success: true, skills: skills as WithMetric<Cause>[] };
        }

        return { success: true, skills: skillsMatched as WithMetric<Skill>[] };
    } catch (error) {
        console.error("Error fetching skills:", error);
        return { success: false, skills: [], message: error instanceof Error ? error.message : String(error) };
    }
};

type FetchMissionStatementsResponse = {
    success: boolean;
    missions: MissionDisplay[];
    message?: string;
};

// Action to save profile info (description and content) and mark the step complete
export const saveProfileAction = async (
    description: string,
    content: string,
    circleId: string,
): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit profile" };
    }

    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            description,
            content,
        };

        // Check if user is authorized to edit circle settings
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit profile" };
        }

        // Add profile step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("profile")) {
            circle.completedOnboardingSteps.push("profile");
        }

        await updateCircle(circle);

        // Clear page cache so pages update
        let circlePath = await getCirclePath(circle);
        revalidatePath(circlePath);

        return { success: true, message: "Profile saved successfully" };
    } catch (error) {
        console.log("error", error);
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save profile. " + error };
        }
    }
};

// Action to save location and mark the step complete
export const saveLocationAction = async (location: any, circleId: string): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to set location" };
    }

    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            location,
        };

        // Check if user is authorized to edit circle settings
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings_edit);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit location" };
        }

        // Add location step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("location")) {
            circle.completedOnboardingSteps.push("location");
        }

        await updateCircle(circle);

        // Clear page cache so pages update
        let circlePath = await getCirclePath(circle);
        revalidatePath(circlePath);

        return { success: true, message: "Location saved successfully" };
    } catch (error) {
        console.log("error", error);
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save location. " + error };
        }
    }
};

// Mark welcome step as completed
export const completeWelcomeStep = async (circleId: string): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        // Add welcome step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        let circle: Partial<Circle> = {
            _id: circleId,
            completedOnboardingSteps: user.completedOnboardingSteps ?? [],
        };

        if (!circle.completedOnboardingSteps?.includes("welcome")) {
            circle.completedOnboardingSteps?.push("welcome");
        }

        await updateCircle(circle);
        return { success: true, message: "Welcome step completed" };
    } catch (error) {
        console.log("error", error);
        return { success: false, message: "Failed to update step status" };
    }
};

// Mark final step as completed
export const completeFinalStep = async (circleId: string): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        // Add final step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        let circle: Partial<Circle> = {
            _id: circleId,
            completedOnboardingSteps: user.completedOnboardingSteps ?? [],
        };

        if (!circle.completedOnboardingSteps?.includes("final")) {
            circle.completedOnboardingSteps?.push("final");
        }

        await updateCircle(circle);
        return { success: true, message: "Final step completed" };
    } catch (error) {
        console.log("error", error);
        return { success: false, message: "Failed to update step status" };
    }
};

export const fetchMissionStatements = async (circleId: string): Promise<FetchMissionStatementsResponse> => {
    try {
        const client = await getQdrantClient();

        // Get the circle by ID (using the `retrieve` method)
        const circleObject = await getVbdCircleById(circleId);
        if (!circleObject || !circleObject.vector) {
            return { success: true, missions: [] };
        }

        const circleVector = circleObject.vector as number[];

        // Perform the search for missions near the circle's vector
        const response = await client.search("circles", {
            vector: circleVector,
            limit: 30,
        });

        const missionsMatched: WithMetric<MissionDisplay>[] = [];
        for (const item of response) {
            const metrics: Metrics = { similarity: item.score ?? 0 };
            if (!item.payload?.mission || (item.payload.mission as string).length <= 25) {
                continue;
            }

            // Get user picture (using the handle from the payload)
            const user = await getUserByHandle(item.payload.handle as string);

            missionsMatched.push({
                name: item.payload.name,
                picture: user?.picture?.url ?? "",
                mission: item.payload.mission,
                metrics,
            } as WithMetric<MissionDisplay>);
        }

        return { success: true, missions: missionsMatched as WithMetric<MissionDisplay>[] };
    } catch (error) {
        console.error("Error fetching mission statements:", error);
        return { success: false, missions: [], message: error instanceof Error ? error.message : String(error) };
    }
};
