// issue.ts - Issue data access functions
import { Issues, Circles, Members, Reactions } from "./db";
import { ObjectId } from "mongodb";
import { Issue, IssueDisplay, IssueStage, Circle, Member } from "@/models/models";
import { getCircleById, SAFE_CIRCLE_PROJECTION } from "./circle";
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
} as const;

/**
 * Get all issues for a circle, including author and assignee details.
 * Filters results based on the user's group membership and the issue's userGroups.
 * @param circleId The ID of the circle
 * @param userDid The DID of the user requesting the issues (for visibility checks)
 * @returns Array of issues the user is allowed to see
 */
export const getIssuesByCircleId = async (circleId: string, userDid: string): Promise<IssueDisplay[]> => {
    try {
        // Get the user's membership details for this circle to check groups
        const memberInfo = await Members.findOne({ userDid, circleId });
        const userGroupsInCircle = memberInfo?.userGroups || [];
        // Always include "everyone" as a group the user belongs to implicitly
        const effectiveUserGroups = ["everyone", ...userGroupsInCircle];

        const issues = (await Issues.aggregate([
            { $match: { circleId } },
            // Filter issues based on userGroups:
            // - Show if issue.userGroups is empty/null (visible to all members)
            // - Show if issue.userGroups includes "everyone"
            // - Show if issue.userGroups has any overlap with the user's groups in this circle
            {
                $match: {
                    $or: [
                        { userGroups: { $exists: false } },
                        { userGroups: { $size: 0 } },
                        { userGroups: { $in: effectiveUserGroups } },
                    ],
                },
            },
            // Lookup author details
            {
                $lookup: {
                    from: "circles", // Assuming users are stored in 'circles' collection
                    localField: "createdBy",
                    foreignField: "did",
                    pipeline: [{ $project: SAFE_CIRCLE_PROJECTION }], // Use safe projection
                    as: "authorDetails",
                },
            },
            { $unwind: "$authorDetails" }, // Should always find an author
            // Lookup assignee details (optional)
            {
                $lookup: {
                    from: "circles",
                    localField: "assignedTo",
                    foreignField: "did",
                    pipeline: [{ $project: SAFE_CIRCLE_PROJECTION }],
                    as: "assigneeDetails",
                },
            },
            // Use $unwind with preserveNullAndEmptyArrays for optional assignee
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },
            // Lookup circle details (optional, if needed - IssueDisplay doesn't strictly require it here)
            // {
            //     $lookup: {
            //         from: "circles",
            //         let: { cId: { $toObjectId: "$circleId" } },
            //         pipeline: [
            //             { $match: { $expr: { $eq: ["$_id", "$$cId"] } } },
            //             { $project: { _id: { $toString: "$_id" }, name: 1, handle: 1, picture: 1 } }
            //         ],
            //         as: "circleDetails"
            //     }
            // },
            // { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },
            // Final projection
            {
                $project: {
                    ...SAFE_ISSUE_PROJECTION, // Include all safe fields
                    _id: { $toString: "$_id" }, // Ensure _id is string
                    author: "$authorDetails",
                    assignee: "$assigneeDetails", // Will be null if not assigned or assignee not found
                    // circle: "$circleDetails" // Include if circle lookup is added
                },
            },
            { $sort: { createdAt: -1 } }, // Sort by creation date
        ]).toArray()) as IssueDisplay[];

        return issues;
    } catch (error) {
        console.error("Error getting issues by circle ID:", error);
        throw error; // Re-throw to allow action layer to handle
    }
};

/**
 * Get a single issue by ID, including author and assignee details.
 * Does NOT perform visibility checks here, assumes calling action does.
 * @param issueId The ID of the issue
 * @returns The issue display data or null if not found
 */
export const getIssueById = async (issueId: string, userDid?: string): Promise<IssueDisplay | null> => {
    // userDid is optional here, mainly for consistency, but visibility check happens in action
    try {
        if (!ObjectId.isValid(issueId)) {
            return null;
        }

        const issues = (await Issues.aggregate([
            { $match: { _id: new ObjectId(issueId) } },
            // Lookup author details
            {
                $lookup: {
                    from: "circles",
                    localField: "createdBy",
                    foreignField: "did",
                    pipeline: [{ $project: SAFE_CIRCLE_PROJECTION }],
                    as: "authorDetails",
                },
            },
            { $unwind: "$authorDetails" },
            // Lookup assignee details (optional)
            {
                $lookup: {
                    from: "circles",
                    localField: "assignedTo",
                    foreignField: "did",
                    pipeline: [{ $project: SAFE_CIRCLE_PROJECTION }],
                    as: "assigneeDetails",
                },
            },
            { $unwind: { path: "$assigneeDetails", preserveNullAndEmptyArrays: true } },
            // Lookup circle details (optional, if needed)
            {
                $lookup: {
                    from: "circles",
                    let: { cId: { $toObjectId: "$circleId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$cId"] } } },
                        { $project: { _id: { $toString: "$_id" }, name: 1, handle: 1, picture: 1 } },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },
            // Final projection
            {
                $project: {
                    ...SAFE_ISSUE_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    assignee: "$assigneeDetails",
                    circle: "$circleDetails", // Include circle info
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
 * @param issueData Data for the new issue (excluding _id)
 * @returns The created issue document with its new _id
 */
export const createIssue = async (issueData: Omit<Issue, "_id">): Promise<Issue> => {
    try {
        const result = await Issues.insertOne(issueData);
        if (!result.insertedId) {
            throw new Error("Failed to insert issue into database.");
        }
        // Fetch the created document to return it, ensuring all defaults/timestamps are included
        const createdIssue = await Issues.findOne({ _id: result.insertedId });
        if (!createdIssue) {
            throw new Error("Failed to retrieve created issue.");
        }
        return createdIssue as Issue;
    } catch (error) {
        console.error("Error creating issue:", error);
        throw new Error("Database error creating issue.");
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

// TODO: Implement comment/reaction functions if needed, potentially reusing post/comment logic
// e.g., addCommentToIssue, addReactionToIssue, etc.
