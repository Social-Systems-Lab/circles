// goals/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Media, Goal, GoalDisplay, GoalStage, locationSchema, GoalMember } from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid } from "@/lib/data/user";
import { saveFile, deleteFile, FileInfo as StorageFileInfo, isFile } from "@/lib/data/storage";
import { features } from "@/lib/data/constants";
import { Feeds, Posts, Goals, GoalMembers } from "@/lib/data/db"; // Import DB collections
import { Post } from "@/models/models"; // Import Post type (Removed duplicate Goal)
import { createPost } from "@/lib/data/feed"; // Import createPost
import { ObjectId } from "mongodb"; // Import ObjectId
import { getGoalsByCircleId, getGoalById, createGoal, updateGoal, deleteGoal, changeGoalStage } from "@/lib/data/goal";
import { getMembers } from "@/lib/data/member";
import { notifyGoalSubmittedForReview, notifyGoalApproved, notifyGoalStatusChanged } from "@/lib/data/notifications";

import { ensureModuleIsEnabledOnCircle } from "@/lib/data/circle"; // Added

// Removed ranking-related properties from result type
type GetGoalsActionResult = {
    goals: GoalDisplay[];
};

/**
 * Get all goals for a circle
 * @param circleHandle The handle of the circle
 * @returns Array of goals
 */
export async function getGoalsAction(circleHandle: string): Promise<GetGoalsActionResult> {
    const defaultResult: GetGoalsActionResult = {
        goals: [],
    };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("User not authenticated");
        }
        const user = await getUserByDid(userDid); // Need user._id
        if (!user) {
            throw new Error("User not found");
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            throw new Error("Circle not found");
        }
        const circleId = circle._id!.toString();

        const canViewGoals = await isAuthorized(userDid, circleId, features.goals.view);
        if (!canViewGoals) {
            return defaultResult;
        }

        // Get all displayable goals
        const allGoals = await getGoalsByCircleId(circle._id as string, userDid);

        // Removed ranking logic

        return {
            goals: allGoals, // Return goals directly without rank info
        };
    } catch (error) {
        console.error("Error getting goals:", error); // Updated message
        return defaultResult;
    }
}
/**
 * Get a single goal by ID
 * @param circleHandle The handle of the circle
 * @param goalId The ID of the goal
 * @returns The goal or null if not found or not authorized
 */
export async function getGoalAction(circleHandle: string, goalId: string): Promise<GoalDisplay | null> {
    // Added type string to goalId
    // Renamed function, param, return type
    try {
        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            // Not authenticated, cannot view
            return null;
            // throw new Error("User not authenticated");
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            // Circle doesn't exist
            return null;
            // throw new Error("Circle not found");
        }

        // Get the goal from the database first (Data function)
        // We need the goal data to check its specific userGroups for visibility
        const goal = await getGoalById(goalId, userDid); // Renamed function call, param, variable
        if (!goal) {
            // Renamed variable
            return null;
        }

        // Check general permission to view any goals in the circle (Placeholder feature handle)
        const canViewModule = await isAuthorized(userDid, circle._id as string, features.goals?.view); // Updated feature handle

        // Check if the user belongs to any of the user groups allowed to see *this specific* goal
        // This requires comparing goal.userGroups with the user's groups in this circle
        // (Logic for this check needs the user's memberships for the circle)
        // For now, assume if they can view the module, they can view the specific goal if found
        // TODO: Implement fine-grained access check based on goal.userGroups

        if (!canViewModule) {
            // Not authorized to view goals module at all
            return null;
            // throw new Error("Not authorized to view goals"); // Updated message
        }

        // If authorized and goal exists, return it
        return goal; // Renamed variable
    } catch (error) {
        console.error("Error getting goal:", error); // Updated message
        return null; // Return null on error
        // throw error; // Or re-throw
    }
}

// --- Zod Schemas for Validation ---

const createGoalSchema = z.object({
    // Renamed schema
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    images: z.array(z.any()).optional(), // Allow files or existing Media objects initially
    location: z
        .string()
        .optional()
        .refine(
            (val) => {
                if (!val) return true; // Optional is fine
                try {
                    locationSchema.parse(JSON.parse(val)); // Validate parsed object
                    return true;
                } catch {
                    return false;
                }
            },
            { message: "Invalid location data format" },
        ),
    userGroups: z.array(z.string()).optional(), // Optional: User groups for visibility
    targetDate: z.string().datetime({ offset: true }).optional(), // Expect ISO string from form
});

