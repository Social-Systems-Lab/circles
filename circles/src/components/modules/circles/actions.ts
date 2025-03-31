"use server";

import { deleteCircle, getCircleById, getDefaultCircle } from "@/lib/data/circle";
import { getServerSettings } from "@/lib/data/server-settings";
import { FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { Feeds, Members, Posts } from "@/lib/data/db";
import { features } from "@/lib/data/constants";

export async function getCircleByIdAction(id: string) {
    try {
        return await getCircleById(id);
    } catch (error) {
        console.error("Error getting circle by ID:", error);
        throw new Error("Failed to get circle");
    }
}

/**
 * Get statistics about what will be deleted when a circle is deleted
 * @param circleId The ID of the circle
 * @returns Object containing counts of members, feeds, and posts
 */
export async function getCircleDeletionStatsAction(circleId: string) {
    try {
        // Get the circle to be deleted
        const circle = await getCircleById(circleId);
        if (!circle) {
            throw new Error("Circle not found");
        }

        // Count members
        const membersCount = await Members.countDocuments({ circleId });

        // Count feeds and posts
        const feeds = await Feeds.find({ circleId }).toArray();
        const feedIds = feeds.map((feed) => feed._id.toString());
        const feedsCount = feeds.length;

        // Count posts across all feeds
        let postsCount = 0;
        for (const feedId of feedIds) {
            const count = await Posts.countDocuments({ feedId });
            postsCount += count;
        }

        // Check if this is a user account
        const isUser = circle.circleType === "user";

        return {
            success: true,
            stats: {
                membersCount,
                feedsCount,
                postsCount,
                isUser,
            },
        };
    } catch (error) {
        console.error("Error getting circle deletion stats:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "An unknown error occurred",
        };
    }
}

// This is a separate action for deleting a circle
export async function deleteCircleAction(circleId: string, confirmationName: string): Promise<FormSubmitResponse> {
    try {
        // Get authenticated user DID
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return {
                success: false,
                message: "You need to be logged in to delete a circle",
            };
        }

        // Get the circle to be deleted
        const circle = await getCircleById(circleId);
        if (!circle) {
            return {
                success: false,
                message: "Circle not found",
            };
        }

        // Check if this is the default circle (which shouldn't be deletable)
        const serverSettings = await getServerSettings();
        const defaultCircle = await getDefaultCircle(serverSettings);

        if (defaultCircle._id === circleId) {
            return {
                success: false,
                message: "Cannot delete the default circle",
            };
        }

        // Check if user has admin permissions for this circle
        const isAdmin = await isAuthorized(userDid, circleId, features.delete_circle);
        if (!isAdmin) {
            return {
                success: false,
                message: "You don't have permission to delete this circle. Only admins can delete circles.",
            };
        }

        // Verify the confirmation name matches the circle name
        if (confirmationName !== circle.name) {
            return {
                success: false,
                message: "Confirmation name does not match circle name",
            };
        }

        // Delete the circle
        await deleteCircle(circleId);

        // Revalidate paths
        revalidatePath("/circles");
        revalidatePath(`/circles/${circle.handle}`);

        return {
            success: true,
            message: "Circle deleted successfully",
            data: { redirectTo: "/circles" },
        };
    } catch (error) {
        console.error("Error deleting circle:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "An unknown error occurred",
        };
    }
}
