// task.ts - Task data access functions
import { Tasks, Circles, Members, Reactions, RankedLists, Feeds, Posts } from "./db"; // Added Feeds, Posts
import { ObjectId } from "mongodb";
import { Task, TaskDisplay, TaskStage, Circle, Member, RankedList, Post } from "@/models/models"; // Added Post type
import { getCircleById, SAFE_CIRCLE_PROJECTION } from "./circle";
import { getMemberIdsByUserGroup } from "./member";
import { isAuthorized } from "../auth/auth";
import { features } from "./constants"; // RANKING_STALENESS_DAYS is now in ranking.ts
import { createPost } from "./feed"; // Import createPost from feed.ts
import { upsertVbdTasks } from "./vdb";
import { getAggregateRanking, RankingContext } from "./ranking"; // Import the new generic function
// No longer need getUserByDid if we use $lookup consistently

// Safe projection for task queries, similar to proposals
export const SAFE_TASK_PROJECTION = {
    // Renamed SAFE_ISSUE_PROJECTION
    _id: 1,
    circleId: 1,
    createdBy: 1,
    createdAt: 1,
    updatedAt: 1,
    resolvedAt: 1,
    title: 1,
    description: 1,
    stage: 1,
    assignedTo: 1,
    userGroups: 1,
    location: 1,
    commentPostId: 1,
    images: 1,
    targetDate: 1,
    goal: 1,
    event: 1,
} as const;

/**
 * Get all tasks for a circle, including author and assignee details.
 * Filters results based on the user's group membership and the task's userGroups.
 * @param circleId The ID of the circle
 * @param userDid The DID of the user requesting the tasks (for visibility checks)
 * @returns Array of tasks the user is allowed to see
 */
export const getTasksByCircleId = async (
    circleId: string,
    userDid: string,
    includeCreated?: boolean,
    includeAssigned?: boolean,
): Promise<TaskDisplay[]> => {
    // Renamed function, updated return type
    try {
        const circle = await Circles.findOne({ _id: new ObjectId(circleId) });
        const matchQuery: any = { circleId };

        if (circle && circle.circleType === "user" && circle.did === userDid) {
            const userQueries = [];
            if (includeCreated) {
                userQueries.push({ createdBy: userDid });
            }
            if (includeAssigned) {
                userQueries.push({ assignedTo: userDid });
            }

            if (userQueries.length > 0) {
                matchQuery.$or = [{ circleId }, ...userQueries];
                delete matchQuery.circleId;
            }
        }

        const tasks = (await Tasks.aggregate([
            // Changed Issues to Tasks, variable issues to tasks
            // 1) Match on circleId first
            { $match: matchQuery },

            // 2) Lookup author details
            {
                $lookup: {
                    from: "circles",
                    let: { authorDid: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        // Only match if the circle's did == the task's createdBy
                                        { $eq: ["$did", "$$authorDid"] },
                                        // Only match if circleType is "user" (or whatever type you want)
                                        { $eq: ["$circleType", "user"] },
                                        // Optional, ensure the authorDid itself is not null
                                        { $ne: ["$$authorDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" }, // Convert circle _id to string
                            },
                        },
                    ],
                    as: "authorDetails",
                },
            },
            // We expect exactly one author, but if no match was found, it just won't unwind
            { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: false } },

            // 3) Lookup assignee details
            {
                $lookup: {
                    from: "circles",
                    let: { assigneeDid: "$assignedTo" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        // Only match if circle's did == task's assignedTo
                                        { $eq: ["$did", "$$assigneeDid"] },
                                        // Only match if circleType is "user"
                                        { $eq: ["$circleType", "user"] },
                                        // Optional, ensure assignedTo is not null
                                        { $ne: ["$$assigneeDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" }, // Convert circle _id to string
                            },
                        },
                    ],
                    as: "assigneeDetails",
                },
            },
            // Optional assignee => preserveNullAndEmptyArrays = true
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },

            // 3.5) Lookup circle details
            {
                $lookup: {
                    from: "circles",
                    let: { cId: { $toObjectId: "$circleId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$cId"] } } },
                        {
                            $project: {
                                _id: { $toString: "$_id" },
                                name: 1,
                                handle: 1,
                                picture: 1,
                                enabledModules: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // 4) Final projection
            {
                $project: {
                    // Include safe fields from the Task
                    ...SAFE_TASK_PROJECTION, // Renamed constant
                    // Convert the Task _id to string
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails", // null if no match
                    circle: "$circleDetails",
                },
            },

            // 5) Sort by newest first
            { $sort: { createdAt: -1 } },
        ]).toArray()) as TaskDisplay[]; // Updated type

        return tasks; // Renamed variable
    } catch (error) {
        console.error("Error getting tasks by circle ID:", error); // Updated error message
        throw error;
    }
};