const updateGoalSchema = createGoalSchema.extend({
    // Renamed schema
    // Updates use the same base fields
});

// --- Action Functions ---

/**
 * Create a new goal
 * @param circleHandle The handle of the circle
 * @param formData The form data containing goal details
 * @returns The created goal ID and success status/message
 */
export async function createGoalAction( // Renamed function
    circleHandle: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string; goalId?: string }> {
    // Renamed return property
    try {
        // Validate form data
        const validatedData = createGoalSchema.safeParse({
            // Renamed schema
            title: formData.get("title"),
            description: formData.get("description"),
            images: formData.getAll("images"),
            location: formData.get("location") ?? undefined,
            userGroups: formData.getAll("userGroups"), // Assuming multi-select or similar
            targetDate: formData.get("targetDate") ?? undefined, // Get targetDate string
        });

        if (!validatedData.success) {
            console.error("Validation Error:", validatedData.error.errors);
            return {
                success: false,
                message: `Invalid input: ${validatedData.error.errors.map((e) => e.message).join(", ")}`,
            };
        }
        const data = validatedData.data;

        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const user = await getUserByDid(userDid);
        if (!user) {
            return { success: false, message: "User data not found" };
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Check permission to create goals (Placeholder feature handle)
        const canCreate = await isAuthorized(userDid, circle._id as string, features.goals?.create || "goals_create"); // Updated feature handle
        if (!canCreate) {
            return { success: false, message: "Not authorized to create goals" }; // Updated message
        }

        // --- Parse Location ---
        let locationData: Goal["location"] = undefined; // Updated type
        if (data.location) {
            locationData = JSON.parse(data.location); // Already validated by Zod refine
        }

        // --- Parse Target Date ---
        let targetDateData: Date | undefined = undefined;
        if (data.targetDate) {
            try {
                targetDateData = new Date(data.targetDate); // Convert ISO string to Date
            } catch (e) {
                console.error("Invalid target date format received:", data.targetDate);
                // Optionally return error or ignore invalid date
            }
        }

        // --- Handle Image Uploads ---
        let uploadedImages: Media[] = [];
        // Use isFile helper to identify file objects
        const imageFiles = (data.images || []).filter(isFile);

        if (imageFiles.length > 0) {
            const uploadPromises = imageFiles.map(async (file) => {
                const fileNamePrefix = `goal_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Updated prefix
                return await saveFile(file, fileNamePrefix, circle._id as string, true);
            });
            const uploadResults = await Promise.all(uploadPromises);

            uploadedImages = uploadResults.map(
                (result: StorageFileInfo): Media => ({
                    name: result.originalName || "Uploaded Image",
                    type: imageFiles.find((f) => f.name === result.originalName)?.type || "application/octet-stream",
                    fileInfo: {
                        url: result.url,
                        fileName: result.fileName,
                        originalName: result.originalName,
                    },
                }),
            );
        }
        // --- End Image Uploads ---

        // Determine initial stage based on circle rules (e.g., skip review?)
        // For now, default to 'review' as per spec
        const initialStage: GoalStage = "review"; // Updated type
        // TODO: Check circle settings/access rules if review step can be skipped

        // Create the goal object
        const newGoalData: Omit<Goal, "_id" | "updatedAt" | "resolvedAt" | "commentPostId"> = {
            // Renamed variable, updated type
            title: data.title,
            description: data.description,
            images: uploadedImages,
            location: locationData,
            targetDate: targetDateData, // Add parsed target date
            circleId: circle._id as string,
            createdBy: userDid,
            createdAt: new Date(),
            stage: initialStage,
            userGroups: data.userGroups || [], // Use provided groups or default to empty
        };

        // Create goal in DB (Data function)
        const createdGoal = await createGoal(newGoalData); // Renamed function call, variable, param

        // Automatically follow the goal for the creator
        if (createdGoal && createdGoal._id && user && user._id && circle && circle._id) {
            const creatorGoalMember: Omit<GoalMember, "_id"> = {
                userId: user._id.toString(),
                goalId: createdGoal._id.toString(),
                circleId: circle._id.toString(),
                joinedAt: new Date(),
            };
            try {
                await GoalMembers.insertOne(creatorGoalMember);
                console.log(
                    `User ${user._id.toString()} automatically followed created goal ${createdGoal._id.toString()}`,
                );
            } catch (followError) {
                console.error(
                    `Failed to automatically follow goal ${createdGoal._id.toString()} for user ${user._id.toString()}:`,
                    followError,
                );
                // Non-critical, so don't fail the goal creation
            }
        }

        // --- Trigger Notification ---
        const fullCreatedGoal = await getGoalById(createdGoal._id as string, userDid); // Fetch full display data, Renamed function call, variable
        if (fullCreatedGoal) {
            // Renamed variable
            if (initialStage === "review") {
                notifyGoalSubmittedForReview(fullCreatedGoal, user); // Renamed function call
            } else {
                // If skipping review (stage is 'open'), notify author it's approved/open
                notifyGoalApproved(fullCreatedGoal, user); // Renamed function call, Assuming 'user' is the creator here
            }
        } else {
            console.error("🔔 [ACTION] Failed to fetch created goal for notification:", createdGoal._id); // Updated message, variable
        }

        // Removed invalidate rankings call

        // Revalidate the goals list page
        revalidatePath(`/circles/${circleHandle}/goals`); // Updated path

        // Ensure 'goals' module is enabled if creating in user's own circle
        try {
            if (circle.circleType === "user" && circle.did === userDid) {
                await ensureModuleIsEnabledOnCircle(circle._id as string, "goals", userDid);
            }
        } catch (moduleEnableError) {
            console.error("Failed to ensure goals module is enabled on user circle:", moduleEnableError);
            // Non-critical, so don't fail the goal creation
        }

        return {
            success: true,
            message: "Goal submitted successfully", // Updated message
            goalId: createdGoal._id?.toString(), // Renamed property, variable
        };
    } catch (error) {
        console.error("Error creating goal:", error); // Updated message
        return { success: false, message: "Failed to submit goal" }; // Updated message
    }
}

/**
 * Update an existing goal
 * @param circleHandle The handle of the circle
 * @param goalId The ID of the goal to update
 * @param formData The form data containing updated details
 * @returns Success status and message
 */
export async function updateGoalAction(
    circleHandle: string,
    goalId: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate form data
        const validatedData = updateGoalSchema.safeParse({
            title: formData.get("title"),
            description: formData.get("description"),
            images: formData.getAll("images"),
            location: formData.get("location") ?? undefined,
            userGroups: formData.getAll("userGroups"),
            targetDate: formData.get("targetDate") ?? undefined, // Keep as string or undefined initially
        });

        if (!validatedData.success) {
            // ... error handling ...
            console.error("Validation Error:", validatedData.error.errors);
            return {
                success: false,
                message: `Invalid input: ${validatedData.error.errors.map((e) => e.message).join(", ")}`,
            };
        }
        const data = validatedData.data;

        // ... user, circle, goal fetching and permission checks ...
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };
        const goal = await getGoalById(goalId, userDid);
        if (!goal) return { success: false, message: "Goal not found" };
        const isAuthor = userDid === goal.createdBy;
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.goals?.moderate || "goals_moderate",
        );
        const canEdit = (isAuthor && goal.stage === "review") || (canModerate && goal.stage !== "resolved");
        if (!canEdit) return { success: false, message: "Not authorized to update this goal at its current stage" };

        // --- Parse Location ---
        let locationData: Goal["location"] = undefined;
        if (data.location) {
            try {
                locationData = JSON.parse(data.location);
            } catch {
                /* ignore error, already validated */
            }
        }

        // --- Parse Target Date ---
        let targetDateForUpdate: Date | null | undefined = undefined; // Use null to signal unset
        if (data.targetDate && data.targetDate.trim() !== "") {
            // Check if string is not empty
            try {
                targetDateForUpdate = new Date(data.targetDate);
                // Optional: Add validation if the date is invalid
                if (isNaN(targetDateForUpdate.getTime())) {
                    console.warn("Invalid target date string received:", data.targetDate);
                    targetDateForUpdate = undefined; // Treat invalid date as not provided
                }
            } catch (e) {
                console.error("Error parsing target date:", data.targetDate, e);
                targetDateForUpdate = undefined; // Treat parse error as not provided
            }
        } else {
            // If date string is empty or not provided, signal to unset the date
            targetDateForUpdate = null;
        }

        // --- Handle Image Updates ---
        const existingImages = goal.images || [];
        const submittedImageEntries = data.images || [];
        const newImageFiles = submittedImageEntries.filter(isFile);
        const existingMediaJsonStrings = submittedImageEntries.filter(
            (entry): entry is string => typeof entry === "string",
        );
        let parsedExistingMedia: Media[] = [];
        try {
            parsedExistingMedia = existingMediaJsonStrings.map((jsonString) => JSON.parse(jsonString));
        } catch (e) {
            return { success: false, message: "Failed to process existing image data." };
        }
        const remainingExistingMediaUrls = new Set(parsedExistingMedia.map((media) => media?.fileInfo?.url));
        const imagesToDelete = existingImages.filter(
            (existing) => !remainingExistingMediaUrls.has(existing.fileInfo.url),
        );
        let newlyUploadedImages: Media[] = [];
        if (newImageFiles.length > 0) {
            const uploadPromises = newImageFiles.map(async (file) => {
                const fileNamePrefix = `goal_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                return await saveFile(file, fileNamePrefix, circle._id as string, true);
            });
            const uploadResults = await Promise.all(uploadPromises);
            newlyUploadedImages = uploadResults.map(
                (result: StorageFileInfo): Media => ({
                    name: result.originalName || "Uploaded Image",
                    type: newImageFiles.find((f) => f.name === result.originalName)?.type || "application/octet-stream",
                    fileInfo: { url: result.url, fileName: result.fileName, originalName: result.originalName },
                }),
            );
        }
        if (imagesToDelete.length > 0) {
            const deletePromises = imagesToDelete.map((img) => deleteFile(img.fileInfo.url));
            await Promise.all(deletePromises).catch((err) => console.error("Failed to delete some images:", err));
        }
        const finalImages: Media[] = [...parsedExistingMedia, ...newlyUploadedImages];
        // --- End Image Updates ---

        // --- Prepare FLAT update data object ---
        const flatUpdateData: Partial<Goal> = {
            title: data.title,
            description: data.description,
            images: finalImages,
            location: locationData,
            // Pass Date object, null (to unset), or undefined (to leave unchanged)
            targetDate: targetDateForUpdate,
            userGroups: data.userGroups || goal.userGroups,
            // DO NOT include updatedAt here, updateGoal handles it
        };

        // Remove undefined fields so they don't overwrite existing data unnecessarily
        Object.keys(flatUpdateData).forEach(
            (key) =>
                flatUpdateData[key as keyof typeof flatUpdateData] === undefined &&
                delete flatUpdateData[key as keyof typeof flatUpdateData],
        );

        // --- Update goal in DB (Pass the FLAT object) ---
        const success = await updateGoal(goalId, flatUpdateData);

        if (!success) {
            return { success: false, message: "Failed to update goal" };
        }

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/goals`);
        revalidatePath(`/circles/${circleHandle}/goals/${goalId}`);

        return { success: true, message: "Goal updated successfully" };
    } catch (error) {
        console.error("Error updating goal:", error);
        return { success: false, message: "Failed to update goal" };
    }
}

/**
 * Delete a goal
 * @param circleHandle The handle of the circle
 * @param goalId The ID of the goal to delete
 * @returns Success status and message
 */
export async function deleteGoalAction( // Renamed function
    circleHandle: string,
    goalId: string, // Renamed param
): Promise<{ success: boolean; message?: string }> {
    try {
        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Get the goal (Data function)
        const goal = await getGoalById(goalId, userDid); // Renamed function call, param, variable
        if (!goal) {
            // Renamed variable
            return { success: false, message: "Goal not found" }; // Updated message
        }

        // Check permissions: Author or Moderator? (Placeholder feature handle)
        const isAuthor = userDid === goal.createdBy; // Renamed variable
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.goals?.moderate || "goals_moderate", // Updated feature handle
        ); // Placeholder

        if (!isAuthor && !canModerate) {
            return { success: false, message: "Not authorized to delete this goal" }; // Updated message
        }

        // --- Delete Associated Images ---
        if (goal.images && goal.images.length > 0) {
            // Renamed variable
            const deletePromises = goal.images.map((img: Media) => deleteFile(img.fileInfo.url)); // Renamed variable, Added type Media
            await Promise.all(deletePromises).catch((err) => console.error("Failed to delete some goal images:", err)); // Updated message, Log errors but continue
        }
        // --- End Delete Images ---

        // TODO: Delete associated shadow post for comments if implemented

        // Delete goal from DB (Data function)
        const success = await deleteGoal(goalId); // Renamed function call, param

        if (!success) {
            return { success: false, message: "Failed to delete goal" }; // Updated message
        }

        // Removed invalidate rankings call

        // Revalidate the goals list page
        revalidatePath(`/circles/${circleHandle}/goals`); // Updated path

        return { success: true, message: "Goal deleted successfully" }; // Updated message
    } catch (error) {
        console.error("Error deleting goal:", error); // Updated message
        return { success: false, message: "Failed to delete goal" }; // Updated message
    }
}

/**
 * Change the stage of a goal
 * @param circleHandle The handle of the circle
 * @param goalId The ID of the goal
 * @param newStage The target stage
 * @returns Success status and message
 */
export async function changeGoalStageAction( // Renamed function
    circleHandle: string,
    goalId: string, // Renamed param
    newStage: GoalStage, // Updated type
): Promise<{ success: boolean; message?: string }> {
    try {
        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const user = await getUserByDid(userDid); // For notifications
        if (!user) {
            return { success: false, message: "User data not found" };
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Get the goal (Data function)
        const goal = await getGoalById(goalId, userDid); // Renamed function call, param, variable
        if (!goal) {
            // Renamed variable
            return { success: false, message: "Goal not found" }; // Updated message
        }

        // --- Permission Checks based on transition ---
        let canChange = false;
        const currentStage = goal.stage; // Renamed variable
        const canReview = await isAuthorized(userDid, circle._id as string, features.goals?.review || "goals_review"); // Updated feature handle
        const canResolve = await isAuthorized(
            userDid,
            circle._id as string,
            features.goals?.resolve || "goals_resolve", // Updated feature handle
        ); // Placeholder
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.goals?.moderate || "goals_moderate", // Updated feature handle
        ); // Placeholder

        if (canModerate) {
            canChange = true; // Moderators can likely do any valid transition
        } else if (currentStage === "review" && newStage === "open") {
            canChange = canReview; // User needs review permission
        } else if (currentStage === "open" && newStage === "resolved") {
            // Changed target stage from inProgress to resolved
            canChange = canResolve;
        } else if (currentStage === "resolved" && newStage === "open") {
            // Allow moving back from Resolved to Open
            canChange = canResolve;
        }
        // Removed transitions involving "inProgress"

        if (!canChange) {
            return { success: false, message: `Not authorized to move goal from ${currentStage} to ${newStage}` }; // Updated message
        }

        // --- Update Stage in DB --- (Data function)
        const success = await changeGoalStage(goalId, newStage); // Renamed function call, param

        if (!success) {
            return { success: false, message: "Failed to change goal stage" }; // Updated message
        }

        // --- Trigger Notifications ---
        const updatedGoal = await getGoalById(goalId, userDid); // Get updated goal for context, Renamed function call, variable, param
        if (updatedGoal) {
            // Renamed variable
            if (currentStage === "review" && newStage === "open") {
                notifyGoalApproved(updatedGoal, user); // Renamed function call, User is the approver here
            } else if (newStage !== currentStage) {
                // Notify for other status changes (Open -> InProgress, InProgress -> Resolved, etc.)
                notifyGoalStatusChanged(updatedGoal, user, currentStage); // Renamed function call, User is the changer
            }
        } else {
            console.error("🔔 [ACTION] Failed to fetch updated goal for notification:", goalId); // Updated message, param
        }

        // Removed invalidate rankings call

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/goals`); // Updated path
        revalidatePath(`/circles/${circleHandle}/goals/${goalId}`); // Updated path, param

        return { success: true, message: `Goal stage changed to ${newStage}` }; // Updated message
    } catch (error) {
        console.error("Error changing goal stage:", error); // Updated message
        return { success: false, message: "Failed to change goal stage" }; // Updated message
    }
}

