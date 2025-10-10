// issue.ts - Issue data access functions
import { Issues, Circles, Members, Reactions, Feeds, Posts } from "./db"; // Added Feeds, Posts
import { ObjectId } from "mongodb";
import { Issue, IssueDisplay, IssueStage, Circle, Member, Post } from "@/models/models"; // Added Post type
import { getCircleById, SAFE_CIRCLE_PROJECTION } from "./circle";
import { createPost } from "./feed"; // Import createPost from feed.ts
import { upsertVbdIssues } from "./vdb";
// No longer need getUserByDid if we use $lookup consistently

// Safe projection for issue queries, similar to proposals
export const SAFE_ISSUE_PROJECTION = {
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
} as const;

/**
 * Get all issues for a circle, including author and assignee details.
 * Filters results based on the user's group membership and the issue's userGroups.
 * @param circleId The ID of the circle
 * @param userDid The DID of the user requesting the issues (for visibility checks)
 * @returns Array of issues the user is allowed to see
 */
export const getIssuesByCircleId = async (
    circleId: string,
    userDid: string,
    includeCreated?: boolean,
    includeAssigned?: boolean,
): Promise<IssueDisplay[]> => {
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

        const issues = (await Issues.aggregate([
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
                                        // Only match if the circle's did == the issue's createdBy
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
                                        // Only match if circle's did == issue's assignedTo
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
                    // Include safe fields from the Issue
                    ...SAFE_ISSUE_PROJECTION,
                    // Convert the Issue _id to string
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails", // null if no match
                },
            },

            // 5) Sort by newest first
            { $sort: { createdAt: -1 } },
        ]).toArray()) as IssueDisplay[];

        return issues;
    } catch (error) {
        console.error("Error getting issues by circle ID:", error);
        throw error;
    }
};

/**
 * Get active issues (open or inProgress) for a circle, including author and assignee details.
 * Filters results based on the user's group membership and the issue's userGroups.
 * @param circleId The ID of the circle
 * @returns Array of active issues the user is allowed to see
 */
export const getActiveIssuesByCircleId = async (circleId: string): Promise<IssueDisplay[]> => {
    try {
        const issues = (await Issues.aggregate([
            // 1) Match on circleId and active stages first
            {
                $match: {
                    circleId,
                    stage: { $in: ["open", "inProgress"] }, // Filter for active stages
                },
            },

            // 2) Lookup author details (same as getIssuesByCircleId)
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

            // 3) Lookup assignee details (same as getIssuesByCircleId)
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

            // 4) Final projection (same as getIssuesByCircleId)
            {
                $project: {
                    ...SAFE_ISSUE_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                },
            },

            // 5) Sort by newest first (optional, might be overridden by ranking later)
            { $sort: { createdAt: -1 } },
        ]).toArray()) as IssueDisplay[];

        // TODO: Add fine-grained visibility filtering based on userDid and issue.userGroups if needed

        return issues;
    } catch (error) {
        console.error("Error getting active issues by circle ID:", error);
        throw error;
    }
};

/**
 * Get a single issue by ID, including author and assignee details.
 * Does NOT perform visibility checks here, assumes calling action does.
 * @param issueId The ID of the issue
 * @returns The issue display data or null if not found
 */
export const getIssueById = async (issueId: string, userDid?: string): Promise<IssueDisplay | null> => {
    try {
        if (!ObjectId.isValid(issueId)) {
            return null;
        }

        const issues = (await Issues.aggregate([
            // 1) Match the specific Issue by _id
            { $match: { _id: new ObjectId(issueId) } },

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

            // 4) Lookup circle details (if the Issue is associated with some circle _id).
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
                    // Include safe fields from the Issue
                    ...SAFE_ISSUE_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                    circle: "$circleDetails",
                },
            },
        ]).toArray()) as IssueDisplay[];

        return issues.length > 0 ? issues[0] : null;
    } catch (error) {
        console.error(`Error getting issue by ID (${issueId}):`, error);
        throw error; // Re-throw
    }
};

