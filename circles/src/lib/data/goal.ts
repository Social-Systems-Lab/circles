// goal.ts - Goal data access functions
import { Goals, Circles, RankedLists, Feeds, Posts } from "./db"; // Added Feeds, Posts
import { ObjectId } from "mongodb";
import { Goal, GoalDisplay, GoalStage, RankedList, Post } from "@/models/models"; // Added Post type
import { SAFE_CIRCLE_PROJECTION } from "./circle";
import { getMemberIdsByUserGroup } from "./member";
import { RANKING_STALENESS_DAYS } from "./constants";
import { createPost } from "./feed"; // Import createPost from feed.ts
// No longer need getUserByDid if we use $lookup consistently

// Safe projection for goal queries, similar to proposals
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
    userGroups: 1,
    location: 1,
    commentPostId: 1,
    images: 1,
    targetDate: 1,
} as const;

/**
 * Get all goals for a circle
 * Filters results based on the user's group membership and the goal's userGroups.
 * @param circleId The ID of the circle
 * @param userDid The DID of the user requesting the goals (for visibility checks)
 * @returns Array of goals the user is allowed to see
 */
export const getGoalsByCircleId = async (circleId: string, userDid: string): Promise<GoalDisplay[]> => {
    // Renamed function, updated return type
    try {
        const goals = (await Goals.aggregate([
            // Changed Issues to Goals, variable issues to goals
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
                                        // Only match if the circle's did == the goal's createdBy
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

            // 4) Final projection
            {
                $project: {
                    // Include safe fields from the Goal
                    ...SAFE_TASK_PROJECTION, // Renamed constant
                    // Convert the Goal _id to string
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                },
            },

            // 5) Sort by newest first
            { $sort: { createdAt: -1 } },
        ]).toArray()) as GoalDisplay[]; // Updated type

        return goals; // Renamed variable
    } catch (error) {
        console.error("Error getting goals by circle ID:", error); // Updated error message
        throw error;
    }
};

/**
 * Get active goals (open or inProgress) for a circle
 * Filters results based on the user's group membership and the goal's userGroups.
 * @param circleId The ID of the circle
 * @param userDid The DID of the user requesting the goals (for visibility checks)
 * @returns Array of active goals the user is allowed to see
 */
export const getActiveGoalsByCircleId = async (circleId: string): Promise<GoalDisplay[]> => {
    // Added userDid as optional for potential system calls
    try {
        const goals = (await Goals.aggregate([
            // 1) Match on circleId and active stages first
            {
                $match: {
                    circleId,
                    stage: { $in: ["open", "inProgress"] }, // Filter for active stages
                },
            },

            // 2) Lookup author details (same as getGoalsByCircleId)
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

            // 4) Final projection (same as getGoalsByCircleId)
            {
                $project: {
                    ...SAFE_TASK_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                },
            },

            // 5) Sort by newest first (optional, might be overridden by ranking later)
            { $sort: { createdAt: -1 } },
        ]).toArray()) as GoalDisplay[];

        // TODO: Add fine-grained visibility filtering based on userDid and goal.userGroups if needed
        // This might involve fetching user's memberships for the circle

        return goals;
    } catch (error) {
        console.error("Error getting active goals by circle ID:", error);
        throw error;
    }
};

/**
 * Get a single goal by ID.
 * Does NOT perform visibility checks here, assumes calling action does.
 * @param goalId The ID of the goal
 * @returns The goal display data or null if not found
 */
export const getGoalById = async (goalId: string, userDid?: string): Promise<GoalDisplay | null> => {
    // Renamed function, params, return type
    try {
        if (!ObjectId.isValid(goalId)) {
            // Renamed param
            return null;
        }

        const goals = (await Goals.aggregate([
            // Changed Issues to Goals, variable issues to goals
            // 1) Match the specific Goal by _id
            { $match: { _id: new ObjectId(goalId) } }, // Renamed param

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

            // 4) Lookup circle details (if the Goal is associated with some circle _id).
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
                    // Include safe fields from the Goal
                    ...SAFE_TASK_PROJECTION, // Renamed constant
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    circle: "$circleDetails",
                },
            },
        ]).toArray()) as GoalDisplay[]; // Updated type

        return goals.length > 0 ? goals[0] : null; // Renamed variable
    } catch (error) {
        console.error(`Error getting goal by ID (${goalId}):`, error); // Updated error message and param
        throw error; // Re-throw
    }
};