export const getMembersAction = async (circleId: string) => {
    // Get the current user
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "User not authenticated" };
    }
    const user = await getUserByDid(userDid); // For notifications
    if (!user) {
        return { success: false, message: "User data not found" };
    }

    // get members of circle
    let members = await getMembers(circleId);
    return members;
};

// TODO: Add actions for comment handling if using shadow posts or a dedicated system.

/**
 * Ensures a shadow post exists for comments on a goal. Creates one if missing.
 * Called server-side, e.g., from the page component.
 * @param goalId The ID of the goal
 * @param circleId The ID of the circle
 * @returns The commentPostId (string) or null if creation failed or wasn't needed.
 */
export async function ensureShadowPostForGoalAction(goalId: string, circleId: string): Promise<string | null> {
    try {
        if (!ObjectId.isValid(goalId) || !ObjectId.isValid(circleId)) {
            console.error("Invalid goalId or circleId provided to ensureShadowPostForGoalAction");
            return null;
        }

        const goal = await Goals.findOne({ _id: new ObjectId(goalId) });

        if (!goal) {
            console.error(`Goal not found: ${goalId}`);
            return null;
        }

        // If commentPostId already exists, return it
        if (goal.commentPostId) {
            return goal.commentPostId;
        }

        // --- Create Shadow Post if missing ---
        console.log(`Shadow post missing for goal ${goalId}, attempting creation...`);
        const feed = await Feeds.findOne({ circleId: circleId });
        if (!feed) {
            console.warn(
                `No feed found for circle ${circleId} to create shadow post for goal ${goalId}. Cannot enable comments.`,
            );
            return null; // Cannot create post without a feed
        }

        const shadowPostData: Omit<Post, "_id"> = {
            feedId: feed._id.toString(),
            createdBy: goal.createdBy, // Use goal creator
            createdAt: new Date(),
            content: `Goal: ${goal.title}`, // Simple content
            postType: "goal",
            parentItemId: goal._id.toString(),
            parentItemType: "goal",
            userGroups: goal.userGroups || [],
            comments: 0,
            reactions: {},
        };

        const shadowPost = await createPost(shadowPostData); // Use the imported createPost

        if (shadowPost && shadowPost._id) {
            const commentPostIdString = shadowPost._id.toString();
            const updateResult = await Goals.updateOne(
                { _id: goal._id },
                { $set: { commentPostId: commentPostIdString } },
            );
            if (updateResult.modifiedCount === 1) {
                console.log(`Shadow post ${commentPostIdString} created and linked to goal ${goalId}`);
                return commentPostIdString; // Return the new ID
            } else {
                console.error(`Failed to link shadow post ${commentPostIdString} back to goal ${goalId}`);
                // Optional: Delete orphaned shadow post
                // await Posts.deleteOne({ _id: shadowPost._id });
                return null; // Linking failed
            }
        } else {
            console.error(`Failed to create shadow post for goal ${goalId}`);
            return null; // Post creation failed
        }
    } catch (error) {
        console.error(`Error in ensureShadowPostForGoalAction for goal ${goalId}:`, error);
        return null; // Return null on any error
    }
}