/**
 * Get active tasks (open or inProgress) for a circle, including author and assignee details.
 * Filters results based on the user's group membership and the task's userGroups.
 * @param circleId The ID of the circle
 * @param userDid The DID of the user requesting the tasks (for visibility checks)
 * @returns Array of active tasks the user is allowed to see
 */
export const getActiveTasksByCircleId = async (circleId: string): Promise<TaskDisplay[]> => {
    // Added userDid as optional for potential system calls
    try {
        const tasks = (await Tasks.aggregate([
            // 1) Match on circleId and active stages first
            {
                $match: {
                    circleId,
                    stage: { $in: ["open", "inProgress"] }, // Filter for active stages
                },
            },

            // 2) Lookup author details (same as getTasksByCircleId)
            {
                $lookup: {
                    from: "circles",
                    let: { authorDid: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$authorDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$authorDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "authorDetails",
                },
            },
            { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: false } },

            // 3) Lookup assignee details (same as getTasksByCircleId)
            {
                $lookup: {
                    from: "circles",
                    let: { assigneeDid: "$assignedTo" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$assigneeDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$assigneeDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "assigneeDetails",
                },
            },
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },

            // 4) Final projection (same as getTasksByCircleId)
            {
                $project: {
                    ...SAFE_TASK_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                },
            },

            // 5) Sort by newest first (optional, might be overridden by ranking later)
            { $sort: { createdAt: -1 } },
        ]).toArray()) as TaskDisplay[];

        // TODO: Add fine-grained visibility filtering based on userDid and task.userGroups if needed
        // This might involve fetching user's memberships for the circle

        return tasks;
    } catch (error) {
        console.error("Error getting active tasks by circle ID:", error);
        throw error;
    }
};

/**
 * Get a single task by ID, including author and assignee details.
 * Does NOT perform visibility checks here, assumes calling action does.
 * @param taskId The ID of the task
 * @returns The task display data or null if not found
 */
