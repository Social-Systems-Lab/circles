// goals/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
    Circle,
    Media,
    RankedList, // Added
    Goal,
    GoalDisplay,
    GoalStage,
    mediaSchema,
    locationSchema,
    didSchema,
    rankedListSchema, // Added
} from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid, getUserPrivate } from "@/lib/data/user";
import { saveFile, deleteFile, FileInfo as StorageFileInfo, isFile } from "@/lib/data/storage";
import { features } from "@/lib/data/constants";
import { Circles, db, RankedLists } from "@/lib/data/db"; // Import db directly
import { ObjectId } from "mongodb";
// Placeholder imports for goal data functions (from src/lib/data/goal.ts)
import {
    getGoalsByCircleId, // Removed duplicate
    getGoalById,
    createGoal,
    updateGoal,
    deleteGoal,
    changeGoalStage,
    getActiveGoalsByCircleId,
    getGoalRanking, // Will be created in goal.ts
} from "@/lib/data/goal";
import { getMembers, getMemberIdsByUserGroup } from "@/lib/data/member"; // Will be created in member.ts
// Import goal notification functions (assuming they will be created)
import {
    notifyGoalSubmittedForReview,
    notifyGoalApproved,
    notifyGoalAssigned,
    notifyGoalStatusChanged,
} from "@/lib/data/notifications";

type GetGoalsActionResult = {
    goals: GoalDisplay[]; // Goals with aggregated and user ranks
    hasUserRanked: boolean;
    totalRankers: number;
    unrankedCount: number;
    userRankUpdatedAt: Date | null;
    userRankBecameStaleAt: Date | null;
};

/**
 * Get all goals for a circle
 * @param circleHandle The handle of the circle
 * @returns Array of goals
 */
export async function getGoalsAction(circleHandle: string): Promise<GetGoalsActionResult> {
    // Updated return type
    const defaultResult: GetGoalsActionResult = {
        goals: [],
        hasUserRanked: false,
        totalRankers: 0,
        unrankedCount: 0,
        userRankUpdatedAt: null,
        userRankBecameStaleAt: null,
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

        // 1. Get all displayable goals (might include non-rankable ones initially)
        const allGoals = await getGoalsByCircleId(circle._id as string, userDid);

        // 2. Get aggregated ranking and the set of *rankable* goal IDs
        const { rankMap: aggregatedRankMap, totalRankers, activeGoalIds } = await getGoalRanking(circleId);

        // 3. Get the current user's ranked list
        const userRankingResult = await getUserRankedListAction(circleHandle);
        const userRankedList = userRankingResult?.list || [];
        const userRankMap = new Map(userRankedList.map((goalId, index) => [goalId, index + 1]));
        const hasUserRanked = userRankedList.length > 0;

        // get staleness info
        const userRankingDoc = await RankedLists.findOne({
            entityId: circleId,
            type: "goals",
            userId: user._id,
        });
        const userRankUpdatedAt = userRankingDoc?.updatedAt || null;
        const userRankBecameStaleAt = userRankingDoc?.becameStaleAt || null;

        // 4. Calculate unranked count for the user *based on active/rankable goals*
        let unrankedCount = 0;
        if (hasUserRanked) {
            // Only calculate if user has ranked at least once
            // Count how many *active* goals are NOT in the user's map
            activeGoalIds.forEach((goalId) => {
                if (!userRankMap.has(goalId)) {
                    unrankedCount++;
                }
            });
        } else {
            // If user hasn't ranked, all active goals are unranked for them
            unrankedCount = activeGoalIds.size;
        }

        // 5. Add ranks to each goal object
        const goalsWithRanks = allGoals.map((goal) => ({
            ...goal,
            rank: aggregatedRankMap.get(goal._id!.toString()), // Aggregated rank
            userRank: userRankMap.get(goal._id!.toString()), // User's specific rank
        }));

        return {
            goals: goalsWithRanks,
            hasUserRanked,
            totalRankers,
            unrankedCount,
            userRankUpdatedAt,
            userRankBecameStaleAt,
        };
    } catch (error) {
        console.error("Error getting goals with ranking:", error);
        return defaultResult; // Return default structure on error
    }
}
/**
 * Get a single goal by ID
 * @param circleHandle The handle of the circle
 * @param goalId The ID of the goal
 * @returns The goal or null if not found or not authorized
 */