// --- Removed Goal Prioritization Actions ---
// Removed getGoalsForRankingAction
// Removed getUserRankedListAction
// Removed saveUserRankedListAction
// Removed invalidateUserRankingsIfNeededAction

/**
 * Follow a goal
 * @param circleHandle The handle of the circle
 * @param goalId The ID of the goal to follow
 * @returns Success status and message
 */
export async function followGoalAction(
    circleHandle: string,
    goalId: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const user = await getUserByDid(userDid);
        if (!user || !user._id) {
            return { success: false, message: "User data not found" };
        }
        const userId = user._id.toString();

        const circle = await getCircleByHandle(circleHandle);
        if (!circle || !circle._id) {
            return { success: false, message: "Circle not found" };
        }
        const circleId = circle._id.toString();

        const goal = await getGoalById(goalId, userDid);
        if (!goal) {
            return { success: false, message: "Goal not found" };
        }

        const canFollowGoal = await isAuthorized(userDid, circleId, features.goals.follow);
        if (!canFollowGoal) {
            return { success: false, message: "Not authorized to follow goals in this circle" };
        }

        const existingFollow = await GoalMembers.findOne({ userId, goalId, circleId });
        if (existingFollow) {
            return { success: true, message: "Already following this goal" };
        }

        const newGoalMember: Omit<GoalMember, "_id"> = {
            userId,
            goalId,
            circleId,
            joinedAt: new Date(),
        };

        await GoalMembers.insertOne(newGoalMember);

        revalidatePath(`/circles/${circleHandle}/goals`);
        revalidatePath(`/circles/${circleHandle}/goals/${goalId}`);

        // TODO: Add notification for goal follower if desired

        return { success: true, message: "Successfully followed goal" };
    } catch (error) {
        console.error("Error following goal:", error);
        return { success: false, message: "Failed to follow goal" };
    }
}

