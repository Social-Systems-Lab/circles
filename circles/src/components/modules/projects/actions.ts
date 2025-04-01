"use server";

import { Circle, Post } from "@/models/models";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { createCircle, updateCircle, getCircleById } from "@/lib/data/circle";
import { addMember } from "@/lib/data/member";
import { saveFile, isFile } from "@/lib/data/storage";
import { getFeedByHandle, createPost } from "@/lib/data/feed";

export type CircleActionResponse = {
    success: boolean;
    message: string;
    data?: {
        circle?: Circle;
    };
};

export const createProjectAction = async (formData: FormData): Promise<CircleActionResponse> => {
    // check if user is authorized to edit circle settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to create a circle" };
    }

    try {
        const values = Object.fromEntries(formData.entries()) as any;
        const parentCircleId = values.parentCircleId as string;

        let authorized = await isAuthorized(userDid, parentCircleId, features.create_subcircle);
        if (!authorized) {
            return { success: false, message: "You are not authorized to create new circles" };
        }

        const circle: Circle = {
            name: values.name as string,
            handle: values.handle as string,
            description: values.description as string,
            content: values.content as string,
            isPublic: values.isPublic === "true",
            parentCircleId: parentCircleId,
            circleType: "project",
            createdBy: userDid,
            createdAt: new Date(),
        };

        let newCircle = await createCircle(circle);

        // add user as admin member to the new circle
        await addMember(userDid, newCircle._id!, ["admins", "moderators", "members"]);

        try {
            let needUpdate = false;
            if (isFile(values.picture)) {
                // save the picture and get the file info
                newCircle.picture = await saveFile(values.picture, "picture", newCircle._id, true);
                needUpdate = true;
            }

            if (isFile(values.cover)) {
                // save the cover and get the file info
                newCircle.cover = await saveFile(values.cover, "cover", newCircle._id, true);
                needUpdate = true;
            }

            // Create a shadow post for comments
            try {
                // Get the default feed of the parent circle
                const parentCircle = await getCircleById(parentCircleId);
                if (parentCircle) {
                    console.log("Creating shadow post for new project. Parent circle:", parentCircle.name);
                    // Pass "default" as the feed handle to get the default feed
                    const feed = await getFeedByHandle(parentCircleId, "default");
                    console.log("Feed found:", feed ? "yes" : "no", feed?._id);
                    if (feed) {
                        // Create a post to store comments
                        const post: Post = {
                            feedId: feed._id!,
                            createdBy: userDid,
                            createdAt: new Date(),
                            content: "", // Empty content since we're displaying the project content separately
                            reactions: {},
                            comments: 0,
                            media: [],
                            postType: "project", // Mark as project shadow post
                            userGroups: ["admins", "moderators", "members", "everyone"],
                        };

                        const newPost = await createPost(post);
                        console.log("Created shadow post:", newPost._id);

                        // Store the post ID in the project metadata
                        newCircle.metadata = {
                            ...newCircle.metadata,
                            commentPostId: newPost._id,
                        };
                        console.log("Updated circle metadata:", newCircle.metadata);

                        needUpdate = true;
                    }
                }
            } catch (error) {
                console.error("Failed to create shadow post for project", error);
            }

            if (needUpdate) {
                await updateCircle(newCircle);
            }
        } catch (error) {
            console.log("Failed to save circle files", error);
        }

        return { success: true, message: "Project created successfully", data: { circle: newCircle } };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to create the project. " + JSON.stringify(error) };
        }
    }
};
