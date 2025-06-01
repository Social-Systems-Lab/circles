"use server";

import { createCircle, updateCircle, getCircleById, ensureModuleIsEnabledOnCircle } from "@/lib/data/circle";
import { Circle, CircleType, Media, FileInfo } from "@/models/models";
import { ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUser, getUserPrivate } from "@/lib/data/user"; // Corrected import for getUserPrivate
import { features } from "@/lib/data/constants";
import { isFile, saveFile, deleteFile } from "@/lib/data/storage";
import { addMember } from "@/lib/data/member";
import { revalidatePath } from "next/cache";

// This action handles both creating a new circle (when circleId is null)
// and updating the basic info of an existing one.
export async function saveBasicInfoAction(
    name: string,
    handle: string,
    isPublic: boolean,
    circleId?: string,
    parentCircleId?: string,
    circleType?: CircleType,
) {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in" };
        }

        if (circleId) {
            // --- UPDATE EXISTING CIRCLE ---
            const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circle" };
            }

            await updateCircle({ _id: circleId, name, handle, isPublic }, userDid);
            const updatedCircle = await getCircleById(circleId); // Re-fetch to get latest data
            return { success: true, message: "Basic info updated successfully", data: { circle: updatedCircle } };
        } else {
            // --- CREATE NEW CIRCLE ---
            const authorized = await isAuthorized(userDid, parentCircleId ?? "", features.communities.create);
            if (!authorized) {
                return { success: false, message: "You are not authorized to create new circles" };
            }

            // 1. Create initial circle record
            const initialCircleData: Circle = {
                name,
                handle,
                isPublic,
                description: "",
                content: "",
                mission: "",
                circleType: "circle", // Projects are no longer a distinct type here
                createdBy: userDid,
                parentCircleId,
                picture: { url: "/images/default-picture.png" }, // Default picture
                causes: [],
                skills: [],
            };
            const newCircle = await createCircle(initialCircleData, userDid); // Pass userDid here

            // 2. Add user as admin member
            await addMember(userDid, newCircle._id!, ["admins", "moderators", "members"]);

            // 3. If the parent is the user's own circle, ensure the relevant module is enabled
            if (parentCircleId) {
                const userCircle = await getUser(userDid);
                if (userCircle && userCircle._id === parentCircleId) {
                    const moduleToEnable = "communities"; // Always communities now
                    await ensureModuleIsEnabledOnCircle(parentCircleId, moduleToEnable, userDid);
                }
            }

            return { success: true, message: "Circle created successfully", data: { circle: newCircle } };
        }
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save basic info. " + JSON.stringify(error) };
        }
    }
}

export async function saveMissionAction(mission: string, circleId?: string) {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to update a circle" };
        }

        const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_about);
        if (!authorized) {
            return { success: false, message: "You are not authorized to update the circles" };
        }

        if (circleId) {
            await updateCircle({ _id: circleId, mission }, userDid);
            const updatedCircle = await getCircleById(circleId);
            return { success: true, message: "Mission updated successfully", data: { circle: updatedCircle } };
        }
        return { success: true, message: "Mission saved (no ID provided)" }; // No-op if no ID
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save mission.";
        return { success: false, message: message + " " + JSON.stringify(error) };
    }
}