/**
 * Unfollow a goal
 * @param circleHandle The handle of the circle
 * @param goalId The ID of the goal to unfollow
 * @returns Success status and message
 */
export async function unfollowGoalAction(
    circleHandle: string,
    goalId: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const user = await getUserByDid(userDid);
        if (!user || !user._id) {
            return { success: false, message: "User data not found" };
        }
        const userId = user._id.toString();

        const circle = await getCircleByHandle(circleHandle);
        if (!circle || !circle._id) {
            return { success: false, message: "Circle not found" };
        }
        const circleId = circle._id.toString();

        // Goal existence check (optional for unfollow, but good for consistency)
        const goal = await getGoalById(goalId, userDid);
        if (!goal) {
            // If goal doesn't exist or user can't see it, they can't be following it.
            // Or, we could allow unfollowing even if the goal is deleted/hidden.
            // For now, let's assume if they can't see it, the unfollow is effectively done.
            // However, to prevent accidental unfollows of non-existent items, let's check.
            return { success: false, message: "Goal not found or not accessible" };
        }

        // No specific authorization check for unfollowing, if they were following, they can unfollow.

        const result = await GoalMembers.deleteOne({ userId, goalId, circleId });

        if (result.deletedCount === 0) {
            return { success: true, message: "Not following this goal or already unfollowed" };
        }

        revalidatePath(`/circles/${circleHandle}/goals`);
        revalidatePath(`/circles/${circleHandle}/goals/${goalId}`);

        // TODO: Add notification if desired (e.g., "You are no longer following X goal")

        return { success: true, message: "Successfully unfollowed goal" };
    } catch (error) {
        console.error("Error unfollowing goal:", error);
        return { success: false, message: "Failed to unfollow goal" };
    }
}

/**
 * Get follow status and count for a goal
 * @param goalId The ID of the goal
 * @returns Object with isFollowing (boolean) and followerCount (number)
 */
export async function getGoalFollowDataAction(
    goalId: string,
): Promise<{ isFollowing: boolean; followerCount: number } | null> {
    try {
        const userDid = await getAuthenticatedUserDid();
        // User doesn't need to be authenticated to get total follower count,
        // but isFollowing will be false if not authenticated.

        let userId: string | undefined;
        if (userDid) {
            const user = await getUserByDid(userDid);
            if (user && user._id) {
                userId = user._id.toString();
            }
        }

        if (!ObjectId.isValid(goalId)) {
            console.error("Invalid goalId provided to getGoalFollowDataAction");
            return null;
        }

        const followerCount = await GoalMembers.countDocuments({ goalId });

        let isFollowing = false;
        if (userId) {
            const existingFollow = await GoalMembers.findOne({ userId, goalId });
            isFollowing = !!existingFollow;
        }

        return { isFollowing, followerCount };
    } catch (error) {
        console.error("Error getting goal follow data:", error);
        return null;
    }
}
