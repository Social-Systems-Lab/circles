"use server";

import { revalidatePath } from "next/cache";
import { Circles } from "@/lib/data/db";
import { deleteCircle } from "@/lib/data/circle";
import { Circle } from "@/models/models";
import { ObjectId } from "mongodb";
import { getAuthenticatedUserDid, getServerPublicKey } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { GlobalServerSettingsFormData, globalServerSettingsValidationSchema } from "./global-server-settings-schema";
import { getServerSettings, registerServer, updateServerSettings, urlIsLocal } from "@/lib/data/server-settings";
import { ServerSettings } from "@/models/models";

// Get all circles of a specific type
export async function getEntitiesByType(type: "circle" | "user" | "project") {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        const entities = await Circles.find(
            { circleType: type },
            {
                projection: {
                    _id: 1,
                    name: 1,
                    handle: 1,
                    picture: 1,
                    did: 1,
                    description: 1,
                    createdAt: 1,
                    members: 1,
                    isAdmin: 1,
                },
            },
        ).toArray();

        return entities.map((entity) => ({
            ...entity,
            _id: entity._id.toString(),
        }));
    } catch (error) {
        console.error(`Error fetching ${type}s:`, error);
        throw new Error(`Failed to fetch ${type}s`);
    }
}

// Delete an entity (circle, user, or project)
export async function deleteEntity(id: string) {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        await deleteCircle(id);
        revalidatePath("/admin");
        return { success: true, message: "Entity deleted successfully" };
    } catch (error) {
        console.error("Error deleting entity:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to delete entity",
        };
    }
}

// Get all super admins
export async function getSuperAdmins() {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        const admins = await Circles.find(
            { isAdmin: true, circleType: "user" },
            {
                projection: {
                    _id: 1,
                    name: 1,
                    handle: 1,
                    picture: 1,
                    did: 1,
                    email: 1,
                },
            },
        ).toArray();

        return admins.map((admin) => ({
            ...admin,
            _id: admin._id.toString(),
        }));
    } catch (error) {
        console.error("Error fetching super admins:", error);
        throw new Error("Failed to fetch super admins");
    }
}

// Toggle super admin status
export async function toggleSuperAdmin(userId: string, isAdmin: boolean) {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        await Circles.updateOne({ _id: new ObjectId(userId) }, { $set: { isAdmin } });
        revalidatePath("/admin");
        return {
            success: true,
            message: `User ${isAdmin ? "promoted to" : "removed from"} super admin role`,
        };
    } catch (error) {
        console.error("Error updating super admin status:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update super admin status",
        };
    }
}

// Save global server settings
export async function saveGlobalServerSettings(data: GlobalServerSettingsFormData) {
    // Check if user is admin
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "Unauthorized: You must be logged in." };
    }
    const user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        return { success: false, message: "Unauthorized: You do not have permission." };
    }

    // Validate data
    const validationResult = globalServerSettingsValidationSchema.safeParse(data);
    if (!validationResult.success) {
        // Combine Zod error messages
        const errorMessages = validationResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
        return { success: false, message: `Invalid data: ${errorMessages}` };
    }

    const validatedData = validationResult.data;

    try {
        // Fetch current settings to compare registry URL
        const currentSettings = await getServerSettings();

        // Update the settings in the database
        await updateServerSettings(validatedData as ServerSettings); // Cast needed as DB model might have more fields

        // Handle registry registration if URL changed and is valid
        if (
            validatedData.registryUrl &&
            validatedData.registryUrl !== currentSettings.registryUrl &&
            validatedData.did && // Ensure server DID exists
            validatedData.name &&
            validatedData.url
        ) {
            const localServerAndRemoteRegistry =
                urlIsLocal(validatedData.url) && !urlIsLocal(validatedData.registryUrl);
            if (!localServerAndRemoteRegistry) {
                try {
                    const publicKey = getServerPublicKey();
                    const registryInfo = await registerServer(
                        validatedData.did,
                        validatedData.name,
                        validatedData.url,
                        validatedData.registryUrl,
                        publicKey,
                    );
                    // Save updated registry info back to settings
                    await updateServerSettings({
                        ...validatedData,
                        activeRegistryInfo: registryInfo,
                    } as ServerSettings);
                    console.log("Server re-registered with registry successfully.");
                } catch (regError) {
                    console.error("Failed to re-register server with registry after settings update:", regError);
                    // Don't fail the whole operation, just log the registry error
                }
            } else {
                console.warn("Skipping registry registration: Local server with remote registry detected.");
            }
        }

        revalidatePath("/admin"); // Revalidate admin path to reflect changes
        return { success: true, message: "Global server settings updated successfully." };
    } catch (error) {
        console.error("Error updating global server settings:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Failed to update global server settings.",
        };
    }
}

// Get platform statistics
export async function getPlatformStats() {
    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        throw new Error("Unauthorized: You do not have permission to access this resource.");
    }

    try {
        const circlesCount = await Circles.countDocuments({ circleType: "circle" });
        const usersCount = await Circles.countDocuments({ circleType: "user" });
        const projectsCount = await Circles.countDocuments({ circleType: "project" });
        const adminsCount = await Circles.countDocuments({ isAdmin: true, circleType: "user" });

        return {
            circles: circlesCount,
            users: usersCount,
            projects: projectsCount,
            admins: adminsCount,
        };
    } catch (error) {
        console.error("Error fetching platform stats:", error);
        throw new Error("Failed to fetch platform statistics");
    }
}