export async function saveProfileAction(
    description: string,
    content: string,
    circleId?: string,
    picture?: any,
    images?: ImageItem[],
) {
    try {
        if (!circleId) {
            console.warn("saveProfileAction called without circleId");
            return { success: true, message: "Profile saved (no ID provided)" }; // No-op if no ID
        }

        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to update a circle" };
        }

        const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
        if (!authorized) {
            return { success: false, message: "You are not authorized to update the circles" };
        }

        const updateData: Partial<Circle> = { _id: circleId, description, content };
        let needUpdate = false;
        const existingCircle = await getCircleById(circleId); // Fetch existing circle data once

        if (!existingCircle) {
            throw new Error("Circle not found for profile update.");
        }

        // Handle profile picture upload
        if (isFile(picture)) {
            try {
                updateData.picture = await saveFile(picture, "picture", circleId, true);
                needUpdate = true;
                revalidatePath(updateData.picture.url); // Revalidate picture path
            } catch (error) {
                console.error("Failed to save profile picture:", error);
            }
        }

        // --- Handle 'images' array ---
        if (images) {
            // Only process if images array is provided
            const finalMediaArray: Media[] = [];
            const finalImageUrls = new Set<string>();
            let imagesChanged = false;

            for (const imageItem of images) {
                if (imageItem.file && isFile(imageItem.file)) {
                    try {
                        const savedFileInfo: FileInfo = await saveFile(imageItem.file, "image", circleId, true);
                        finalMediaArray.push({
                            name: imageItem.file.name,
                            type: imageItem.file.type,
                            fileInfo: savedFileInfo,
                        });
                        finalImageUrls.add(savedFileInfo.url);
                        imagesChanged = true;
                        revalidatePath(savedFileInfo.url); // Revalidate new image path
                    } catch (uploadError) {
                        console.error("Failed to upload new image:", uploadError);
                    }
                } else if (imageItem.existingMediaUrl) {
                    const existingMedia = existingCircle.images?.find(
                        (m) => m.fileInfo.url === imageItem.existingMediaUrl,
                    );
                    if (existingMedia) {
                        finalMediaArray.push(existingMedia);
                        finalImageUrls.add(existingMedia.fileInfo.url);
                    } else {
                        console.warn(`Existing image URL not found: ${imageItem.existingMediaUrl}`);
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
            for (const urlToDelete of existingUrls) {
                if (!finalImageUrls.has(urlToDelete)) {
                    try {
                        await deleteFile(urlToDelete);
                        imagesChanged = true;
                    } catch (deleteError) {
                        console.error(`Failed to delete image ${urlToDelete}:`, deleteError);
                    }
                }
            }

            if (imagesChanged || finalMediaArray.length !== (existingCircle.images?.length || 0)) {
                updateData.images = finalMediaArray;
                needUpdate = true;
            }
        }
        // --- End Handle 'images' array ---

        if (needUpdate) {
            await updateCircle(updateData, userDid);
        }

        const updatedCircle = await getCircleById(circleId); // Fetch potentially updated circle
        return { success: true, message: "Profile updated successfully", data: { circle: updatedCircle } };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save profile.";
        return { success: false, message: message + " " + JSON.stringify(error) };
    }
}

export async function saveLocationAction(location: any, circleId?: string) {
    try {
        if (!circleId) return { success: true, message: "Location saved (no ID provided)" };

        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "You need to be logged in to update a circle" };

        const authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
        if (!authorized) return { success: false, message: "You are not authorized to update the circles" };

        await updateCircle({ _id: circleId, location }, userDid);
        const updatedCircle = await getCircleById(circleId);
        return { success: true, message: "Location updated successfully", data: { circle: updatedCircle } };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save location.";
        return { success: false, message: message + " " + JSON.stringify(error) };
    }
}

export async function saveCausesAction(causes: string[], circleId?: string) {
    try {
        if (!circleId) return { success: true, message: "Causes saved (no ID provided)" };

        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "You need to be logged in to update a circle" };

        const authorized = await isAuthorized(userDid, circleId, features.settings.edit_causes_and_skills);
        if (!authorized) return { success: false, message: "You are not authorized to update the circles" };

        await updateCircle({ _id: circleId, causes }, userDid);
        const updatedCircle = await getCircleById(circleId);
        return { success: true, message: "Causes updated successfully", data: { circle: updatedCircle } };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save causes.";
        return { success: false, message: message + " " + JSON.stringify(error) };
    }
}

export async function saveSkillsAction(skills: string[], circleId?: string) {
    try {
        if (!circleId) return { success: true, message: "Skills saved (no ID provided)" };

        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "You need to be logged in to update a circle" };

        const authorized = await isAuthorized(userDid, circleId, features.settings.edit_causes_and_skills);
        if (!authorized) return { success: false, message: "You are not authorized to update the circles" };

        await updateCircle({ _id: circleId, skills }, userDid);
        const updatedCircle = await getCircleById(circleId);
        return { success: true, message: "Skills updated successfully", data: { circle: updatedCircle } };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save skills.";
        return { success: false, message: message + " " + JSON.stringify(error) };
    }
}
