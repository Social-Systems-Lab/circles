"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { countCirclesAndUsers, getCirclePath, updateCircle, getCircleById } from "@/lib/data/circle"; // Added getCircleById
import { features } from "@/lib/data/constants";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { getUserByDid, getUserByHandle } from "@/lib/data/user";
import { getQdrantClient, getVbdCircleById } from "@/lib/data/vdb";
import {
    Cause as SDG,
    Circle,
    DonationIntent,
    FileInfo,
    Media,
    Metrics,
    MissionDisplay,
    PlatformMetrics,
    Skill,
    WithMetric,
} from "@/models/models"; // Added Media, FileInfo
import { ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import ImageItem
import { revalidatePath } from "next/cache";
import { isFile } from "@/lib/data/storage";
import {
    canRetainSubmittedCircleMediaUrl,
    collectReplacedCircleMedia,
    persistCircleThenCleanupMedia,
    saveCircleOwnedFile,
} from "@/lib/data/circle-media-storage";
import { updateDonationIntent } from "@/lib/data/user";

type SaveMissionActionResponse = {
    success: boolean;
    message: string;
};

type SaveDonationIntentActionInput = {
    amount?: string | number | null;
    customAmount?: string | null;
    volunteering?: boolean;
    skipped?: boolean;
};

type SaveDonationIntentActionResponse = SaveMissionActionResponse & {
    donationIntent?: DonationIntent;
};

const normalizeDonationAmount = (value: string | number | null | undefined): number | null => {
    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    if (typeof value !== "string") {
        return null;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return null;
    }

    const parsedValue = Number.parseFloat(trimmedValue.replace(",", "."));
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const normalizeDonationIntent = (input: SaveDonationIntentActionInput): DonationIntent => {
    const skipped = Boolean(input.skipped);
    const amountValue = input.amount === "other" ? input.customAmount : input.amount;

    return {
        amount: skipped ? null : normalizeDonationAmount(amountValue),
        volunteering: Boolean(input.volunteering),
        skipped,
        updatedAt: new Date(),
    };
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
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_about);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // add mission step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("mission")) {
            circle.completedOnboardingSteps.push("mission");
        }

        await updateCircle(circle, userDid);

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

export const saveDonationIntentAction = async (
    input: SaveDonationIntentActionInput,
): Promise<SaveDonationIntentActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to save donation intent" };
    }

    try {
        const donationIntent = normalizeDonationIntent(input);
        await updateDonationIntent(userDid, donationIntent);

        const user = await getUserByDid(userDid);
        const circlePath = await getCirclePath(user);
        revalidatePath(circlePath);

        return { success: true, message: "Donation intent saved successfully", donationIntent };
    } catch (error) {
        console.log("error", error);
        if (error instanceof Error) {
            return { success: false, message: error.message };
        }

        return { success: false, message: "Failed to save donation intent. " + error };
    }
};

export const getPlatformMetrics = async (): Promise<PlatformMetrics> => {
    // get number of circles and users on the platform
    return await countCirclesAndUsers();
};

type SaveSdgsActionResponse = {
    success: boolean;
    message: string;
};

export const saveSdgsAction = async (sdgs: string[] | undefined, circleId: string): Promise<SaveSdgsActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            causes: sdgs,
        };

        // check if user is authorized to edit circle settings
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_causes_and_skills);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // add sdgs step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("sdgs")) {
            circle.completedOnboardingSteps.push("sdgs");
        }

        await updateCircle(circle, userDid);

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
): Promise<SaveSdgsActionResponse> => {
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
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_causes_and_skills);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // add skills step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("skills")) {
            circle.completedOnboardingSteps.push("skills");
        }

        await updateCircle(circle, userDid);

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

export const saveInterestsAction = async (
    interests: string[] | undefined,
    circleId: string,
): Promise<SaveSdgsActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    try {
        let circle: Partial<Circle> = {
            _id: circleId,
            interests,
        };

        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_causes_and_skills);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("interests")) {
            circle.completedOnboardingSteps.push("interests");
        }

        await updateCircle(circle, userDid);

        let circlePath = await getCirclePath(circle);
        revalidatePath(circlePath);

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

type FetchSdgsResponse = {
    success: boolean;
    sdgs: WithMetric<SDG>[];
    message?: string;
};