/**
 * Create a new issue in the database.
 * @param issueData Data for the new issue (excluding _id, commentPostId)
 * @returns The created issue document with its new _id and potentially commentPostId
 */
export const createIssue = async (issueData: Omit<Issue, "_id" | "commentPostId">): Promise<Issue> => {
    try {
        // Ensure createdAt is set if not provided
        const issueToInsert = { ...issueData, createdAt: issueData.createdAt || new Date() };
        const result = await Issues.insertOne(issueToInsert);
        if (!result.insertedId) {
            throw new Error("Failed to insert issue into database.");
        }

        const createdIssueId = result.insertedId;
        let createdIssue = (await Issues.findOne({ _id: createdIssueId })) as Issue | null; // Fetch the created issue

        if (!createdIssue) {
            throw new Error("Failed to retrieve created issue immediately after insertion.");
        }

        // --- Create Shadow Post ---
        try {
            const feed = await Feeds.findOne({ circleId: issueData.circleId });
            if (!feed) {
                console.warn(
                    `No feed found for circle ${issueData.circleId} to create shadow post for issue ${createdIssueId}. Commenting will be disabled.`,
                );
            } else {
                const shadowPostData: Omit<Post, "_id"> = {
                    feedId: feed._id.toString(),
                    createdBy: issueData.createdBy,
                    createdAt: new Date(),
                    content: `Issue: ${issueData.title}`, // Simple content
                    postType: "issue",
                    parentItemId: createdIssueId.toString(),
                    parentItemType: "issue",
                    userGroups: issueData.userGroups || [],
                    comments: 0,
                    reactions: {},
                };

                const shadowPost = await createPost(shadowPostData);

                // --- Update Issue with commentPostId ---
                if (shadowPost && shadowPost._id) {
                    const commentPostIdString = shadowPost._id.toString();
                    const updateResult = await Issues.updateOne(
                        { _id: createdIssueId },
                        { $set: { commentPostId: commentPostIdString } },
                    );
                    if (updateResult.modifiedCount === 1) {
                        createdIssue.commentPostId = commentPostIdString; // Update the object we return
                        console.log(`Shadow post ${commentPostIdString} created and linked to issue ${createdIssueId}`);
                    } else {
                        console.error(`Failed to link shadow post ${commentPostIdString} to issue ${createdIssueId}`);
                        // Optional: Delete orphaned shadow post
                        // await Posts.deleteOne({ _id: shadowPost._id });
                    }
                } else {
                    console.error(`Failed to create shadow post for issue ${createdIssueId}`);
                }
            }
        } catch (postError) {
            console.error(`Error creating/linking shadow post for issue ${createdIssueId}:`, postError);
        }
        // --- End Shadow Post Creation ---

        // Upsert into vector DB
        try {
            await upsertVbdIssues([createdIssue as Issue]);
        } catch (e) {
            console.error("Error upserting issue to VDB:", e);
        }

        return createdIssue as Issue;
    } catch (error) {
        console.error("Error creating issue:", error);
        throw new Error(`Database error creating issue: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Update an existing issue in the database.
 * @param issueId The ID of the issue to update
 * @param updates Partial data containing fields to update
 * @returns Boolean indicating success (true) or failure (false)
 */
export const updateIssue = async (issueId: string, updates: Partial<Issue>): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(issueId)) {
            console.error("Invalid issueId provided for update:", issueId);
            return false;
        }
        // Ensure updatedAt is always set on update
        const updateData = { ...updates, updatedAt: new Date() };
        // Remove _id from updates if present, as it cannot be changed
        delete updateData._id;

        const result = await Issues.updateOne({ _id: new ObjectId(issueId) }, { $set: updateData });
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error updating issue (${issueId}):`, error);
        // Do not re-throw, return false to indicate failure
        return false;
    }
};

