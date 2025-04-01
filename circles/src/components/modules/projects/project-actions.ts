"use server";

import { getCircleById, updateCircle } from "@/lib/data/circle";
import { getFeedByHandle, createPost, getPost } from "@/lib/data/feed";
import { Circle, Post } from "@/models/models";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { isAuthorized } from "@/lib/auth/auth";

type ActionResponse = {
    success: boolean;
    message: string;
    data?: {
        post?: Post;
    };
};

/**
 * Creates a shadow post for a single project to enable comments functionality
 */
export async function createShadowPostForProjectAction(projectId: string, feedId: string): Promise<ActionResponse> {
    try {
        // Authorization - check if user is logged in
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "You need to be logged in" };
        }

        // Get the project
        const project = await getCircleById(projectId);
        if (!project) {
            return { success: false, message: "Project not found" };
        }

        // Ensure this is a project
        if (project.circleType !== "project") {
            return { success: false, message: "Invalid project ID" };
        }

        // Check if user is authorized to update the project
        if (project.parentCircleId) {
            const isAdmin = await isAuthorized(userDid, project.parentCircleId, "admin");
            if (!isAdmin) {
                return { success: false, message: "You don't have permission to enable comments for this project" };
            }
        } else {
            return { success: false, message: "Project has no parent circle" };
        }

        // Check if the project already has a shadow post
        if (project.metadata?.commentPostId) {
            // Get the post to verify it exists
            const existingPost = await getPost(project.metadata.commentPostId);
            if (existingPost) {
                return {
                    success: true,
                    message: "Project already has comments enabled",
                    data: { post: existingPost },
                };
            }
        }

        // Create a post to store comments
        const post: Post = {
            feedId: feedId,
            createdBy: project.createdBy || userDid,
            createdAt: project.createdAt || new Date(),
            content: "", // Empty content since we're displaying the project content separately
            reactions: {},
            comments: 0,
            media: [],
            postType: "project", // Mark as project shadow post
            userGroups: ["admins", "moderators", "members", "everyone"],
        };

        const newPost = await createPost(post);

        // Store the post ID in the project metadata
        const updatedProject: Partial<Circle> = {
            _id: project._id,
            metadata: {
                ...project.metadata,
                commentPostId: newPost._id,
            },
        };

        await updateCircle(updatedProject);

        return {
            success: true,
            message: "Comments enabled for this project",
            data: { post: newPost },
        };
    } catch (error) {
        console.error("Failed to create shadow post for project", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : "Unknown error enabling comments",
        };
    }
}
