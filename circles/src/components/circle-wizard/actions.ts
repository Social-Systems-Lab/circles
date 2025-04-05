"use server";

import { createCircle, updateCircle, getCircleById, getCirclePath } from "@/lib/data/circle"; // Added getCirclePath
import { Circle, CircleType, Media, FileInfo } from "@/models/models";
import { ImageItem } from "@/components/forms/controls/multi-image-uploader";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { isFile, saveFile, deleteFile } from "@/lib/data/storage";
import { addMember } from "@/lib/data/member";
import { revalidatePath } from "next/cache"; // Added revalidatePath

export async function createCircleAction(circleData: any, formData?: FormData, isProjectsPage?: boolean) {
    try {
        // Check if user is authorized to create circles
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to create a circle" };
        }

        const authorized = await isAuthorized(userDid, circleData.parentCircleId ?? "", features.circles.create);
        if (!authorized) {
            return { success: false, message: "You are not authorized to create new circles" };
        }

        // Create the circle
        const circle: Circle = {
            name: circleData.name,
            handle: circleData.handle,
            description: circleData.description,
            content: circleData.content,
            mission: circleData.mission,
            isPublic: circleData.isPublic !== undefined ? circleData.isPublic : true,
            parentCircleId: circleData.parentCircleId,
            circleType: circleData.isProjectsPage || isProjectsPage ? "project" : "circle",
            createdBy: userDid,
            location: circleData.location,
            causes: circleData.selectedCauses?.map((cause: any) => cause.handle) || [],
            skills: circleData.selectedSkills?.map((skill: any) => skill.handle) || [],
        };

        // Create the circle in the database
        const newCircle = await createCircle(circle);

        // Add the user as an admin member to the new circle
        await addMember(userDid, newCircle._id!, ["admins", "moderators", "members"]);

        // Handle file uploads AFTER circle creation
        try {
            let updatePayload: Partial<Circle> = { _id: newCircle._id };
            let needUpdate = false;

            // Handle Profile Picture (from circleData.pictureFile if present)
            // Note: circleData.pictureFile is not standard, assuming it's set in the wizard state
            if (circleData.pictureFile && isFile(circleData.pictureFile)) {
                try {
                    console.log("Uploading profile picture from circleData.pictureFile");
                    updatePayload.picture = await saveFile(circleData.pictureFile, "picture", newCircle._id, true);
                    needUpdate = true;
                } catch (error) {
                    console.error("Error saving picture from circleData:", error);
                }
            }

            // Handle Images Array (from circleData.images)
            const finalMediaArray: Media[] = [];
            if (circleData.images && Array.isArray(circleData.images)) {
                console.log(`Processing ${circleData.images.length} images from circleData`);
                for (const imageItem of circleData.images as ImageItem[]) {
                    if (imageItem.file && isFile(imageItem.file)) {
                        // Check if it's a real file
                        // New file to upload
                        try {
                            console.log(`Uploading new image: ${imageItem.file.name}`);
                            const savedFileInfo: FileInfo = await saveFile(
                                imageItem.file,
                                "image",
                                newCircle._id,
                                true,
                            );
                            finalMediaArray.push({
                                name: imageItem.file.name,
                                type: imageItem.file.type,
                                fileInfo: savedFileInfo,
                            });
                            needUpdate = true; // Mark for update if any image is processed
                            console.log(`Uploaded successfully: ${savedFileInfo.url}`);
                        } catch (uploadError) {
                            console.error("Failed to upload new image:", uploadError);
                        }
                    } else if (imageItem.existingMediaUrl) {
                        // This case shouldn't happen for a *new* circle, but handle defensively
                        console.warn(`Found existingMediaUrl in new circle data: ${imageItem.existingMediaUrl}`);
                        finalMediaArray.push({
                            name: "Existing Image",
                            type: "image/jpeg",
                            fileInfo: { url: imageItem.existingMediaUrl },
                        });
                        // No need to set needUpdate=true if only existing images are present
                    }
                }
                if (finalMediaArray.length > 0) {
                    updatePayload.images = finalMediaArray;
                    // Since we are *creating* a circle, any successfully uploaded image means we need an update.
                    // The check against existingCircle was incorrect here.
                    // needUpdate is already set to true if finalMediaArray has items from new uploads.
                }
            }

            // If any files needed processing and resulted in changes, update the circle
            if (needUpdate) {
                console.log("Updating circle with uploaded file info:", updatePayload);
                await updateCircle(updatePayload);
                // Re-fetch the circle to return the fully updated object
                const updatedCircle = await getCircleById(newCircle._id);
                return { success: true, message: "Circle created successfully", data: { circle: updatedCircle } };
            } else {
                // No files needed updating, return the initially created circle
                return { success: true, message: "Circle created successfully", data: { circle: newCircle } };
            }
        } catch (error) {
            console.error("Failed to process/save circle files after creation:", error);
            // Return the initially created circle but maybe indicate a warning?
            return {
                success: true,
                message: "Circle created, but failed to save some images.",
                data: { circle: newCircle },
            };
        }
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to create the circle. " + JSON.stringify(error) };
        }
    }
}

// --- Restored Actions ---