/**
 * Delete an issue from the database.
 * Also deletes associated comments/reactions if applicable (TODO).
 * @param issueId The ID of the issue to delete
 * @returns Boolean indicating success (true) or failure (false)
 */
export const deleteIssue = async (issueId: string): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(issueId)) {
            console.error("Invalid issueId provided for delete:", issueId);
            return false;
        }
        // TODO: Add logic here to delete associated comments, reactions, or shadow post
        // Example: await Comments.deleteMany({ parentId: issueId, parentType: 'issue' });
        // Example: await Reactions.deleteMany({ contentId: issueId, contentType: 'issue' });

        const result = await Issues.deleteOne({ _id: new ObjectId(issueId) });
        return result.deletedCount > 0;
    } catch (error) {
        console.error(`Error deleting issue (${issueId}):`, error);
        return false;
    }
};

/**
 * Change the stage of an issue. Updates `updatedAt` and `resolvedAt` as needed.
 * @param issueId The ID of the issue
 * @param newStage The new stage to set
 * @returns Boolean indicating success (true) or failure (false)
 */
export const changeIssueStage = async (issueId: string, newStage: IssueStage): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(issueId)) {
            console.error("Invalid issueId for stage change:", issueId);
            return false;
        }

        const updates: Partial<Issue> = { stage: newStage, updatedAt: new Date() };
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

        const result = await Issues.updateOne({ _id: new ObjectId(issueId) }, updateOp);
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error changing stage for issue (${issueId}):`, error);
        return false;
    }
};

/**
 * Assign an issue to a user or unassign it. Updates `updatedAt`.
 * @param issueId The ID of the issue
 * @param assigneeDid The DID of the user to assign to, or undefined/null to unassign
 * @returns Boolean indicating success (true) or failure (false)
 */
export const assignIssue = async (issueId: string, assigneeDid: string | undefined | null): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(issueId)) {
            console.error("Invalid issueId for assignment:", issueId);
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

        const result = await Issues.updateOne({ _id: new ObjectId(issueId) }, updateOp);
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error assigning issue (${issueId}):`, error);
        return false;
    }
};

// --- Ranking Function ---
import { getAggregateRanking, RankingContext } from "./ranking"; // Import the generic ranking function

type IssueRankingResult = {
    rankMap: Map<string, number>;
    totalRankers: number;
    activeIssueIds: Set<string>;
};

/**
 * Retrieves the aggregate issue ranking for a circle, optionally filtered by user group.
 * Uses the cached ranking if available and valid.
 * @param circleId The ID of the circle
 * @param filterUserGroupHandle Optional handle of the user group to filter by
 * @returns Promise<IssueRankingResult>
 */
export const getIssueRanking = async (
    circleId: string,
    filterUserGroupHandle?: string,
): Promise<IssueRankingResult> => {
    const context: RankingContext = {
        entityId: circleId,
        itemType: "issues",
        filterUserGroupHandle: filterUserGroupHandle,
    };

    try {
        // Use a reasonable cache age, e.g., 1 hour (3600 seconds)
        const maxCacheAgeSeconds = 3600;
        const result = await getAggregateRanking(context, maxCacheAgeSeconds);

        // Adapt the result from getAggregateRanking to IssueRankingResult format
        return {
            rankMap: result.rankMap,
            totalRankers: result.totalRankers,
            activeIssueIds: result.activeItemIds, // Rename activeItemIds to activeIssueIds
        };
    } catch (error) {
        console.error(`Error getting issue ranking for circle ${circleId}:`, error);
        // Return a default empty result on error
        return {
            rankMap: new Map(),
            totalRankers: 0,
            activeIssueIds: new Set(),
        };
    }
};

// TODO: Implement comment/reaction functions if needed, potentially reusing post/comment logic
// e.g., addCommentToIssue, addReactionToIssue, etc.
