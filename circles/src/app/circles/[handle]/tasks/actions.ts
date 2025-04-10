"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
    Circle,
    Media,
    Task,
    TaskDisplay,
    TaskStage,
    mediaSchema,
    locationSchema, // Import locationSchema
    didSchema, // Import didSchema for assignedTo validation
} from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid, getUserPrivate } from "@/lib/data/user"; // Added getUserPrivate
import { saveFile, deleteFile, FileInfo as StorageFileInfo, isFile } from "@/lib/data/storage"; // Import isFile
import { features } from "@/lib/data/constants"; // Assuming features.tasks will be added here
// Placeholder imports for task data functions (from src/lib/data/task.ts)
import {
    getTasksByCircleId,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    changeTaskStage,
    assignTask,
} from "@/lib/data/task";
import { getMembers } from "@/lib/data/member";
// Import task notification functions (assuming they will be created)
import {
    notifyTaskSubmittedForReview,
    notifyTaskApproved,
    notifyTaskAssigned,
    notifyTaskStatusChanged,
} from "@/lib/data/notifications";

/**
 * Get all tasks for a circle
 * @param circleHandle The handle of the circle
 * @returns Array of tasks
 */
export async function getTasksAction(circleHandle: string): Promise<TaskDisplay[]> {
    // Renamed function, updated return type
    try {
        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("User not authenticated");
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            throw new Error("Circle not found");
        }

        // Check if user has permission to view tasks (Placeholder feature handle)
        const canViewTasks = await isAuthorized(userDid, circle._id as string, features.tasks?.view || "tasks_view"); // Updated feature handle, variable name
        if (!canViewTasks) {
            // Updated variable name
            // Return empty array instead of throwing error, as some users might just not have access
            return [];
            // throw new Error("Not authorized to view tasks"); // Updated message
        }

        // Get tasks from the database (Data function)
        const tasks = await getTasksByCircleId(circle._id as string, userDid); // Renamed function call, variable name
        return tasks; // Renamed variable
    } catch (error) {
        console.error("Error getting tasks:", error); // Updated message
        // Return empty array on error to avoid breaking the UI
        return [];
        // throw error; // Or re-throw if preferred
    }
}

/**
 * Get a single task by ID
 * @param circleHandle The handle of the circle
 * @param taskId The ID of the task
 * @returns The task or null if not found or not authorized
 */
export async function getTaskAction(circleHandle: string, taskId: string): Promise<TaskDisplay | null> {
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

        // Get the task from the database first (Data function)
        // We need the task data to check its specific userGroups for visibility
        const task = await getTaskById(taskId, userDid); // Renamed function call, param, variable
        if (!task) {
            // Renamed variable
            return null;
        }

        // Check general permission to view any tasks in the circle (Placeholder feature handle)
        const canViewModule = await isAuthorized(userDid, circle._id as string, features.tasks?.view); // Updated feature handle

        // Check if the user belongs to any of the user groups allowed to see *this specific* task
        // This requires comparing task.userGroups with the user's groups in this circle
        // (Logic for this check needs the user's memberships for the circle)
        // For now, assume if they can view the module, they can view the specific task if found
        // TODO: Implement fine-grained access check based on task.userGroups

        if (!canViewModule) {
            // Not authorized to view tasks module at all
            return null;
            // throw new Error("Not authorized to view tasks"); // Updated message
        }

        // If authorized and task exists, return it
        return task; // Renamed variable
    } catch (error) {
        console.error("Error getting task:", error); // Updated message
        return null; // Return null on error
        // throw error; // Or re-throw
    }
}

// --- Zod Schemas for Validation ---