export async function getGoalAction(circleHandle: string, goalId: string): Promise<GoalDisplay | null> {
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
            circleId: circle._id as string,
            createdBy: userDid,
            createdAt: new Date(),
            stage: initialStage,
            userGroups: data.userGroups || [], // Use provided groups or default to empty
        };

        // Create goal in DB (Data function)
        const createdGoal = await createGoal(newGoalData); // Renamed function call, variable, param

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

        // Invalidate rankings as a new goal was added
        await invalidateUserRankingsIfNeededAction(circle._id!.toString());

        // Revalidate the goals list page
        revalidatePath(`/circles/${circleHandle}/goals`); // Updated path

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
export async function updateGoalAction( // Renamed function
    circleHandle: string,
    goalId: string, // Renamed param
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate form data
        const validatedData = updateGoalSchema.safeParse({
            // Renamed schema
            title: formData.get("title"),
            description: formData.get("description"),
            images: formData.getAll("images"),
            location: formData.get("location") ?? undefined,
            userGroups: formData.getAll("userGroups"),
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

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Get the existing goal (Data function)
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

        // Define who can edit and when
        // Example: Author can edit in 'review', Moderator can edit anytime before 'resolved'
        const canEdit = (isAuthor && goal.stage === "review") || (canModerate && goal.stage !== "resolved"); // Renamed variable

        if (!canEdit) {
            return { success: false, message: "Not authorized to update this goal at its current stage" }; // Updated message
        }

        // --- Parse Location ---
        let locationData: Goal["location"] = undefined; // Updated type
        if (data.location) {
            locationData = JSON.parse(data.location); // Validated by Zod
        } else {
            locationData = undefined; // Explicitly remove if empty
        }

        // --- Handle Image Updates (Similar logic to proposal update) ---
        const existingImages = goal.images || []; // Renamed variable
        const submittedImageEntries = data.images || [];
        // Use isFile helper to identify file objects
        const newImageFiles = submittedImageEntries.filter(isFile);
        const existingMediaJsonStrings = submittedImageEntries.filter(
            (entry): entry is string => typeof entry === "string",
        );

        let parsedExistingMedia: Media[] = [];
        try {
            parsedExistingMedia = existingMediaJsonStrings.map((jsonString) => JSON.parse(jsonString) as Media);
        } catch (e) {
            return { success: false, message: "Failed to process existing image data." };
        }

        const remainingExistingMediaUrls = parsedExistingMedia
            .map((media) => media?.fileInfo?.url)
            .filter((url): url is string => typeof url === "string");

        const imagesToDelete = existingImages.filter(
            (existing: Media) => !remainingExistingMediaUrls.includes(existing.fileInfo.url), // Added type Media
        );

        let newlyUploadedImages: Media[] = [];
        if (newImageFiles.length > 0) {
            const uploadPromises = newImageFiles.map(async (file) => {
                const fileNamePrefix = `goal_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Updated prefix
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
            const deletePromises = imagesToDelete.map((img: Media) => deleteFile(img.fileInfo.url)); // Added type Media
            await Promise.all(deletePromises).catch((err) => console.error("Failed to delete some images:", err)); // Log errors but continue
        }

        const finalImages: Media[] = [...parsedExistingMedia, ...newlyUploadedImages];
        // --- End Image Updates ---

        // Prepare update data
        const updateData: Partial<Goal> = {
            // Updated type
            title: data.title,
            description: data.description,
            images: finalImages,
            location: locationData,
            userGroups: data.userGroups || goal.userGroups, // Keep existing if not provided, Renamed variable
            updatedAt: new Date(),
        };

        // Update goal in DB (Data function)
        const success = await updateGoal(goalId, updateData); // Renamed function call, param

        if (!success) {
            return { success: false, message: "Failed to update goal" }; // Updated message
        }

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/goals`); // Updated path
        revalidatePath(`/circles/${circleHandle}/goals/${goalId}`); // Updated path, param

        return { success: true, message: "Goal updated successfully" }; // Updated message
    } catch (error) {
        console.error("Error updating goal:", error); // Updated message
        return { success: false, message: "Failed to update goal" }; // Updated message
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

        // Invalidate rankings as a goal was deleted
        await invalidateUserRankingsIfNeededAction(circle._id!.toString());

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
        } else if (currentStage === "open" && newStage === "inProgress") {
            // Assignee or anyone with resolve perm? Let's say resolver.
            canChange = canResolve;
        } else if (currentStage === "inProgress" && newStage === "resolved") {
            canChange = canResolve; // resolver can resolve
        } else if (currentStage === "inProgress" && newStage === "open") {
            // Allow moving back from In Progress to Open (e.g., unassigning work)
            canChange = canResolve;
        }
        // Add other valid transitions as needed

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

        // Invalidate rankings if the goal's active status changed
        const wasActive = ["open", "inProgress"].includes(currentStage);
        const isActive = ["open", "inProgress"].includes(newStage);
        if (wasActive !== isActive) {
            await invalidateUserRankingsIfNeededAction(circle._id!.toString());
        }

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

// --- Goal Prioritization Actions ---

/**
 * Get active goals eligible for prioritization for a circle.
 * Requires rank permission.
 * @param circleHandle The handle of the circle
 * @returns Array of active goals (open or inProgress)
 */
export async function getGoalsForRankingAction(circleHandle: string): Promise<GoalDisplay[]> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("User not authenticated");
        }
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            throw new Error("Circle not found");
        }

        // Check permission to rank goals
        const canRank = await isAuthorized(userDid, circle._id as string, features.goals.rank);
        if (!canRank) {
            throw new Error("Not authorized to rank goals");
        }

        // Get active goals (open, inProgress)
        const activeGoals = await getActiveGoalsByCircleId(circle._id!.toString());
        return activeGoals;
    } catch (error) {
        console.error("Error getting goals for prioritization:", error);
        return []; // Return empty on error
    }
}

