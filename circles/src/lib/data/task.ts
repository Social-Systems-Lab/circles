// task.ts - Task data access functions
import { Tasks, Circles, Members, Reactions } from "./db"; // Changed Issues to Tasks
import { ObjectId } from "mongodb";
import { Task, TaskDisplay, TaskStage, Circle, Member } from "@/models/models"; // Changed Issue types to Task types
import { getCircleById, SAFE_CIRCLE_PROJECTION } from "./circle";
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
 * Get a single task by ID, including author and assignee details.
 * Does NOT perform visibility checks here, assumes calling action does.
 * @param taskId The ID of the task
 * @returns The task display data or null if not found
 */
export const getTaskById = async (taskId: string, userDid?: string): Promise<TaskDisplay | null> => {
    // Renamed function, params, return type
    try {
        if (!ObjectId.isValid(taskId)) {
            // Renamed param
            return null;
        }

        const tasks = (await Tasks.aggregate([
            // Changed Issues to Tasks, variable issues to tasks
            // 1) Match the specific Task by _id
            { $match: { _id: new ObjectId(taskId) } }, // Renamed param

            // 2) Lookup author details, only match if circleType = "user" and did = createdBy
            {
                $lookup: {
                    from: "circles",
                    let: { authorDid: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        // must match the author DID
                                        { $eq: ["$did", "$$authorDid"] },
                                        // ensure circleType is "user" for actual user circles
                                        { $eq: ["$circleType", "user"] },
                                        // optional: ignore null or missing did
                                        { $ne: ["$$authorDid", null] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                ...SAFE_CIRCLE_PROJECTION,
                                _id: { $toString: "$_id" }, // convert ObjectId -> string
                            },
                        },
                    ],
                    as: "authorDetails",
                },
            },
            // expect exactly one author, but if none found, it won't unwind
            { $unwind: { path: "$authorDetails", preserveNullAndEmptyArrays: false } },

            // 3) Lookup assignee details, also restricted to circleType="user"
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
            // optional assignee => preserveNullAndEmptyArrays = true
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },

            // 4) Lookup circle details (if the Task is associated with some circle _id).
            //    Typically you only have one circle doc with that _id, so no duplication.
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
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // 5) Final projection
            {
                $project: {
                    // Include safe fields from the Task
                    ...SAFE_TASK_PROJECTION, // Renamed constant
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                    circle: "$circleDetails",
                },
            },
        ]).toArray()) as TaskDisplay[]; // Updated type

        return tasks.length > 0 ? tasks[0] : null; // Renamed variable
    } catch (error) {
        console.error(`Error getting task by ID (${taskId}):`, error); // Updated error message and param
        throw error; // Re-throw
    }
};

/**
 * Create a new task in the database.
 * @param taskData Data for the new task (excluding _id)
 * @returns The created task document with its new _id
 */
export const createTask = async (taskData: Omit<Task, "_id">): Promise<Task> => {
    // Renamed function, params, return type
    try {
        const result = await Tasks.insertOne(taskData); // Changed Issues to Tasks, param issueData to taskData
        if (!result.insertedId) {
            throw new Error("Failed to insert task into database."); // Updated error message
        }
        // Fetch the created document to return it, ensuring all defaults/timestamps are included
        const createdTask = await Tasks.findOne({ _id: result.insertedId }); // Changed Issues to Tasks, variable createdIssue to createdTask
        if (!createdTask) {
            throw new Error("Failed to retrieve created task."); // Updated error message
        }
        return createdTask as Task; // Updated type
    } catch (error) {
        console.error("Error creating task:", error); // Updated error message
        throw new Error("Database error creating task."); // Updated error message
    }
};

/**
 * Update an existing task in the database.
 * @param taskId The ID of the task to update
 * @param updates Partial data containing fields to update
 * @returns Boolean indicating success (true) or failure (false)
 */
export const updateTask = async (taskId: string, updates: Partial<Task>): Promise<boolean> => {
    // Renamed function, params, type
    try {
        if (!ObjectId.isValid(taskId)) {
            // Renamed param
            console.error("Invalid taskId provided for update:", taskId); // Updated error message and param
            return false;
        }
        // Ensure updatedAt is always set on update
        const updateData = { ...updates, updatedAt: new Date() };
        // Remove _id from updates if present, as it cannot be changed
        delete updateData._id;

        const result = await Tasks.updateOne({ _id: new ObjectId(taskId) }, { $set: updateData }); // Changed Issues to Tasks, param issueId to taskId
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error updating task (${taskId}):`, error); // Updated error message and param
        // Do not re-throw, return false to indicate failure
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

// TODO: Implement comment/reaction functions if needed, potentially reusing post/comment logic
// e.g., addCommentToTask, addReactionToTask, etc.