export const fetchSdgsMatchedToCircle = async (circleId: string): Promise<FetchSdgsResponse> => {
    try {
        const client = await getQdrantClient();

        // Get the circle by ID (using the `retrieve` method)
        const circleObject = await getVbdCircleById(circleId);
        if (!circleObject || !circleObject.vector) {
            // Return all sdgs if no circle vector is found
            return { success: true, sdgs: sdgs as WithMetric<SDG>[] };
        }

        const circleVector = circleObject.vector as number[];

        // Perform the search for sdgs near the circle's vector
        const { points: response } = await client.query("sdgs", {
            query: circleVector,
            limit: 100,
        });

        // Map the response to the SDG type
        const sdgsMatched: WithMetric<SDG>[] = response.map((item: any) => {
            const matchedSdg = sdgs.find((sdg: any) => sdg.name === item.payload.name); // TODO fix so we store handle in db
            const metrics: Metrics = { similarity: item.score ?? 1 }; // Use the score as the "similarity" metric

            return {
                handle: matchedSdg?.handle,
                name: item.payload.name,
                description: item.payload.description,
                picture: matchedSdg?.picture ?? "",
                metrics,
            } as WithMetric<SDG>;
        });

        if (sdgsMatched.length === 0) {
            return { success: true, sdgs: sdgs as WithMetric<SDG>[] };
        }

        return { success: true, sdgs: sdgsMatched as WithMetric<SDG>[] };
    } catch (error) {
        console.error("Error fetching sdgs:", error);
        return { success: true, sdgs: sdgs as WithMetric<SDG>[] };
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
        const { points: response } = await client.query("skills", {
            query: circleVector,
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
            return { success: true, skills: skills as WithMetric<SDG>[] };
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

export const saveProfileAction = async (
    description: string,
    content: string,
    circleId: string,
    picture?: any, // Keep existing picture param for now
    images?: ImageItem[], // Add new images param
): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit profile" };
    }

    try {
        const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit profile" };
        }

        let circle: Partial<Circle> = {
            _id: circleId,
            description,
            content,
        };
        const existingCircle = await getCircleById(circleId);
        if (!existingCircle) throw new Error("Circle not found for profile update.");

        // Handle picture upload (keeping existing logic for profile picture)
        if (isFile(picture)) {
            try {
                circle.picture = await saveCircleOwnedFile({
                    actorDid: userDid,
                    ownerCircle: existingCircle,
                    file: picture,
                    fileName: "picture",
                    overwrite: true,
                    resourceType: "circle",
                });
                revalidatePath(circle.picture.url);
            } catch (uploadError) {
                console.error("Failed to upload profile picture:", uploadError);
            }
        }

        // --- Handle 'images' array ---
        const finalMediaArray: Media[] = [];
        let urlsToDelete: string[] = [];
        const finalImageUrls = new Set<string>();
        if (images) {
            for (const imageItem of images) {
                if (imageItem.file) {
                    // New file upload
                    try {
                        console.log(`Uploading new profile image: ${imageItem.file.name}`);
                        const savedFileInfo: FileInfo = await saveCircleOwnedFile({
                            actorDid: userDid,
                            ownerCircle: existingCircle,
                            file: imageItem.file,
                            fileName: "image",
                            overwrite: true,
                            resourceType: "circle",
                        });
                        finalMediaArray.push({
                            name: imageItem.file.name,
                            type: imageItem.file.type,
                            fileInfo: savedFileInfo,
                        });
                        finalImageUrls.add(savedFileInfo.url);
                        revalidatePath(savedFileInfo.url);
                        console.log(`Uploaded successfully: ${savedFileInfo.url}`);
                    } catch (uploadError) {
                        console.error("Failed to upload new profile image:", uploadError);
                    }
                } else if (imageItem.existingMediaUrl) {
                    // Existing image
                    const existingMedia = existingCircle.images?.find(
                        (m) => m.fileInfo.url === imageItem.existingMediaUrl,
                    );
                    if (existingMedia) {
                        finalMediaArray.push(existingMedia);
                        finalImageUrls.add(existingMedia.fileInfo.url);
                    } else if (canRetainSubmittedCircleMediaUrl(existingCircle, imageItem.existingMediaUrl)) {
                        console.warn(`Existing profile image URL not found: ${imageItem.existingMediaUrl}`);
                        finalMediaArray.push({
                            name: "Existing Image",
                            type: "image/jpeg",
                            fileInfo: { url: imageItem.existingMediaUrl },
                        });
                        finalImageUrls.add(imageItem.existingMediaUrl);
                    }
                }
            }

            // Handle deletion
            const existingUrls = new Set(existingCircle.images?.map((m) => m.fileInfo.url) || []);
            urlsToDelete = [...existingUrls].filter((url) => !finalImageUrls.has(url));
        }
        circle.images = finalMediaArray;
        // --- End Handle 'images' array ---

        // Add profile step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("profile")) {
            circle.completedOnboardingSteps.push("profile");
        }

        const replacedPicture = Object.hasOwn(circle, "picture")
            ? collectReplacedCircleMedia(existingCircle.picture, circle.picture)
            : [];
        const cleanup = await persistCircleThenCleanupMedia(
            () => updateCircle(circle, userDid),
            [...urlsToDelete, ...replacedPicture],
            existingCircle._id!.toString(),
        );
        if (cleanup.status === "failed")
            console.error("Profile update saved but old media cleanup failed:", cleanup.error);

        // Clear page cache so pages update
        let circlePath = await getCirclePath(circle);
        revalidatePath(circlePath);

        return {
            success: true,
            message:
                cleanup.status === "failed"
                    ? "Changes were saved, but an old media file could not be removed."
                    : "Profile saved successfully",
        };
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
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_about);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit location" };
        }

        // Add location step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        circle.completedOnboardingSteps = user.completedOnboardingSteps ?? [];
        if (!circle.completedOnboardingSteps.includes("location")) {
            circle.completedOnboardingSteps.push("location");
        }

        await updateCircle(circle, userDid);

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

        await updateCircle(circle, userDid);
        return { success: true, message: "Welcome step completed" };
    } catch (error) {
        console.log("error", error);
        return { success: false, message: "Failed to update step status" };
    }
};