/**
 * Get the current user's ranked list for goals in a circle.
 * Requires rank permission.
 * @param circleHandle The handle of the circle
 * @returns The user's RankedList or null if not found/not authorized
 */
export async function getUserRankedListAction(circleHandle: string): Promise<RankedList | null> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("User not authenticated");
        }
        const user = await getUserByDid(userDid); // Need user._id
        if (!user) {
            throw new Error("User data not found");
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            throw new Error("Circle not found");
        }

        // Check permission to rank goals
        const canRank = await isAuthorized(userDid, circle._id as string, features.goals.rank);
        if (!canRank) {
            // Don't throw error, just return null as they might not have a list anyway
            return null;
        }

        // Use imported db instance
        const rankedList = (await RankedLists.findOne({
            entityId: circle._id?.toString(),
            type: "goals",
            userId: user._id?.toString(), // Use user's _id
        })) as RankedList;
        if (rankedList) {
            rankedList._id = rankedList?._id.toString();
        }

        return rankedList;
    } catch (error) {
        console.error("Error getting user ranked list:", error);
        return null; // Return null on error
    }
}

const saveRankedListSchema = z.object({
    rankedItemIds: z.array(z.string()),
});

/**
 * Save the user's ranked list for goals in a circle.
 * Requires rank permission and the list must contain all active goals.
 * @param circleHandle The handle of the circle
 * @param formData FormData containing rankedItemIds (array of goal IDs in order)
 * @returns Success status and message
 */
