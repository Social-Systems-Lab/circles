"use server";

import { createCircle, updateCircle } from "@/lib/data/circle";
import { Circle, CircleType } from "@/models/models";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { isFile, saveFile } from "@/lib/data/storage";
import { addMember } from "@/lib/data/member";

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

        // Handle file uploads if needed
        try {
            let needUpdate = false;

            // Check if we have FormData with image files
            try {
                if (formData) {
                    console.log("FormData entries:");
                    try {
                        for (const [key, value] of formData.entries()) {
                            console.log(`- ${key}: ${typeof value}`);
                        }
                    } catch (error) {
                        console.log("Error iterating FormData entries:", error);
                    }

                    // Handle picture file
                    try {
                        const pictureFile = formData.get("picture");
                        if (pictureFile) {
                            // Convert to Buffer if needed
                            if (typeof Buffer !== "undefined" && pictureFile instanceof Buffer) {
                                // Save the picture and get the file info
                                newCircle.picture = await saveFile(pictureFile, "picture", newCircle._id, true);
                                needUpdate = true;
                            } else if (typeof Blob !== "undefined" && pictureFile instanceof Blob) {
                                // Convert Blob to Buffer
                                const arrayBuffer = await pictureFile.arrayBuffer();
                                const buffer = Buffer.from(arrayBuffer);
                                newCircle.picture = await saveFile(buffer, "picture", newCircle._id, true);
                                needUpdate = true;
                            } else {
                                // Try to save it directly
                                newCircle.picture = await saveFile(pictureFile, "picture", newCircle._id, true);
                                needUpdate = true;
                            }
                        }
                    } catch (error) {
                        console.log("Error processing picture file:", error);
                    }

                    // Handle cover file
                    try {
                        const coverFile = formData.get("cover");
                        if (coverFile) {
                            // Convert to Buffer if needed
                            if (typeof Buffer !== "undefined" && coverFile instanceof Buffer) {
                                // Save the cover and get the file info
                                newCircle.cover = await saveFile(coverFile, "cover", newCircle._id, true);
                                needUpdate = true;
                            } else if (typeof Blob !== "undefined" && coverFile instanceof Blob) {
                                // Convert Blob to Buffer
                                const arrayBuffer = await coverFile.arrayBuffer();
                                const buffer = Buffer.from(arrayBuffer);
                                newCircle.cover = await saveFile(buffer, "cover", newCircle._id, true);
                                needUpdate = true;
                            } else {
                                // Try to save it directly
                                newCircle.cover = await saveFile(coverFile, "cover", newCircle._id, true);
                                needUpdate = true;
                            }
                        }
                    } catch (error) {
                        console.log("Error processing cover file:", error);
                    }
                }

                // Try the direct method as a fallback
                if (circleData.pictureFile && !newCircle.picture) {
                    try {
                        // Save the picture and get the file info
                        newCircle.picture = await saveFile(circleData.pictureFile, "picture", newCircle._id, true);
                        needUpdate = true;
                    } catch (error) {
                        console.log("Error saving picture from circleData:", error);
                    }
                }

                if (circleData.coverFile && !newCircle.cover) {
                    try {
                        // Save the cover and get the file info
                        newCircle.cover = await saveFile(circleData.coverFile, "cover", newCircle._id, true);
                        needUpdate = true;
                    } catch (error) {
                        console.log("Error saving cover from circleData:", error);
                    }
                }
            } catch (error) {
                console.log("Error in file processing section:", error);
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
            return { success: true, message: "Basic info updated successfully", data: { circle } };
        } else {
            // For new circles, create the circle in the database
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to create a circle" };
            }

            const authorized = await isAuthorized(userDid, parentCircleId ?? "", features.circles.create);
            if (!authorized) {
                return { success: false, message: "You are not authorized to create new circles" };
            }

            // Create a new circle with basic info
            const circle: Circle = {
                name,
                handle,
                isPublic,
                description: "",
                content: "",
                mission: "",
                circleType: circleType === "project" ? "project" : "circle",
                createdBy: userDid,
                parentCircleId,
                picture: { url: "/images/default-picture.png" },
                cover: { url: "/images/default-cover.png" },
                causes: [],
                skills: [],
            };

            // Create the circle in the database
            const newCircle = await createCircle(circle);

            // Add the user as an admin member to the new circle
            await addMember(userDid, newCircle._id!, ["admins", "moderators", "members"]);

            return {
                success: true,
                message: "Circle created successfully",
                data: { circle: newCircle },
            };
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
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_about);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

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
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_about);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

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
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_causes_and_skills);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

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
            const userDid = await getAuthenticatedUserDid();
            if (!userDid) {
                return { success: false, message: "You need to be logged in to update a circle" };
            }

            const authorized = await isAuthorized(userDid, circleId ?? "", features.settings.edit_causes_and_skills);
            if (!authorized) {
                return { success: false, message: "You are not authorized to update the circles" };
            }

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