/**
 * Create a new goal in the database.
 * @param goalData Data for the new goal (excluding _id, commentPostId)
 * @returns The created goal document with its new _id and potentially commentPostId
 */
export const createGoal = async (goalData: Omit<Goal, "_id" | "commentPostId">): Promise<Goal> => {
    try {
        // Ensure createdAt is set if not provided
        const goalToInsert = { ...goalData, createdAt: goalData.createdAt || new Date() };
        const result = await Goals.insertOne(goalToInsert);
        if (!result.insertedId) {
            throw new Error("Failed to insert goal into database.");
        }

        const createdGoalId = result.insertedId;
        let createdGoal = (await Goals.findOne({ _id: createdGoalId })) as Goal | null; // Fetch the created goal

        if (!createdGoal) {
            // This case should ideally not happen if insert succeeded, but good to check
            throw new Error("Failed to retrieve created goal immediately after insertion.");
        }

        // --- Create Shadow Post ---
        try {
            // Find a default feed for the circle (e.g., handle 'general' or the first one)
            // TODO: Consider a more robust feed selection strategy if needed
            const feed = await Feeds.findOne({ circleId: goalData.circleId });
            if (!feed) {
                console.warn(
                    `No feed found for circle ${goalData.circleId} to create shadow post for goal ${createdGoalId}. Commenting will be disabled.`,
                );
                // Proceed without shadow post, goal is already created
            } else {
                const shadowPostData: Omit<Post, "_id"> = {
                    feedId: feed._id.toString(),
                    createdBy: goalData.createdBy,
                    createdAt: new Date(), // Use current time for post creation
                    content: `Goal: ${goalData.title}`, // Simple content for the shadow post
                    postType: "goal",
                    parentItemId: createdGoalId.toString(),
                    parentItemType: "goal",
                    userGroups: goalData.userGroups || [], // Inherit user groups from goal
                    comments: 0, // Initialize comment count
                    reactions: {}, // Initialize reactions
                    // Ensure all required fields from postSchema are present or have defaults
                };

                const shadowPost = await createPost(shadowPostData); // Use the imported createPost function

                // --- Update Goal with commentPostId ---
                if (shadowPost && shadowPost._id) {
                    const commentPostIdString = shadowPost._id.toString();
                    const updateResult = await Goals.updateOne(
                        { _id: createdGoalId },
                        { $set: { commentPostId: commentPostIdString } },
                    );
                    if (updateResult.modifiedCount === 1) {
                        createdGoal.commentPostId = commentPostIdString; // Update the object we return
                        console.log(`Shadow post ${commentPostIdString} created and linked to goal ${createdGoalId}`);
                    } else {
                        console.error(`Failed to link shadow post ${commentPostIdString} to goal ${createdGoalId}`);
                        // Optional: Consider deleting the orphaned shadow post?
                        // await Posts.deleteOne({ _id: shadowPost._id });
                    }
                } else {
                    console.error(`Failed to create shadow post for goal ${createdGoalId}`);
                }
            }
        } catch (postError) {
            console.error(`Error creating/linking shadow post for goal ${createdGoalId}:`, postError);
            // Goal creation succeeded, but shadow post failed. Log error but return the created goal.
        }
        // --- End Shadow Post Creation ---

        // Return the goal object, potentially updated with commentPostId
        return createdGoal as Goal;
    } catch (error) {
        console.error("Error creating goal:", error);
        // Rethrow a more specific error or handle as appropriate
        throw new Error(`Database error creating goal: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Update an existing goal in the database.
 * @param goalId The ID of the goal to update
 * @param updates Partial data containing fields to update
 * @returns Boolean indicating success (true) or failure (false)
 */
export const updateGoal = async (goalId: string, updates: Partial<Goal>): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(goalId)) {
            console.error("Invalid goalId provided for update:", goalId);
            return false;
        }

        // Start with the provided updates and add updatedAt
        const updateData: any = { ...updates, updatedAt: new Date() };
        delete updateData._id; // Cannot update _id

        const unsetFields: any = {};

        // Check if targetDate is explicitly being set to null (signal for removal)
        // Use 'null' as the signal from the action, not undefined.
        if (updateData.hasOwnProperty("targetDate") && updateData.targetDate === null) {
            delete updateData.targetDate; // Remove from $set data
            unsetFields.targetDate = ""; // Add to $unset
        }

        // Construct the final MongoDB update operation object
        const updateOp: any = {};
        // Only add $set if there are fields remaining in updateData
        if (Object.keys(updateData).length > 0) {
            updateOp.$set = updateData;
        }
        // Only add $unset if there are fields to unset
        if (Object.keys(unsetFields).length > 0) {
            updateOp.$unset = unsetFields;
        }

        // Only perform update if there's something to $set or $unset
        if (Object.keys(updateOp).length === 0) {
            console.log("No update operation needed for goal:", goalId);
            return true; // No changes needed, consider it success
        }

        // Execute the update operation
        const result = await Goals.updateOne({ _id: new ObjectId(goalId) }, updateOp);

        // Success if matched or modified
        return result.matchedCount > 0 || result.modifiedCount > 0;
    } catch (error) {
        console.error(`Error updating goal (${goalId}):`, error);
        return false;
    }
};

/**
 * Delete a goal from the database.
 * Also deletes associated comments/reactions if applicable (TODO).
 * @param goalId The ID of the goal to delete
 * @returns Boolean indicating success (true) or failure (false)
 */
export const deleteGoal = async (goalId: string): Promise<boolean> => {
    // Renamed function, param
    try {
        if (!ObjectId.isValid(goalId)) {
            // Renamed param
            console.error("Invalid goalId provided for delete:", goalId); // Updated error message and param
            return false;
        }
        // TODO: Add logic here to delete associated comments, reactions, or shadow post
        // Example: await Comments.deleteMany({ parentId: goalId, parentType: 'goal' });
        // Example: await Reactions.deleteMany({ contentId: goalId, contentType: 'goal' });

        const result = await Goals.deleteOne({ _id: new ObjectId(goalId) }); // Changed Issues to Goals, param issueId to goalId
        return result.deletedCount > 0;
    } catch (error) {
        console.error(`Error deleting goal (${goalId}):`, error); // Updated error message and param
        return false;
    }
};

/**
 * Change the stage of a goal. Updates `updatedAt` and `resolvedAt` as needed.
 * @param goalId The ID of the goal
 * @param newStage The new stage to set
 * @returns Boolean indicating success (true) or failure (false)
 */
export const changeGoalStage = async (goalId: string, newStage: GoalStage): Promise<boolean> => {
    // Renamed function, params, type
    try {
        if (!ObjectId.isValid(goalId)) {
            // Renamed param
            console.error("Invalid goalId for stage change:", goalId); // Updated error message and param
            return false;
        }

        const updates: Partial<Goal> = { stage: newStage, updatedAt: new Date() }; // Updated type
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

        const result = await Goals.updateOne({ _id: new ObjectId(goalId) }, updateOp); // Changed Issues to Goals, param issueId to goalId
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error changing stage for goal (${goalId}):`, error); // Updated error message and param
        return false;
    }
};

