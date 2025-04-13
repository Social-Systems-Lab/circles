// task.ts - Task data access functions
import { Tasks, Circles, Members, Reactions, RankedLists, Feeds, Posts } from "./db"; // Added Feeds, Posts
import { ObjectId } from "mongodb";
import { Task, TaskDisplay, TaskStage, Circle, Member, RankedList, Post } from "@/models/models"; // Added Post type
import { getCircleById, SAFE_CIRCLE_PROJECTION } from "./circle";
import { getMemberIdsByUserGroup } from "./member";
import { isAuthorized } from "../auth/auth";
import { features, RANKING_STALENESS_DAYS } from "./constants";
import { createPost } from "./feed"; // Import createPost from feed.ts
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
    goal: 1,
} as const;

/**
 * Get all tasks for a circle, including author and assignee details.
 * Filters results based on the user's group membership and the task's userGroups.
 * @param circleId The ID of the circle
 * @param userDid The DID of the user requesting the tasks (for visibility checks)
 * @returns Array of tasks the user is allowed to see
 */
export const getTasksByCircleId = async (circleId: string, userDid: string): Promise<TaskDisplay[]> => {
    // Renamed function, updated return type
    try {
        const tasks = (await Tasks.aggregate([
            // Changed Issues to Tasks, variable issues to tasks
            // 1) Match on circleId first
            { $match: { circleId } },

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

            // 4) Final projection
            {
                $project: {
                    // Include safe fields from the Task
                    ...SAFE_TASK_PROJECTION, // Renamed constant
                    // Convert the Task _id to string
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails", // null if no match
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
    activeTaskIds: Set<string>; // Also return the set of IDs used for ranking
};

export const getTaskRanking = async (circleId: string, filterUserGroupHandle?: string): Promise<TaskRankingResult> => {
    // Updated return type
    const defaultResult: TaskRankingResult = {
        rankMap: new Map(),
        totalRankers: 0,
        activeTaskIds: new Set(),
    };
    const now = new Date();

    try {
        // Get active tasks
        const activeTasks = await getActiveTasksByCircleId(circleId);
        const activeTaskIds = new Set(activeTasks.map((t: TaskDisplay) => t._id!.toString()));
        const N = activeTaskIds.size;

        if (N === 0) return { ...defaultResult, activeTaskIds }; // Return empty map but with active IDs

        // Fetch all potentially relevant ranked lists
        const allRankedLists = await RankedLists.find({
            entityId: circleId,
            type: "tasks",
        }).toArray();

        // Filter lists and prepare user IDs
        const userIdsToCheck = new Set<string>();
        const potentiallyValidLists: (RankedList & { becameStaleAt?: Date | null })[] = [];
        for (const list of allRankedLists) {
            userIdsToCheck.add(list.userId);
            potentiallyValidLists.push(list);
        }

        if (potentiallyValidLists.length === 0) return { ...defaultResult, activeTaskIds };

        // Check if user of each list has permission to rank
        const users = await Circles.find({ _id: { $in: Array.from(userIdsToCheck).map((id) => new ObjectId(id)) } })
            .project<{ _id: ObjectId; did?: string }>({ _id: 1, did: 1 })
            .toArray();
        const userMap = new Map(users.map((u: { _id: ObjectId; did?: string }) => [u._id.toString(), u.did]));
        let groupMemberIds: Set<string> | null = null;
        if (filterUserGroupHandle) {
            groupMemberIds = new Set(await getMemberIdsByUserGroup(circleId, filterUserGroupHandle));
        }

        const permissionChecks = Array.from(userIdsToCheck).map(async (userId) => {
            const userDid = userMap.get(userId);
            if (!userDid) return false;
            if (groupMemberIds && !groupMemberIds.has(userId)) return false;
            // Check if user still has permission to rank (important!)
            const hasPermission = await isAuthorized(userDid, circleId, features.tasks.rank);
            return hasPermission ? userId : false;
        });

        const results = await Promise.all(permissionChecks);
        const permittedUserIds = new Set(results.filter((result): result is string => result !== false));

        // Filter the lists based on included users
        const listsToProcess = potentiallyValidLists.filter((list) => permittedUserIds.has(list.userId));
        if (listsToProcess.length === 0) return { ...defaultResult, activeTaskIds };

        // Get task creation dates for tie-breaking
        const taskCreationDates = new Map<string, Date>();
        activeTasks.forEach((task) => {
            if (task._id && task.createdAt) {
                // Ensure createdAt is stored as a Date object
                taskCreationDates.set(task._id.toString(), new Date(task.createdAt));
            }
        });

        // 4. Aggregate scores using Borda Count with Grace Period & Average Points
        const taskScores = new Map<string, number>();
        let contributingRankers = 0; // Count lists that contribute points
        const listUpdatePromises: Promise<any>[] = []; // To track DB updates

        for (const list of listsToProcess) {
            const userRankedIds = new Set(list.list);
            const isComplete = userRankedIds.size === N && list.list.every((id) => activeTaskIds.has(id));
            let listContributes = false; // Flag if this list adds points in this run

            if (isComplete) {
                // --- List is Complete and Fresh ---
                listContributes = true;
                // Assign standard Borda points
                list.list.forEach((taskId, index) => {
                    const points = N - index; // Rank 1 gets N points, etc.
                    taskScores.set(taskId, (taskScores.get(taskId) || 0) + points);
                });

                // If it was previously stale, mark it as fresh again
                if (list.becameStaleAt) {
                    listUpdatePromises.push(
                        RankedLists.updateOne({ _id: list._id }, { $unset: { becameStaleAt: "" } }),
                    );
                }
            } else {
                // --- List is Incomplete ---
                const becameStaleAt = list.becameStaleAt ? new Date(list.becameStaleAt) : null; // Ensure it's a Date object

                if (!becameStaleAt) {
                    // --- First time detected as stale: Start grace period ---
                    listContributes = true;
                    const K = list.list.length; // Items user ranked
                    const M = N - K; // Items user did not rank
                    const avgPoints = M > 0 ? (N - K + 1) / 2 : 0; // Avoid division by zero if K=N (shouldn't happen here)

                    // Assign points for explicitly ranked items
                    list.list.forEach((taskId, index) => {
                        const points = N - index;
                        taskScores.set(taskId, (taskScores.get(taskId) || 0) + points);
                    });
                    // Assign average points for unranked items
                    activeTaskIds.forEach((taskId) => {
                        if (!userRankedIds.has(taskId)) {
                            taskScores.set(taskId, (taskScores.get(taskId) || 0) + avgPoints);
                        }
                    });

                    // **Write becameStaleAt = now() to DB**
                    listUpdatePromises.push(RankedLists.updateOne({ _id: list._id }, { $set: { becameStaleAt: now } }));
                } else {
                    // --- Already stale: Check if grace period expired ---
                    const stalenessThreshold = new Date(becameStaleAt);
                    stalenessThreshold.setDate(stalenessThreshold.getDate() + RANKING_STALENESS_DAYS);

                    if (now <= stalenessThreshold) {
                        // --- Within Grace Period ---
                        listContributes = true;
                        const K = list.list.length;
                        const M = N - K;
                        const avgPoints = M > 0 ? (N - K + 1) / 2 : 0;

                        // Assign points (same logic as above)
                        list.list.forEach((taskId, index) => {
                            const points = N - index;
                            taskScores.set(taskId, (taskScores.get(taskId) || 0) + points);
                        });
                        activeTaskIds.forEach((taskId) => {
                            if (!userRankedIds.has(taskId)) {
                                taskScores.set(taskId, (taskScores.get(taskId) || 0) + avgPoints);
                            }
                        });
                    } else {
                        // --- Grace Period Expired ---
                        // List does not contribute points. No updates needed.
                        listContributes = false;
                    }
                }
            }

            if (listContributes) {
                contributingRankers++;
            }
        }

        // Wait for all potential DB updates to finish (important!)
        // Consider adding error handling for these updates if needed
        await Promise.all(listUpdatePromises);

        // 5. Convert scores to ranks
        const rankedResults = Array.from(taskScores.entries())
            .map(([taskId, score]) => ({
                taskId,
                score,
                // Retrieve creation date for sorting
                createdAt: taskCreationDates.get(taskId) || new Date(0), // Use epoch if not found
            }))
            .sort((a, b) => {
                // 1. Sort by score descending (primary criterion)
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                // 2. Sort by creation date ascending (secondary - older first)
                // Check if dates are valid before comparing getTime()
                if (a.createdAt && b.createdAt && !isNaN(a.createdAt.getTime()) && !isNaN(b.createdAt.getTime())) {
                    return a.createdAt.getTime() - b.createdAt.getTime();
                }
                // 3. Fallback tie-breaker (e.g., Task ID) if dates are missing/invalid or identical
                return a.taskId.localeCompare(b.taskId);
            });

        const rankMap = new Map<string, number>();
        rankedResults.forEach((item, index) => {
            // Assign rank 1, 2, 3, ... based on the final sorted position
            rankMap.set(item.taskId, index + 1);
        });

        return {
            rankMap,
            totalRankers: contributingRankers, // Use the count of lists that added points
            activeTaskIds,
        };
    } catch (error) {
        console.error("Error calculating task ranking:", error);
        return defaultResult; // Return default on error
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

// TODO: Implement comment/reaction functions if needed, potentially reusing post/comment logic
// e.g., addCommentToTask, addReactionToTask, etc.
