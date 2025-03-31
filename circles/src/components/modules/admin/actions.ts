"use server";

import { revalidatePath } from "next/cache";
import { Circles } from "@/lib/data/db";
import { deleteCircle } from "@/lib/data/circle";
import { Circle } from "@/models/models";
import { ObjectId } from "mongodb";

// Get all circles of a specific type
export async function getEntitiesByType(type: "circle" | "user" | "project") {
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

// Get platform statistics
export async function getPlatformStats() {
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