type GoalRankingResult = {
    rankMap: Map<string, number>;
    totalRankers: number;
    activeGoalIds: Set<string>; // Also return the set of IDs used for ranking
};

export const getGoalRanking = async (circleId: string, filterUserGroupHandle?: string): Promise<GoalRankingResult> => {
    // Updated return type
    const defaultResult: GoalRankingResult = {
        rankMap: new Map(),
        totalRankers: 0,
        activeGoalIds: new Set(),
    };
    const now = new Date();

    try {
        // Get active goals
        const activeGoals = await getActiveGoalsByCircleId(circleId);
        const activeGoalIds = new Set(activeGoals.map((t: GoalDisplay) => t._id!.toString()));
        const N = activeGoalIds.size;

        if (N === 0) return { ...defaultResult, activeGoalIds }; // Return empty map but with active IDs

        // Fetch all potentially relevant ranked lists
        const allRankedLists = await RankedLists.find({
            entityId: circleId,
            type: "goals",
        }).toArray();

        // Filter lists and prepare user IDs
        const userIdsToCheck = new Set<string>();
        const potentiallyValidLists: (RankedList & { becameStaleAt?: Date | null })[] = [];
        for (const list of allRankedLists) {
            userIdsToCheck.add(list.userId);
            potentiallyValidLists.push(list);
        }

        if (potentiallyValidLists.length === 0) return { ...defaultResult, activeGoalIds };

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
            // Removed rank permission check as the feature is removed
            // const hasPermission = await isAuthorized(userDid, circleId, features.goals.rank);
            // return hasPermission ? userId : false;
            // Assume if they are in the group (if filtered), they are permitted for now
            return userId; // Return userId directly if checks pass
        });

        const results = await Promise.all(permissionChecks);
        const permittedUserIds = new Set(results.filter((result): result is string => result !== false));

        // Filter the lists based on included users
        const listsToProcess = potentiallyValidLists.filter((list) => permittedUserIds.has(list.userId));
        if (listsToProcess.length === 0) return { ...defaultResult, activeGoalIds };

        // Get goal creation dates for tie-breaking
        const goalCreationDates = new Map<string, Date>();
        activeGoals.forEach((goal) => {
            if (goal._id && goal.createdAt) {
                // Ensure createdAt is stored as a Date object
                goalCreationDates.set(goal._id.toString(), new Date(goal.createdAt));
            }
        });

        // 4. Aggregate scores using Borda Count with Grace Period & Average Points
        const goalScores = new Map<string, number>();
        let contributingRankers = 0; // Count lists that contribute points
        const listUpdatePromises: Promise<any>[] = []; // To track DB updates

        for (const list of listsToProcess) {
            const userRankedIds = new Set(list.list);
            const isComplete = userRankedIds.size === N && list.list.every((id) => activeGoalIds.has(id));
            let listContributes = false; // Flag if this list adds points in this run

            if (isComplete) {
                // --- List is Complete and Fresh ---
                listContributes = true;
                // Assign standard Borda points
                list.list.forEach((goalId, index) => {
                    const points = N - index; // Rank 1 gets N points, etc.
                    goalScores.set(goalId, (goalScores.get(goalId) || 0) + points);
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
                    list.list.forEach((goalId, index) => {
                        const points = N - index;
                        goalScores.set(goalId, (goalScores.get(goalId) || 0) + points);
                    });
                    // Assign average points for unranked items
                    activeGoalIds.forEach((goalId) => {
                        if (!userRankedIds.has(goalId)) {
                            goalScores.set(goalId, (goalScores.get(goalId) || 0) + avgPoints);
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
                        list.list.forEach((goalId, index) => {
                            const points = N - index;
                            goalScores.set(goalId, (goalScores.get(goalId) || 0) + points);
                        });
                        activeGoalIds.forEach((goalId) => {
                            if (!userRankedIds.has(goalId)) {
                                goalScores.set(goalId, (goalScores.get(goalId) || 0) + avgPoints);
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
        const rankedResults = Array.from(goalScores.entries())
            .map(([goalId, score]) => ({
                goalId,
                score,
                // Retrieve creation date for sorting
                createdAt: goalCreationDates.get(goalId) || new Date(0), // Use epoch if not found
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
                // 3. Fallback tie-breaker (e.g., Goal ID) if dates are missing/invalid or identical
                return a.goalId.localeCompare(b.goalId);
            });

        const rankMap = new Map<string, number>();
        rankedResults.forEach((item, index) => {
            // Assign rank 1, 2, 3, ... based on the final sorted position
            rankMap.set(item.goalId, index + 1);
        });

        return {
            rankMap,
            totalRankers: contributingRankers, // Use the count of lists that added points
            activeGoalIds,
        };
    } catch (error) {
        console.error("Error calculating goal ranking:", error);
        return defaultResult; // Return default on error
    }
};

// TODO: Implement comment/reaction functions if needed, potentially reusing post/comment logic
// e.g., addCommentToGoal, addReactionToGoal, etc.