const createTaskSchema = z.object({
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

const updateTaskSchema = createTaskSchema.extend({
    // Renamed schema
    // Updates use the same base fields
});

const assignTaskSchema = z.object({
    // Renamed schema
    assigneeDid: didSchema.optional(), // Allow unassigning by passing undefined/null
});

// --- Action Functions ---

/**
 * Create a new task
 * @param circleHandle The handle of the circle
 * @param formData The form data containing task details
 * @returns The created task ID and success status/message
 */
export async function createTaskAction( // Renamed function
    circleHandle: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string; taskId?: string }> {
    // Renamed return property
    try {
        // Validate form data
        const validatedData = createTaskSchema.safeParse({
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

        // Check permission to create tasks (Placeholder feature handle)
        const canCreate = await isAuthorized(userDid, circle._id as string, features.tasks?.create || "tasks_create"); // Updated feature handle
        if (!canCreate) {
            return { success: false, message: "Not authorized to create tasks" }; // Updated message
        }

        // --- Parse Location ---
        let locationData: Task["location"] = undefined; // Updated type
        if (data.location) {
            locationData = JSON.parse(data.location); // Already validated by Zod refine
        }

        // --- Handle Image Uploads ---
        let uploadedImages: Media[] = [];
        // Use isFile helper to identify file objects
        const imageFiles = (data.images || []).filter(isFile);

        if (imageFiles.length > 0) {
            const uploadPromises = imageFiles.map(async (file) => {
                const fileNamePrefix = `task_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Updated prefix
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
        const initialStage: TaskStage = "review"; // Updated type
        // TODO: Check circle settings/access rules if review step can be skipped

        // Create the task object
        const newTaskData: Omit<Task, "_id" | "updatedAt" | "resolvedAt" | "assignedTo" | "commentPostId"> = {
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

        // Create task in DB (Data function)
        const createdTask = await createTask(newTaskData); // Renamed function call, variable, param

        // --- Trigger Notification ---
        const fullCreatedTask = await getTaskById(createdTask._id as string, userDid); // Fetch full display data, Renamed function call, variable
        if (fullCreatedTask) {
            // Renamed variable
            if (initialStage === "review") {
                notifyTaskSubmittedForReview(fullCreatedTask, user); // Renamed function call
            } else {
                // If skipping review (stage is 'open'), notify author it's approved/open
                notifyTaskApproved(fullCreatedTask, user); // Renamed function call, Assuming 'user' is the creator here
            }
        } else {
            console.error("🔔 [ACTION] Failed to fetch created task for notification:", createdTask._id); // Updated message, variable
        }

        // Revalidate the tasks list page
        revalidatePath(`/circles/${circleHandle}/tasks`); // Updated path

        return {
            success: true,
            message: "Task submitted successfully", // Updated message
            taskId: createdTask._id?.toString(), // Renamed property, variable
        };
    } catch (error) {
        console.error("Error creating task:", error); // Updated message
        return { success: false, message: "Failed to submit task" }; // Updated message
    }
}

/**
 * Update an existing task
 * @param circleHandle The handle of the circle
 * @param taskId The ID of the task to update
 * @param formData The form data containing updated details
 * @returns Success status and message
 */
export async function updateTaskAction( // Renamed function
    circleHandle: string,
    taskId: string, // Renamed param
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate form data
        const validatedData = updateTaskSchema.safeParse({
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

        // Get the existing task (Data function)
        const task = await getTaskById(taskId, userDid); // Renamed function call, param, variable
        if (!task) {
            // Renamed variable
            return { success: false, message: "Task not found" }; // Updated message
        }

        // Check permissions: Author or Moderator? (Placeholder feature handle)
        const isAuthor = userDid === task.createdBy; // Renamed variable
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.tasks?.moderate || "tasks_moderate", // Updated feature handle
        ); // Placeholder

        // Define who can edit and when
        // Example: Author can edit in 'review', Moderator can edit anytime before 'resolved'
        const canEdit = (isAuthor && task.stage === "review") || (canModerate && task.stage !== "resolved"); // Renamed variable

        if (!canEdit) {
            return { success: false, message: "Not authorized to update this task at its current stage" }; // Updated message
        }

        // --- Parse Location ---
        let locationData: Task["location"] = undefined; // Updated type
        if (data.location) {
            locationData = JSON.parse(data.location); // Validated by Zod
        } else {
            locationData = undefined; // Explicitly remove if empty
        }

        // --- Handle Image Updates (Similar logic to proposal update) ---
        const existingImages = task.images || []; // Renamed variable
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
                const fileNamePrefix = `task_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // Updated prefix
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
        const updateData: Partial<Task> = {
            // Updated type
            title: data.title,
            description: data.description,
            images: finalImages,
            location: locationData,
            userGroups: data.userGroups || task.userGroups, // Keep existing if not provided, Renamed variable
            updatedAt: new Date(),
        };

        // Update task in DB (Data function)
        const success = await updateTask(taskId, updateData); // Renamed function call, param

        if (!success) {
            return { success: false, message: "Failed to update task" }; // Updated message
        }

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/tasks`); // Updated path
        revalidatePath(`/circles/${circleHandle}/tasks/${taskId}`); // Updated path, param

        return { success: true, message: "Task updated successfully" }; // Updated message
    } catch (error) {
        console.error("Error updating task:", error); // Updated message
        return { success: false, message: "Failed to update task" }; // Updated message
    }
}

/**
 * Delete a task
 * @param circleHandle The handle of the circle
 * @param taskId The ID of the task to delete
 * @returns Success status and message
 */
export async function deleteTaskAction( // Renamed function
    circleHandle: string,
    taskId: string, // Renamed param
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

        // Get the task (Data function)
        const task = await getTaskById(taskId, userDid); // Renamed function call, param, variable
        if (!task) {
            // Renamed variable
            return { success: false, message: "Task not found" }; // Updated message
        }

        // Check permissions: Author or Moderator? (Placeholder feature handle)
        const isAuthor = userDid === task.createdBy; // Renamed variable
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.tasks?.moderate || "tasks_moderate", // Updated feature handle
        ); // Placeholder

        if (!isAuthor && !canModerate) {
            return { success: false, message: "Not authorized to delete this task" }; // Updated message
        }

        // --- Delete Associated Images ---
        if (task.images && task.images.length > 0) {
            // Renamed variable
            const deletePromises = task.images.map((img: Media) => deleteFile(img.fileInfo.url)); // Renamed variable, Added type Media
            await Promise.all(deletePromises).catch((err) => console.error("Failed to delete some task images:", err)); // Updated message, Log errors but continue
        }
        // --- End Delete Images ---

        // TODO: Delete associated shadow post for comments if implemented

        // Delete task from DB (Data function)
        const success = await deleteTask(taskId); // Renamed function call, param

        if (!success) {
            return { success: false, message: "Failed to delete task" }; // Updated message
        }

        // Revalidate the tasks list page
        revalidatePath(`/circles/${circleHandle}/tasks`); // Updated path

        return { success: true, message: "Task deleted successfully" }; // Updated message
    } catch (error) {
        console.error("Error deleting task:", error); // Updated message
        return { success: false, message: "Failed to delete task" }; // Updated message
    }
}

/**
 * Change the stage of a task
 * @param circleHandle The handle of the circle
 * @param taskId The ID of the task
 * @param newStage The target stage
 * @returns Success status and message
 */
export async function changeTaskStageAction( // Renamed function
    circleHandle: string,
    taskId: string, // Renamed param
    newStage: TaskStage, // Updated type
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

        // Get the task (Data function)
        const task = await getTaskById(taskId, userDid); // Renamed function call, param, variable
        if (!task) {
            // Renamed variable
            return { success: false, message: "Task not found" }; // Updated message
        }

        // --- Permission Checks based on transition ---
        let canChange = false;
        const currentStage = task.stage; // Renamed variable
        const isAssignee = userDid === task.assignedTo; // Renamed variable
        const canReview = await isAuthorized(userDid, circle._id as string, features.tasks?.review || "tasks_review"); // Updated feature handle
        const canResolve = await isAuthorized(
            userDid,
            circle._id as string,
            features.tasks?.resolve || "tasks_resolve", // Updated feature handle
        ); // Placeholder
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.tasks?.moderate || "tasks_moderate", // Updated feature handle
        ); // Placeholder

        if (canModerate) {
            canChange = true; // Moderators can likely do any valid transition
        } else if (currentStage === "review" && newStage === "open") {
            canChange = canReview; // User needs review permission
        } else if (currentStage === "open" && newStage === "inProgress") {
            // Assignee or anyone with resolve perm? Or just assignee? Let's say assignee or resolver.
            canChange = isAssignee || canResolve;
        } else if (currentStage === "inProgress" && newStage === "resolved") {
            canChange = isAssignee || canResolve; // Assignee or resolver can resolve
        } else if (currentStage === "inProgress" && newStage === "open") {
            // Allow moving back from In Progress to Open (e.g., unassigning work)
            canChange = isAssignee || canResolve; // Assignee or resolver
        }
        // Add other valid transitions as needed

        if (!canChange) {
            return { success: false, message: `Not authorized to move task from ${currentStage} to ${newStage}` }; // Updated message
        }

        // --- Update Stage in DB --- (Data function)
        const success = await changeTaskStage(taskId, newStage); // Renamed function call, param

        if (!success) {
            return { success: false, message: "Failed to change task stage" }; // Updated message
        }

        // --- Trigger Notifications ---
        const updatedTask = await getTaskById(taskId, userDid); // Get updated task for context, Renamed function call, variable, param
        if (updatedTask) {
            // Renamed variable
            if (currentStage === "review" && newStage === "open") {
                notifyTaskApproved(updatedTask, user); // Renamed function call, User is the approver here
            } else if (newStage !== currentStage) {
                // Notify for other status changes (Open -> InProgress, InProgress -> Resolved, etc.)
                notifyTaskStatusChanged(updatedTask, user, currentStage); // Renamed function call, User is the changer
            }
        } else {
            console.error("🔔 [ACTION] Failed to fetch updated task for notification:", taskId); // Updated message, param
        }

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/tasks`); // Updated path
        revalidatePath(`/circles/${circleHandle}/tasks/${taskId}`); // Updated path, param

        return { success: true, message: `Task stage changed to ${newStage}` }; // Updated message
    } catch (error) {
        console.error("Error changing task stage:", error); // Updated message
        return { success: false, message: "Failed to change task stage" }; // Updated message
    }
}

/**
 * Assign a task to a user
 * @param circleHandle The handle of the circle
 * @param taskId The ID of the task
 * @param formData Contains assigneeDid (optional)
 * @returns Success status and message
 */
export async function assignTaskAction( // Renamed function
    circleHandle: string,
    taskId: string, // Renamed param
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate assignee DID
        const validatedData = assignTaskSchema.safeParse({
            // Renamed schema
            assigneeDid: formData.get("assigneeDid") || undefined, // Handle empty string or null from form
        });

        if (!validatedData.success) {
            return { success: false, message: "Invalid assignee data" };
        }
        const { assigneeDid } = validatedData.data; // Can be string or undefined

        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const assignerUser = await getUserByDid(userDid); // For notifications
        if (!assignerUser) {
            return { success: false, message: "Assigner user data not found" };
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Get the task (Data function)
        const task = await getTaskById(taskId, userDid); // Renamed function call, param, variable
        if (!task) {
            // Renamed variable
            return { success: false, message: "Task not found" }; // Updated message
        }

        // Check permission to assign (Placeholder feature handle)
        const canAssign = await isAuthorized(userDid, circle._id as string, features.tasks?.assign); // Updated feature handle
        if (!canAssign) {
            return { success: false, message: "Not authorized to assign tasks" }; // Updated message
        }

        // Optional: Check if the assignee is actually a member of the circle?

        // Update assignment in DB (Data function)
        const success = await assignTask(taskId, assigneeDid); // Renamed function call, param, Pass undefined to unassign

        if (!success) {
            return { success: false, message: "Failed to assign task" }; // Updated message
        }

        // --- Trigger Notification ---
        const updatedTask = await getTaskById(taskId, userDid); // Get updated task, Renamed function call, variable, param
        if (updatedTask && assigneeDid && assigneeDid !== "unassigned") {
            // Renamed variable
            const assigneeUser = await getUserPrivate(assigneeDid); // Use getUserPrivate for UserPrivate type
            if (assigneeUser) {
                notifyTaskAssigned(updatedTask, assignerUser, assigneeUser); // Renamed function call
            } else {
                console.error("🔔 [ACTION] Failed to fetch assignee user for notification:", assigneeDid);
            }
        }
        // TODO: Handle notification for unassignment? (Maybe notify previous assignee?)

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/tasks`); // Updated path
        revalidatePath(`/circles/${circleHandle}/tasks/${taskId}`); // Updated path, param

        return {
            success: true,
            message: assigneeDid ? "Task assigned successfully" : "Task unassigned successfully", // Updated message
        };
    } catch (error) {
        console.error("Error assigning task:", error); // Updated message
        return { success: false, message: "Failed to assign task" }; // Updated message
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
