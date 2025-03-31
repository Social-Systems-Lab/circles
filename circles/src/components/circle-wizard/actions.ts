"use server";

import { createCircle, updateCircle } from "@/lib/data/circle";
import { Circle } from "@/models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { isFile, saveFile } from "@/lib/data/storage";
import { addMember } from "@/lib/data/member";

export async function createCircleAction(circleData: any) {
    try {
        // Check if user is authorized to create circles
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in to create a circle" };
        }

        const authorized = await isAuthorized(userDid, circleData.parentCircleId ?? "", features.create_subcircle);
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
            circleType: "circle",
            createdBy: userDid,
            location: circleData.location,
            causes: circleData.selectedCauses?.map((cause: any) => cause.handle) || [],
            skills: circleData.selectedSkills?.map((skill: any) => skill.handle) || [],
        };

        // Create the circle in the database
        const newCircle = await createCircle(circle);

        // Add the user as an admin member to the new circle
        await addMember(userDid, newCircle._id!, ["admins", "moderators", "members"]);

        // Handle file uploads if needed
        try {
            let needUpdate = false;

            if (isFile(circleData.picture)) {
                // Save the picture and get the file info
                newCircle.picture = await saveFile(circleData.picture, "picture", newCircle._id, true);
                needUpdate = true;
            }

            if (isFile(circleData.cover)) {
                // Save the cover and get the file info
                newCircle.cover = await saveFile(circleData.cover, "cover", newCircle._id, true);
                needUpdate = true;
            }

            if (needUpdate) {
                await updateCircle(newCircle);
            }
        } catch (error) {
            console.log("Failed to save circle files", error);
        }

        return { success: true, message: "Circle created successfully", data: { circle: newCircle } };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to create the circle. " + JSON.stringify(error) };
        }
    }
}

export async function saveBasicInfoAction(name: string, handle: string, isPublic: boolean, circleId?: string) {
    try {
        if (circleId) {
            // If circleId exists, update the existing circle
            const circle = await updateCircle({
                _id: circleId,
                name,
                handle,
                isPublic,
            });
            return { success: true, message: "Basic info updated successfully", data: { circle } };
        }

        // For new circles, we'll just return success as the actual creation happens at the end
        return { success: true, message: "Basic info saved" };
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
        if (circleId) {
            // If circleId exists, update the existing circle
            const circle = await updateCircle({
                _id: circleId,
                mission,
            });
            return { success: true, message: "Mission updated successfully", data: { circle } };
        }

        // For new circles, we'll just return success as the actual creation happens at the end
        return { success: true, message: "Mission saved" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save mission. " + JSON.stringify(error) };
        }
    }
}

export async function saveProfileAction(
    description: string,
    content: string,
    circleId?: string,
    picture?: any,
    cover?: any,
) {
    try {
        if (circleId) {
            // If circleId exists, update the existing circle
            const updateData: any = {
                _id: circleId,
                description,
                content,
            };

            // Handle file uploads if needed
            try {
                if (isFile(picture)) {
                    // Save the picture and get the file info
                    updateData.picture = await saveFile(picture, "picture", circleId, true);
                }

                if (isFile(cover)) {
                    // Save the cover and get the file info
                    updateData.cover = await saveFile(cover, "cover", circleId, true);
                }
            } catch (error) {
                console.log("Failed to save circle files", error);
            }

            const circle = await updateCircle(updateData);
            return { success: true, message: "Profile updated successfully", data: { circle } };
        }

        // For new circles, we'll just return success as the actual creation happens at the end
        return { success: true, message: "Profile saved" };
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
            // If circleId exists, update the existing circle
            const circle = await updateCircle({
                _id: circleId,
                location,
            });
            return { success: true, message: "Location updated successfully", data: { circle } };
        }

        // For new circles, we'll just return success as the actual creation happens at the end
        return { success: true, message: "Location saved" };
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
            // If circleId exists, update the existing circle
            const circle = await updateCircle({
                _id: circleId,
                causes,
            });
            return { success: true, message: "Causes updated successfully", data: { circle } };
        }

        // For new circles, we'll just return success as the actual creation happens at the end
        return { success: true, message: "Causes saved" };
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
            // If circleId exists, update the existing circle
            const circle = await updateCircle({
                _id: circleId,
                skills,
            });
            return { success: true, message: "Skills updated successfully", data: { circle } };
        }

        // For new circles, we'll just return success as the actual creation happens at the end
        return { success: true, message: "Skills saved" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save skills. " + JSON.stringify(error) };
        }
    }
}