// Mark member step as completed
export const completeMemberStep = async (circleId: string): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        // Add member step to completedOnboardingSteps
        let user = await getUserByDid(userDid);
        let circle: Partial<Circle> = {
            _id: circleId,
            completedOnboardingSteps: user.completedOnboardingSteps ?? [],
        };

        if (!circle.completedOnboardingSteps?.includes("member")) {
            circle.completedOnboardingSteps?.push("member");
        }

        await updateCircle(circle, userDid);
        return { success: true, message: "Member step completed" };
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

        await updateCircle(circle, userDid);
        return { success: true, message: "Final step completed" };
    } catch (error) {
        console.log("error", error);
        return { success: false, message: "Failed to update step status" };
    }
};

// Mark the post-profile-completion welcome card as acknowledged.
export const completeProfileCompletionWelcomeStep = async (): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        const user = await getUserByDid(userDid);
        if (!user._id) {
            return { success: false, message: "Could not find your profile" };
        }

        const circle: Partial<Circle> = {
            _id: user._id,
            completedOnboardingSteps: user.completedOnboardingSteps ?? [],
        };

        if (!circle.completedOnboardingSteps?.includes("profileCompletionWelcomeSeen")) {
            circle.completedOnboardingSteps?.push("profileCompletionWelcomeSeen");
        }

        await updateCircle(circle, userDid);
        return { success: true, message: "Profile completion welcome acknowledged" };
    } catch (error) {
        console.log("error", error);
        return { success: false, message: "Failed to update step status" };
    }
};

// Save terms agreement action
export const saveTermsAgreementAction = async (
    agreedToTos: boolean,
    agreedToEmailUpdates: boolean,
    circleId: string,
): Promise<SaveMissionActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in" };
    }

    try {
        // Update user with terms agreement
        let user = await getUserByDid(userDid);
        let circle: Partial<Circle> = {
            _id: circleId,
            agreedToTos,
            agreedToEmailUpdates,
            completedOnboardingSteps: user.completedOnboardingSteps ?? [],
        };

        if (!circle.completedOnboardingSteps?.includes("terms")) {
            circle.completedOnboardingSteps?.push("terms");
        }

        await updateCircle(circle, userDid);

        // clear page cache so pages update
        let circlePath = await getCirclePath(circle);
        revalidatePath(circlePath);

        return { success: true, message: "Terms agreement saved" };
    } catch (error) {
        console.log("error", error);
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save terms agreement. " + error };
        }
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
        const { points: response } = await client.query("circles", {
            query: circleVector,
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