export const getTaskById = async (
    taskId: string,
    userDid?: string, // Keep userDid for potential future use
): Promise<TaskDisplay | null> => {
    try {
        if (!ObjectId.isValid(taskId)) {
            return null;
        }

        const tasks = (await Tasks.aggregate([
            // 1) Match the specific Task by _id
            { $match: { _id: new ObjectId(taskId) } },

            // 2) Lookup author details
            {
                $lookup: {
                    from: "circles",
                    let: { authorDid: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$authorDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$authorDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "authorDetails",
                },
            },
            { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: false } },

            // 3) Lookup assignee details
            {
                $lookup: {
                    from: "circles",
                    let: { assigneeDid: "$assignedTo" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$assigneeDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$assigneeDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "assigneeDetails",
                },
            },
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },

            // 4) Lookup circle details
            {
                $lookup: {
                    from: "circles",
                    let: { cId: { $toObjectId: "$circleId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$cId"] } } },
                        {
                            $project: {
                                _id: { $toString: "$_id" },
                                name: 1,
                                handle: 1,
                                picture: 1,
                                enabledModules: 1, // Include enabledModules
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // --- 5) Lookup Goal Details ---
            {
                $lookup: {
                    from: "goals", // The collection name for goals
                    let: { goalIdString: "$goalId" }, // goalId is likely stored as string
                    pipeline: [
                        // Match goal _id (which is ObjectId) with the string goalId from task
                        // Convert goal _id to string for comparison
                        {
                            $match: {
                                $expr: {
                                    $eq: [{ $toString: "$_id" }, "$$goalIdString"],
                                },
                            },
                        },
                        // Project only needed goal fields
                        {
                            $project: {
                                _id: { $toString: "$_id" }, // Ensure goal _id is string
                                title: 1,
                                // Add other goal fields if needed later
                            },
                        },
                    ],
                    as: "goalDetails",
                },
            },
            // Goal is optional, so preserve if no match found
            { $unwind: { path: "$goalDetails", preserveNullAndEmptyArrays: true } },
            // --- End Lookup Goal Details ---

            // 6) Final projection
            {
                $project: {
                    ...SAFE_TASK_PROJECTION, // Include safe fields from the Task
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                    circle: "$circleDetails",
                    goal: "$goalDetails", // Add the looked-up goal data
                },
            },
        ]).toArray()) as TaskDisplay[];

        // The aggregation returns an array, get the first element
        const taskResult = tasks.length > 0 ? tasks[0] : null;

        // Add circle.enabledModules to the top-level task object if needed by TaskDetail directly
        // Although TaskDetail receives the full circle object anyway.
        // if (taskResult && taskResult.circle?.enabledModules) {
        //     taskResult.enabledModules = taskResult.circle.enabledModules;
        // }

        return taskResult;
    } catch (error) {
        console.error(`Error getting task by ID (${taskId}):`, error);
        throw error; // Re-throw
    }
};

/**
 * Create a new task in the database.
 * @param taskData Data for the new task (excluding _id, commentPostId)
 * @returns The created task document with its new _id and potentially commentPostId
 */
export const createTask = async (taskData: Omit<Task, "_id" | "commentPostId">): Promise<Task> => {
    try {
        // Ensure createdAt is set if not provided
        const taskToInsert = { ...taskData, createdAt: taskData.createdAt || new Date() };
        const result = await Tasks.insertOne(taskToInsert);
        if (!result.insertedId) {
            throw new Error("Failed to insert task into database.");
        }

        const createdTaskId = result.insertedId;
        let createdTask = (await Tasks.findOne({ _id: createdTaskId })) as Task | null; // Fetch the created task

        if (!createdTask) {
            throw new Error("Failed to retrieve created task immediately after insertion.");
        }

        // --- Create Shadow Post ---
        try {
            const feed = await Feeds.findOne({ circleId: taskData.circleId });
            if (!feed) {
                console.warn(
                    `No feed found for circle ${taskData.circleId} to create shadow post for task ${createdTaskId}. Commenting will be disabled.`,
                );
            } else {
                const shadowPostData: Omit<Post, "_id"> = {
                    feedId: feed._id.toString(),
                    createdBy: taskData.createdBy,
                    createdAt: new Date(),
                    content: `Task: ${taskData.title}`, // Simple content
                    postType: "task",
                    parentItemId: createdTaskId.toString(),
                    parentItemType: "task",
                    userGroups: taskData.userGroups || [],
                    comments: 0,
                    reactions: {},
                };

                const shadowPost = await createPost(shadowPostData);

                // --- Update Task with commentPostId ---
                if (shadowPost && shadowPost._id) {
                    const commentPostIdString = shadowPost._id.toString();
                    const updateResult = await Tasks.updateOne(
                        { _id: createdTaskId },
                        { $set: { commentPostId: commentPostIdString } },
                    );
                    if (updateResult.modifiedCount === 1) {
                        createdTask.commentPostId = commentPostIdString; // Update the object we return
                        console.log(`Shadow post ${commentPostIdString} created and linked to task ${createdTaskId}`);
                    } else {
                        console.error(`Failed to link shadow post ${commentPostIdString} to task ${createdTaskId}`);
                        // Optional: Delete orphaned shadow post
                        // await Posts.deleteOne({ _id: shadowPost._id });
                    }
                } else {
                    console.error(`Failed to create shadow post for task ${createdTaskId}`);
                }
            }
        } catch (postError) {
            console.error(`Error creating/linking shadow post for task ${createdTaskId}:`, postError);
        }
        // --- End Shadow Post Creation ---

        // Upsert into vector DB
        try {
            await upsertVbdTasks([createdTask as Task]);
        } catch (e) {
            console.error("Error upserting task to VDB:", e);
        }

        return createdTask as Task;
    } catch (error) {
        console.error("Error creating task:", error);
        throw new Error(`Database error creating task: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Update an existing task in the database.
 * @param taskId The ID of the task to update
 * @param updates Partial data containing fields to update
 * @returns Boolean indicating success (true) or failure (false)
 */
export const updateTask = async (taskId: string, updates: Partial<Task>): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(taskId)) {
            console.error("Invalid taskId provided for update:", taskId);
            return false;
        }

        const updateData: any = { ...updates, updatedAt: new Date() };
        delete updateData._id; // Cannot update _id

        const unsetFields: any = {};

        // Check if goalId is explicitly being set to empty string (signal for removal)
        if (updateData.hasOwnProperty("goalId") && updateData.goalId === "") {
            delete updateData.goalId; // Remove from $set
            unsetFields.goalId = ""; // Add to $unset
        }
        // Check if eventId is explicitly being set to empty string (signal for removal)
        if (updateData.hasOwnProperty("eventId") && updateData.eventId === "") {
            delete updateData.eventId; // Remove from $set
            unsetFields.eventId = ""; // Add to $unset
        }

        const updateOp: any = {};
        if (Object.keys(updateData).length > 0) {
            updateOp.$set = updateData;
        }
        if (Object.keys(unsetFields).length > 0) {
            updateOp.$unset = unsetFields;
        }

        // Only perform update if there's something to $set or $unset
        if (Object.keys(updateOp).length === 0) {
            console.log("No update operation needed for task:", taskId);
            return true; // No changes needed, consider it success
        }

        const result = await Tasks.updateOne({ _id: new ObjectId(taskId) }, updateOp);
        return result.matchedCount > 0 || result.modifiedCount > 0; // Success if matched or modified
    } catch (error) {
        console.error(`Error updating task (${taskId}):`, error);
        return false;
    }
};

/**
 * Delete a task from the database.
 * Also deletes associated comments/reactions if applicable (TODO).
 * @param taskId The ID of the task to delete
 * @returns Boolean indicating success (true) or failure (false)
 */
export const deleteTask = async (taskId: string): Promise<boolean> => {
    // Renamed function, param
    try {
        if (!ObjectId.isValid(taskId)) {
            // Renamed param
            console.error("Invalid taskId provided for delete:", taskId); // Updated error message and param
            return false;
        }
        // TODO: Add logic here to delete associated comments, reactions, or shadow post
        // Example: await Comments.deleteMany({ parentId: taskId, parentType: 'task' });
        // Example: await Reactions.deleteMany({ contentId: taskId, contentType: 'task' });

        const result = await Tasks.deleteOne({ _id: new ObjectId(taskId) }); // Changed Issues to Tasks, param issueId to taskId
        return result.deletedCount > 0;
    } catch (error) {
        console.error(`Error deleting task (${taskId}):`, error); // Updated error message and param
        return false;
    }
};

/**
 * Change the stage of a task. Updates `updatedAt` and `resolvedAt` as needed.
 * @param taskId The ID of the task
 * @param newStage The new stage to set
 * @returns Boolean indicating success (true) or failure (false)
 */
export const changeTaskStage = async (taskId: string, newStage: TaskStage): Promise<boolean> => {
    // Renamed function, params, type
    try {
        if (!ObjectId.isValid(taskId)) {
            // Renamed param
            console.error("Invalid taskId for stage change:", taskId); // Updated error message and param
            return false;
        }

        const updates: Partial<Task> = { stage: newStage, updatedAt: new Date() }; // Updated type
        const unsetFields: any = {};

        if (newStage === "resolved") {
            updates.resolvedAt = new Date();
        } else {
            // If moving out of resolved, ensure resolvedAt is unset
            unsetFields.resolvedAt = "";
        }

        const updateOp: any = { $set: updates };
        if (Object.keys(unsetFields).length > 0) {
            updateOp.$unset = unsetFields;
        }

        const result = await Tasks.updateOne({ _id: new ObjectId(taskId) }, updateOp); // Changed Issues to Tasks, param issueId to taskId
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error changing stage for task (${taskId}):`, error); // Updated error message and param
        return false;
    }
};

/**
 * Assign a task to a user or unassign it. Updates `updatedAt`.
 * @param taskId The ID of the task
 * @param assigneeDid The DID of the user to assign to, or undefined/null to unassign
 * @returns Boolean indicating success (true) or failure (false)
 */
export const assignTask = async (taskId: string, assigneeDid: string | undefined | null): Promise<boolean> => {
    // Renamed function, param
    try {
        if (!ObjectId.isValid(taskId)) {
            // Renamed param
            console.error("Invalid taskId for assignment:", taskId); // Updated error message and param
            return false;
        }

        const updateOp: any = { $set: { updatedAt: new Date() } };
        if (assigneeDid && assigneeDid !== "unassigned") {
            // Check for explicit "unassigned" value from select
            updateOp.$set.assignedTo = assigneeDid;
        } else {
            // Unset the assignedTo field if assigneeDid is null, undefined, or "unassigned"
            updateOp.$unset = { assignedTo: "" };
        }

        const result = await Tasks.updateOne({ _id: new ObjectId(taskId) }, updateOp); // Changed Issues to Tasks, param issueId to taskId
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error assigning task (${taskId}):`, error); // Updated error message and param
        return false;
    }
};

type TaskRankingResult = {
    rankMap: Map<string, number>;
    totalRankers: number;
    activeTaskIds: Set<string>; // Renamed from activeGoalIds to be consistent
};

/**
 * Retrieves the aggregate task ranking for a circle, optionally filtered by user group.
 * Uses the cached ranking if available and valid.
 * @param circleId The ID of the circle
 * @param filterUserGroupHandle Optional handle of the user group to filter by
 * @returns Promise<TaskRankingResult>
 */
export const getTaskRanking = async (circleId: string, filterUserGroupHandle?: string): Promise<TaskRankingResult> => {
    const context: RankingContext = {
        entityId: circleId,
        itemType: "tasks",
        filterUserGroupHandle: filterUserGroupHandle,
        // userDid is not strictly needed here as getAggregateRanking handles permissions internally,
        // but could be passed if needed for other reasons in the future.
    };

    try {
        // Use a reasonable cache age, e.g., 1 hour (3600 seconds)
        // Or 0 if you always want the absolute latest calculation triggered by this call
        const maxCacheAgeSeconds = 3600;
        const result = await getAggregateRanking(context, maxCacheAgeSeconds);

        // Adapt the result from getAggregateRanking to TaskRankingResult format
        return {
            rankMap: result.rankMap,
            totalRankers: result.totalRankers,
            activeTaskIds: result.activeItemIds, // Rename activeItemIds to activeTaskIds
        };
    } catch (error) {
        console.error(`Error getting task ranking for circle ${circleId}:`, error);
        // Return a default empty result on error
        return {
            rankMap: new Map(),
            totalRankers: 0,
            activeTaskIds: new Set(),
        };
    }
};

/**
 * Get all tasks linked to a specific goal ID, including author and assignee details.
 * @param goalId The ID of the goal
 * @param circleId The ID of the circle (for context and potential filtering)
 * @returns Array of tasks linked to the goal
 */
export const getTasksByGoalId = async (goalId: string, circleId: string): Promise<TaskDisplay[]> => {
    try {
        // Basic validation
        if (!goalId || !circleId) {
            return [];
        }

        const tasks = (await Tasks.aggregate([
            // 1) Match tasks by goalId and circleId
            {
                $match: {
                    goalId: goalId, // Match the specific goal ID
                    circleId: circleId, // Ensure task belongs to the correct circle
                },
            },

            // 2) Lookup author details (same as getTasksByCircleId)
            {
                $lookup: {
                    from: "circles",
                    let: { authorDid: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$authorDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$authorDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "authorDetails",
                },
            },
            { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: false } },

            // 3) Lookup assignee details (same as getTasksByCircleId)
            {
                $lookup: {
                    from: "circles",
                    let: { assigneeDid: "$assignedTo" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$assigneeDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$assigneeDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "assigneeDetails",
                },
            },
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },

            // 4) Final projection (similar to getTasksByCircleId, goal info not needed here)
            {
                $project: {
                    ...SAFE_TASK_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                    // We don't need to lookup the goal again here
                },
            },

            // 5) Sort by newest task first (optional)
            { $sort: { createdAt: -1 } },
        ]).toArray()) as TaskDisplay[];

        return tasks;
    } catch (error) {
        console.error(`Error getting tasks by goal ID (${goalId}):`, error);
        throw error;
    }
};

/**
 * Get all tasks linked to a specific event ID, including author and assignee details.
 * @param eventId The ID of the event
 * @param circleId The ID of the circle (for context and potential filtering)
 * @returns Array of tasks linked to the event
 */
export const getTasksByEventId = async (eventId: string, circleId: string): Promise<TaskDisplay[]> => {
    try {
        // Basic validation
        if (!eventId || !circleId) {
            return [];
        }

        const tasks = (await Tasks.aggregate([
            // 1) Match tasks by eventId and circleId
            {
                $match: {
                    eventId: eventId, // Match the specific event ID
                    circleId: circleId, // Ensure task belongs to the correct circle
                },
            },

            // 2) Lookup author details (same as getTasksByCircleId)
            {
                $lookup: {
                    from: "circles",
                    let: { authorDid: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$authorDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$authorDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "authorDetails",
                },
            },
            { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: false } },

            // 3) Lookup assignee details (same as getTasksByCircleId)
            {
                $lookup: {
                    from: "circles",
                    let: { assigneeDid: "$assignedTo" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$did", "$$assigneeDid"] },
                                        { $eq: ["$circleType", "user"] },
                                        { $ne: ["$$assigneeDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" },
                            },
                        },
                    ],
                    as: "assigneeDetails",
                },
            },
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },

            // 4) Final projection (similar to getTasksByCircleId)
            {
                $project: {
                    ...SAFE_TASK_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                },
            },

            // 5) Sort by newest task first (optional)
            { $sort: { createdAt: -1 } },
        ]).toArray()) as TaskDisplay[];

        return tasks;
    } catch (error) {
        console.error(`Error getting tasks by event ID (${eventId}):`, error);
        throw error;
    }
};

// TODO: Implement comment/reaction functions if needed, potentially reusing post/comment logic
// e.g., addCommentToTask, addReactionToTask, etc.