export async function saveBasicInfoAction(
    name: string,
    handle: string,
    isPublic: boolean,
    circleId?: string,
    parentCircleId?: string,
    circleType?: CircleType,
) {
    try {
        if (circleId) {
            // Check if user is authorized to create circles
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_about);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circle" };
            }

            // If circleId exists, update the existing circle
            const circle = await updateCircle({
                _id: circleId,
                name,
                handle,
                isPublic,
            });
            // Note: Returning the result of updateCircle might not be the full circle object depending on implementation
            // Re-fetch if the full object is needed by the caller
            const updatedCircle = await getCircleById(circleId);
            return { success: true, message: "Basic info updated successfully", data: { circle: updatedCircle } };
        } else {
            // This path should ideally not be hit if createCircleAction handles creation
            console.warn("saveBasicInfoAction called without circleId - creation should happen in createCircleAction");
            return { success: false, message: "Circle creation should be handled by createCircleAction" };
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
            // If circleId exists, update the existing circle
            await updateCircle({
                _id: circleId,
                mission,
            });
            const updatedCircle = await getCircleById(circleId);
            return { success: true, message: "Mission updated successfully", data: { circle: updatedCircle } };
        }

        // For new circles, we'll just return success as the actual creation happens at the end
        return { success: true, message: "Mission saved (no ID provided)" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save mission. " + JSON.stringify(error) };
        }
    }
}

// Updated saveProfileAction to handle images array
export async function saveProfileAction(
    description: string,
    content: string,
    circleId?: string,
    picture?: any, // Keep picture for now
    images?: ImageItem[], // Use ImageItem[]
) {
    try {
        if (circleId) {
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_about);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

            // If circleId exists, update the existing circle
            const updateData: Partial<Circle> = {
                _id: circleId,
                description,
                content,
            };
            let needUpdate = false; // Flag to track if DB update is needed

            // Handle profile picture upload
            if (isFile(picture)) {
                try {
                    updateData.picture = await saveFile(picture, "picture", circleId, true);
                    needUpdate = true;
                } catch (error) {
                    console.error("Failed to save profile picture:", error);
                }
            }

            // --- Handle 'images' array ---
            const finalMediaArray: Media[] = [];
            const finalImageUrls = new Set<string>();
            const existingCircle = await getCircleById(circleId); // Fetch existing circle data

            if (images && existingCircle) {
                let imagesChanged = false; // Track if the images array itself changed
                for (const imageItem of images) {
                    if (imageItem.file && isFile(imageItem.file)) {
                        // New file upload
                        try {
                            const savedFileInfo: FileInfo = await saveFile(imageItem.file, "image", circleId, true);
                            finalMediaArray.push({
                                name: imageItem.file.name,
                                type: imageItem.file.type,
                                fileInfo: savedFileInfo,
                            });
                            finalImageUrls.add(savedFileInfo.url);
                            imagesChanged = true;
                        } catch (uploadError) {
                            console.error("Failed to upload new image:", uploadError);
                        }
                    } else if (imageItem.existingMediaUrl) {
                        // Existing image
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

                // Only include images in update if they actually changed
                if (imagesChanged || finalMediaArray.length !== (existingCircle.images?.length || 0)) {
                    updateData.images = finalMediaArray;
                    needUpdate = true;
                }
            }
            // --- End Handle 'images' array ---

            if (needUpdate) {
                await updateCircle(updateData);
            }
            const updatedCircle = await getCircleById(circleId); // Fetch potentially updated circle
            return { success: true, message: "Profile updated successfully", data: { circle: updatedCircle } };
        }

        // For new circles (this path shouldn't be hit if createCircleAction is used)
        console.warn("saveProfileAction called without circleId");
        return { success: true, message: "Profile saved (no ID provided)" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save profile. " + JSON.stringify(error) };
        }
    }
}

export async function saveLocationAction(location: any, circleId?: string) {
    try {
        if (circleId) {
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_about);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

            // If circleId exists, update the existing circle
            await updateCircle({
                _id: circleId,
                location,
            });
            const updatedCircle = await getCircleById(circleId);
            return { success: true, message: "Location updated successfully", data: { circle: updatedCircle } };
        }

        // For new circles
        return { success: true, message: "Location saved (no ID provided)" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save location. " + JSON.stringify(error) };
        }
    }
}

export async function saveCausesAction(causes: string[], circleId?: string) {
    try {
        if (circleId) {
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_causes_and_skills);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

            // If circleId exists, update the existing circle
            await updateCircle({
                _id: circleId,
                causes,
            });
            const updatedCircle = await getCircleById(circleId);
            return { success: true, message: "Causes updated successfully", data: { circle: updatedCircle } };
        }

        // For new circles
        return { success: true, message: "Causes saved (no ID provided)" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save causes. " + JSON.stringify(error) };
        }
    }
}

export async function saveSkillsAction(skills: string[], circleId?: string) {
    try {
        if (circleId) {
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_causes_and_skills);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

            // If circleId exists, update the existing circle
            await updateCircle({
                _id: circleId,
                skills,
            });
            const updatedCircle = await getCircleById(circleId);
            return { success: true, message: "Skills updated successfully", data: { circle: updatedCircle } };
        }

        // For new circles
        return { success: true, message: "Skills saved (no ID provided)" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save skills. " + JSON.stringify(error) };
        }
    }
}