export async function saveUserRankedListAction(
    circleHandle: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate input
        const validatedData = saveRankedListSchema.safeParse({
            rankedItemIds: formData.getAll("rankedItemIds"), // Assuming form sends multiple values for the same key
        });

        if (!validatedData.success) {
            return { success: false, message: "Invalid input data for ranked list." };
        }
        const { rankedItemIds } = validatedData.data;

        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const user = await getUserByDid(userDid); // Need user._id
        if (!user) {
            return { success: false, message: "User data not found" };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Check permission to rank goals
        const canRank = await isAuthorized(userDid, circle._id as string, features.goals.rank);
        if (!canRank) {
            return { success: false, message: "Not authorized to rank goals" };
        }

        // Get all currently active goals to validate the submitted list
        const activeGoals = await getActiveGoalsByCircleId(circle._id!.toString()); // Use toString()
        const activeGoalIds = new Set(activeGoals.map((t: GoalDisplay) => t._id?.toString())); // Added type GoalDisplay
        const submittedGoalIds = new Set(rankedItemIds);

        // Validate: Check if sets contain the same elements
        if (
            activeGoalIds.size !== submittedGoalIds.size ||
            ![...activeGoalIds].every((id) => submittedGoalIds.has(id))
        ) {
            return {
                success: false,
                message: "Ranking is incomplete or contains invalid goals. Please rank all active goals.",
            };
        }

        // Prepare data for upsert
        const now = new Date();
        const rankedListData: Omit<RankedList, "_id"> = {
            entityId: circle._id!.toString(),
            type: "goals",
            userId: user._id!.toString(), // Use user's _id
            list: rankedItemIds,
            createdAt: now, // Will be set on insert only
            updatedAt: now,
            isValid: true, // Saving a new list makes it valid
        };

        // Use imported db instance
        await RankedLists.updateOne(
            {
                entityId: rankedListData.entityId,
                type: rankedListData.type,
                userId: rankedListData.userId,
            },
            {
                $set: {
                    list: rankedListData.list,
                    updatedAt: rankedListData.updatedAt,
                    isValid: rankedListData.isValid,
                },
                $setOnInsert: {
                    createdAt: rankedListData.createdAt, // Only set createdAt when inserting
                },
            },
            { upsert: true },
        );

        // Revalidate the goals list page where rank sorting might be used
        revalidatePath(`/circles/${circleHandle}/goals`);

        return { success: true, message: "Goal ranking saved successfully." };
    } catch (error) {
        console.error("Error saving user ranked list:", error);
        return { success: false, message: "Failed to save goal ranking." };
    }
}

/**
 * Marks user rankings as potentially invalid if the set of active goals changes.
 * Should be called internally after goal creation, deletion, or status change affecting active state.
 * @param circleId The ID of the circle where goals changed
 */
async function invalidateUserRankingsIfNeededAction(circleId: string): Promise<void> {
    try {
        // Use imported db instance
        // Get current active goal IDs
        const activeGoals = await getActiveGoalsByCircleId(circleId); // Assuming this fetches only active
        const activeGoalIds = new Set(activeGoals.map((t: GoalDisplay) => t._id?.toString())); // Added type GoalDisplay

        // Find lists for this circle
        const listsToValidate = await RankedLists.find({
            entityId: circleId,
            type: "goals",
            isValid: true, // Only check lists currently marked as valid
        })
            .project({ _id: 1, list: 1 }) // Fetch only necessary fields
            .toArray();

        const listsToInvalidate: ObjectId[] = [];

        for (const list of listsToValidate) {
            const listGoalIds = new Set(list.list);
            if (
                listGoalIds.size !== activeGoalIds.size ||
                // Convert Set to string array using map(String) before calling every()
                !Array.from(listGoalIds)
                    .map(String)
                    .every((id: string) => activeGoalIds.has(id))
            ) {
                listsToInvalidate.push(list._id);
            }
        }

        if (listsToInvalidate.length > 0) {
            await RankedLists.updateMany(
                { _id: { $in: listsToInvalidate } },
                { $set: { isValid: false, updatedAt: new Date() } }, // Mark invalid and update timestamp
            );
            console.log(`Invalidated ${listsToInvalidate.length} goal rankings for circle ${circleId}`);
        }
    } catch (error) {
        console.error(`Error invalidating goal rankings for circle ${circleId}:`, error);
        // Don't throw, as this is often a background/cleanup goal
    }
}

// --- Modify existing actions to call invalidateUserRankingsIfNeededAction ---

// Example: Add to createGoalAction (after successful creation)
// ... inside createGoalAction try block, after successful createGoal call ...
// await invalidateUserRankingsIfNeededAction(circle._id!.toString());

// Example: Add to deleteGoalAction (after successful deletion)
// ... inside deleteGoalAction try block, after successful deleteGoal call ...
// await invalidateUserRankingsIfNeededAction(circle._id!.toString());

// Example: Add to changeGoalStageAction (if stage changes to/from active state)
// ... inside changeGoalStageAction try block, after successful changeGoalStage call ...
// const wasActive = ["open", "inProgress"].includes(currentStage);
// const isActive = ["open", "inProgress"].includes(newStage);
// if (wasActive !== isActive) {
//     await invalidateUserRankingsIfNeededAction(circle._id!.toString());
// }
