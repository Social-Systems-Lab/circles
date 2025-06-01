// proposal.ts - Proposal data access functions
import { Proposals, Circles, Members, Reactions, Feeds, Posts } from "./db"; // Added Feeds, Posts
import { ObjectId } from "mongodb";
import { Proposal, ProposalDisplay, ProposalStage, ProposalOutcome, Circle, Post } from "@/models/models"; // Added Post type
import { getCircleById, SAFE_CIRCLE_PROJECTION } from "./circle";
import { getUserByDid } from "./user";
import { createPost } from "./feed"; // Import createPost from feed.ts

// Safe projection for proposal queries
export const SAFE_PROPOSAL_PROJECTION = {
    _id: 1,
    circleId: 1,
    createdBy: 1,
    createdAt: 1,
    editedAt: 1,
    name: 1,
    background: 1, // Add background
    decisionText: 1, // Add decisionText
    images: 1, // Add images
    stage: 1,
    outcome: 1,
    outcomeReason: 1,
    votingDeadline: 1,
    reactions: 1,
    userGroups: 1,
    resolvedAtStage: 1,
    goalId: 1, // Add goalId
} as const;

/**
 * Get all proposals for a circle
 * @param circleId The ID of the circle
 * @param userDid Optional user DID for filtering by visibility
 * @returns Array of proposals
 */
export const getProposalsByCircleId = async (circleId: string, userDid?: string): Promise<ProposalDisplay[]> => {
    try {
        // Get proposals without user group filtering initially
        const proposals = (await Proposals.aggregate([
            { $match: { circleId } },

            // Lookup for author details
            {
                $lookup: {
                    from: "circles",
                    localField: "createdBy",
                    foreignField: "did",
                    as: "authorDetails",
                },
            },
            { $unwind: "$authorDetails" },

            // Lookup for user reactions
            {
                $lookup: {
                    from: "reactions",
                    let: { proposalId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$contentId", "$$proposalId"] },
                                        { $eq: ["$userDid", userDid] },
                                        { $eq: ["$contentType", "proposal"] },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "userReaction",
                },
            },

            // Lookup for circle details
            {
                $lookup: {
                    from: "circles",
                    let: { circleId: { $toObjectId: "$circleId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$circleId"] } } },
                        {
                            $project: {
                                _id: { $toString: "$_id" },
                                name: 1,
                                handle: 1,
                                picture: 1,
                                userGroups: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // Final projection
            {
                $project: {
                    _id: { $toString: "$_id" },
                    circleId: 1,
                    name: 1,
                    background: 1, // Add background
                    decisionText: 1, // Add decisionText
                    images: 1, // Add images
                    createdBy: 1,
                    createdAt: 1,
                    editedAt: 1,
                    stage: 1,
                    outcome: 1,
                    outcomeReason: 1,
                    votingDeadline: 1,
                    reactions: 1,
                    userGroups: 1,
                    resolvedAtStage: 1,
                    location: 1,
                    author: {
                        _id: { $toString: "$authorDetails._id" },
                        did: "$authorDetails.did",
                        name: "$authorDetails.name",
                        handle: "$authorDetails.handle",
                        picture: "$authorDetails.picture",
                        images: "$authorDetails.images",
                        mission: "$authorDetails.mission",
                        description: "$authorDetails.description",
                    },
                    userReaction: { $arrayElemAt: ["$userReaction.reactionType", 0] },
                    circle: "$circleDetails",
                },
            },

            // Sort by creation date (newest first)
            { $sort: { createdAt: -1 } },
        ]).toArray()) as ProposalDisplay[];

        // Post-processing to filter based on user groups
        if (userDid) {
            // Get user's memberships for the circle
            const userMemberships = new Map<string, string[]>();

            // Always add "everyone" as a group the user belongs to
            userMemberships.set("everyone", ["everyone"]);

            // Get the user's membership from the Members collection
            const memberDoc = await Members.findOne({ userDid, circleId });

            if (memberDoc?.userGroups && memberDoc.userGroups.length > 0) {
                userMemberships.set(circleId, memberDoc.userGroups);
            }

            // Filter proposals based on user groups
            const filteredProposals = proposals.filter((proposal) => {
                // If proposal has no user groups or empty user groups array, it's visible to everyone
                if (!proposal.userGroups || proposal.userGroups.length === 0) {
                    return true;
                }

                // Get the user's groups in this circle
                const userGroupsInCircle = userMemberships.get(circleId) || [];

                // Check if any of the proposal's user groups match the user's groups in this circle
                return (
                    proposal.userGroups.includes("everyone") ||
                    proposal.userGroups.some((group) => userGroupsInCircle.includes(group))
                );
            });

            return filteredProposals;
        }

        // If no user is specified, only return proposals with "everyone" user group
        return proposals.filter(
            (proposal) =>
                !proposal.userGroups || proposal.userGroups.length === 0 || proposal.userGroups.includes("everyone"),
        );
    } catch (error) {
        console.error("Error getting proposals:", error);
        throw error;
    }
};

// --- Ranking Function ---
import { getAggregateRanking, RankingContext } from "./ranking"; // Import the generic ranking function

type ProposalRankingResult = {
    rankMap: Map<string, number>;
    totalRankers: number;
    activeProposalIds: Set<string>;
};

/**
 * Retrieves the aggregate proposal ranking for a circle, optionally filtered by user group.
 * Uses the cached ranking if available and valid.
 * @param circleId The ID of the circle
 * @param filterUserGroupHandle Optional handle of the user group to filter by
 * @returns Promise<ProposalRankingResult>
 */
export const getProposalRanking = async (
    circleId: string,
    filterUserGroupHandle?: string,
): Promise<ProposalRankingResult> => {
    const context: RankingContext = {
        entityId: circleId,
        itemType: "proposals",
        filterUserGroupHandle: filterUserGroupHandle,
    };

    try {
        // Use a reasonable cache age, e.g., 1 hour (3600 seconds)
        const maxCacheAgeSeconds = 3600;
        const result = await getAggregateRanking(context, maxCacheAgeSeconds);

        // Adapt the result from getAggregateRanking to ProposalRankingResult format
        return {
            rankMap: result.rankMap,
            totalRankers: result.totalRankers,
            activeProposalIds: result.activeItemIds, // Rename activeItemIds to activeProposalIds
        };
    } catch (error) {
        console.error(`Error getting proposal ranking for circle ${circleId}:`, error);
        // Return a default empty result on error
        return {
            rankMap: new Map(),
            totalRankers: 0,
            activeProposalIds: new Set(),
        };
    }
};

/**
 * Get active proposals (discussion or voting) for a circle
 * @param circleId The ID of the circle
 * @returns Array of active proposals
 */
export const getActiveProposalsByCircleId = async (circleId: string): Promise<ProposalDisplay[]> => {
    try {
        const proposals = (await Proposals.aggregate([
            // 1) Match on circleId and active stages first
            {
                $match: {
                    circleId,
                    stage: { $in: ["draft", "review", "voting"] }, // Updated active stages
                },
            },

            // 2) Lookup author details
            {
                $lookup: {
                    from: "circles",
                    localField: "createdBy",
                    foreignField: "did",
                    as: "authorDetails",
                },
            },
            { $unwind: "$authorDetails" },

            // 3) Lookup circle details
            {
                $lookup: {
                    from: "circles",
                    let: { circleId: { $toObjectId: "$circleId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$circleId"] } } },
                        {
                            $project: {
                                _id: { $toString: "$_id" },
                                name: 1,
                                handle: 1,
                                picture: 1,
                                userGroups: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // 4) Final projection (include necessary fields for display + ranking)
            {
                $project: {
                    ...SAFE_PROPOSAL_PROJECTION, // Include safe fields
                    _id: { $toString: "$_id" },
                    author: {
                        // Simplified author for list display
                        _id: { $toString: "$authorDetails._id" },
                        did: "$authorDetails.did",
                        name: "$authorDetails.name",
                        handle: "$authorDetails.handle",
                        picture: "$authorDetails.picture",
                    },
                    circle: "$circleDetails",
                    // Exclude userReaction lookup for performance in list view
                },
            },

            // 5) Sort by newest first (optional, might be overridden by ranking later)
            { $sort: { createdAt: -1 } },
        ]).toArray()) as ProposalDisplay[];

        // TODO: Add fine-grained visibility filtering based on userDid and proposal.userGroups if needed

        return proposals;
    } catch (error) {
        console.error("Error getting active proposals by circle ID:", error);
        throw error;
    }
};

/**
 * Get a proposal by ID
 * @param proposalId The ID of the proposal
 * @param userDid Optional user DID for checking reactions
 * @returns The proposal or null if not found
 */
export const getProposalById = async (proposalId: string, userDid?: string): Promise<ProposalDisplay | null> => {
    try {
        // Get the proposal with author details and user reaction
        const proposals = (await Proposals.aggregate([
            { $match: { _id: new ObjectId(proposalId) } },

            // Lookup for author details
            {
                $lookup: {
                    from: "circles",
                    localField: "createdBy",
                    foreignField: "did",
                    as: "authorDetails",
                },
            },
            { $unwind: "$authorDetails" },

            // Lookup for user reactions
            {
                $lookup: {
                    from: "reactions",
                    let: { proposalId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$contentId", "$$proposalId"] },
                                        { $eq: ["$userDid", userDid] },
                                        { $eq: ["$contentType", "proposal"] },
                                    ],
                                },
                            },
                        },
                    ],
                    as: "userReaction",
                },
            },

            // Lookup for circle details
            {
                $lookup: {
                    from: "circles",
                    let: { circleId: { $toObjectId: "$circleId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$circleId"] } } },
                        {
                            $project: {
                                _id: { $toString: "$_id" },
                                name: 1,
                                handle: 1,
                                picture: 1,
                                userGroups: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // Final projection
            {
                $project: {
                    _id: { $toString: "$_id" },
                    circleId: 1,
                    name: 1,
                    background: 1,
                    decisionText: 1,
                    images: 1,
                    createdBy: 1,
                    createdAt: 1,
                    editedAt: 1,
                    stage: 1,
                    outcome: 1,
                    outcomeReason: 1,
                    votingDeadline: 1,
                    reactions: 1,
                    userGroups: 1,
                    resolvedAtStage: 1,
                    location: 1,
                    author: {
                        _id: { $toString: "$authorDetails._id" },
                        did: "$authorDetails.did",
                        name: "$authorDetails.name",
                        handle: "$authorDetails.handle",
                        picture: "$authorDetails.picture",
                        images: "$authorDetails.images",
                        mission: "$authorDetails.mission",
                        description: "$authorDetails.description",
                        content: "$authorDetails.content",
                    },
                    userReaction: { $arrayElemAt: ["$userReaction.reactionType", 0] },
                    circle: "$circleDetails",
                },
            },
        ]).toArray()) as ProposalDisplay[];

        return proposals.length > 0 ? proposals[0] : null;
    } catch (error) {
        console.error("Error getting proposal:", error);
        throw error;
    }
};

/**
 * Create a new proposal
 * @param proposalData The proposal data to create (excluding _id, commentPostId)
 * @returns The created proposal document with its new _id and potentially commentPostId
 */
export const createProposal = async (
    proposalData: Omit<Proposal, "_id" | "commentPostId" | "goalId">,
): Promise<Proposal> => {
    try {
        // Ensure createdAt is set if not provided, and ensure goalId is not part of initial creation
        const { goalId, ...restOfProposalData } = proposalData as any; // goalId should not be set on creation
        const proposalToInsert = { ...restOfProposalData, createdAt: proposalData.createdAt || new Date() };
        const result = await Proposals.insertOne(proposalToInsert);
        if (!result.insertedId) {
            throw new Error("Failed to insert proposal into database.");
        }

        const createdProposalId = result.insertedId;
        let createdProposal = (await Proposals.findOne({ _id: createdProposalId })) as Proposal | null; // Fetch the created proposal

        if (!createdProposal) {
            throw new Error("Failed to retrieve created proposal immediately after insertion.");
        }

        // --- Create Shadow Post ---
        try {
            const feed = await Feeds.findOne({ circleId: proposalData.circleId });
            if (!feed) {
                console.warn(
                    `No feed found for circle ${proposalData.circleId} to create shadow post for proposal ${createdProposalId}. Commenting will be disabled.`,
                );
            } else {
                const shadowPostData: Omit<Post, "_id"> = {
                    feedId: feed._id.toString(),
                    createdBy: proposalData.createdBy,
                    createdAt: new Date(),
                    content: `Proposal: ${proposalData.name}`, // Simple content
                    postType: "proposal",
                    parentItemId: createdProposalId.toString(),
                    parentItemType: "proposal",
                    userGroups: proposalData.userGroups || [],
                    comments: 0,
                    reactions: {},
                };

                const shadowPost = await createPost(shadowPostData);

                // --- Update Proposal with commentPostId ---
                if (shadowPost && shadowPost._id) {
                    const commentPostIdString = shadowPost._id.toString();
                    const updateResult = await Proposals.updateOne(
                        { _id: createdProposalId },
                        { $set: { commentPostId: commentPostIdString } },
                    );
                    if (updateResult.modifiedCount === 1) {
                        createdProposal.commentPostId = commentPostIdString; // Update the object we return
                        console.log(
                            `Shadow post ${commentPostIdString} created and linked to proposal ${createdProposalId}`,
                        );
                    } else {
                        console.error(
                            `Failed to link shadow post ${commentPostIdString} to proposal ${createdProposalId}`,
                        );
                        // Optional: Delete orphaned shadow post
                        // await Posts.deleteOne({ _id: shadowPost._id });
                    }
                } else {
                    console.error(`Failed to create shadow post for proposal ${createdProposalId}`);
                }
            }
        } catch (postError) {
            console.error(`Error creating/linking shadow post for proposal ${createdProposalId}:`, postError);
        }
        // --- End Shadow Post Creation ---

        return createdProposal as Proposal;
    } catch (error) {
        console.error("Error creating proposal:", error);
        throw new Error(`Database error creating proposal: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Update a proposal
 * @param proposalId The ID of the proposal to update
 * @param updates The updates to apply
 * @returns Success status
 */
export const updateProposal = async (proposalId: string, updates: Partial<Proposal>): Promise<boolean> => {
    try {
        const { _id, ...updatesWithoutId } = updates;
        const result = await Proposals.updateOne({ _id: new ObjectId(proposalId) }, { $set: updatesWithoutId });
        return result.matchedCount > 0;
    } catch (error) {
        console.error("Error updating proposal:", error);
        throw error;
    }
};

/**
 * Delete a proposal
 * @param proposalId The ID of the proposal to delete
 * @returns Success status
 */
export const deleteProposal = async (proposalId: string): Promise<boolean> => {
    try {
        const result = await Proposals.deleteOne({ _id: new ObjectId(proposalId) });

        // Also delete any reactions associated with this proposal
        await Reactions.deleteMany({ contentId: proposalId, contentType: "proposal" });

        return result.deletedCount > 0;
    } catch (error) {
        console.error("Error deleting proposal:", error);
        throw error;
    }
};

/**
 * Change the stage of a proposal
 * @param proposalId The ID of the proposal
 * @param newStage The new stage
 * @param options Optional parameters: outcome, outcomeReason, goalId
 * @returns Success status
 */
export const changeProposalStage = async (
    proposalId: string,
    newStage: ProposalStage,
    options?: {
        outcome?: ProposalOutcome;
        outcomeReason?: string;
        goalId?: string;
    },
): Promise<boolean> => {
    try {
        const updates: Partial<Proposal> = { stage: newStage };
        let unsetFields: any = {};

        const proposal = await Proposals.findOne({ _id: new ObjectId(proposalId) });
        if (!proposal) {
            console.error(`Proposal with ID ${proposalId} not found.`);
            return false;
        }

        // Default behavior: clear outcome-related and goalId fields
        unsetFields.outcome = "";
        unsetFields.outcomeReason = "";
        unsetFields.resolvedAtStage = "";
        unsetFields.goalId = "";

        if (newStage === "implemented") {
            if (!options?.goalId) {
                console.error("goalId is required when moving proposal to 'implemented' stage.");
                return false;
            }
            updates.goalId = options.goalId;
            updates.outcome = "accepted"; // Mark as accepted outcome
            updates.resolvedAtStage = proposal.stage; // Store stage before implementation
            delete unsetFields.goalId; // Don't unset goalId
            delete unsetFields.outcome; // Don't unset outcome
            delete unsetFields.resolvedAtStage; // Don't unset resolvedAtStage
            // outcomeReason should be unset (handled by default)
        } else if (newStage === "rejected") {
            updates.outcome = "rejected";
            updates.resolvedAtStage = proposal.stage; // Store stage before rejection
            if (options?.outcomeReason) {
                updates.outcomeReason = options.outcomeReason;
                delete unsetFields.outcomeReason; // Don't unset if provided
            }
            delete unsetFields.outcome; // Don't unset outcome
            delete unsetFields.resolvedAtStage; // Don't unset resolvedAtStage
            // goalId should be unset (handled by default)
        } else if (newStage === "accepted") {
            // Moving to 'accepted' (from voting, presumably)
            // All outcome fields, resolvedAtStage, and goalId should be cleared (handled by default unsetFields)
        } else if (newStage === "draft" || newStage === "review" || newStage === "voting") {
            // Active, non-terminal stages.
            // All outcome fields, resolvedAtStage, and goalId should be cleared (handled by default unsetFields)
        }

        // Remove fields from 'updates' if they are also in 'unsetFields' to avoid conflicts
        // This ensures $unset takes precedence if a field is accidentally in both
        for (const key in unsetFields) {
            if (updates.hasOwnProperty(key)) {
                delete (updates as any)[key];
            }
        }

        const updateOperation: any = {};
        if (Object.keys(updates).length > 0) {
            updateOperation.$set = updates;
        }
        if (Object.keys(unsetFields).length > 0) {
            updateOperation.$unset = unsetFields;
        }

        if (Object.keys(updateOperation).length === 0) {
            // No actual changes to make (e.g., setting stage to current stage with no other options)
            return true; // Or false if this should indicate an issue
        }

        const result = await Proposals.updateOne({ _id: new ObjectId(proposalId) }, updateOperation);
        return result.matchedCount > 0;
    } catch (error) {
        console.error("Error changing proposal stage:", error);
        throw error;
    }
};

/**
 * Add a reaction to a proposal
 * @param proposalId The ID of the proposal
 * @param userDid The DID of the user reacting
 * @param reactionType The type of reaction (e.g., "like")
 * @returns Success status
 */
export const addReactionToProposal = async (
    proposalId: string,
    userDid: string,
    reactionType: string = "like",
): Promise<boolean> => {
    try {
        // Check if reaction already exists
        const existingReaction = await Reactions.findOne({
            contentId: proposalId,
            contentType: "proposal",
            userDid,
            reactionType,
        });

        if (existingReaction) {
            return true; // Reaction already exists
        }

        // Add the reaction
        await Reactions.insertOne({
            contentId: proposalId,
            contentType: "proposal",
            userDid,
            reactionType,
            createdAt: new Date(),
        });

        // Update the proposal's reaction count
        await Proposals.updateOne({ _id: new ObjectId(proposalId) }, { $inc: { [`reactions.${reactionType}`]: 1 } });

        return true;
    } catch (error) {
        console.error("Error adding reaction to proposal:", error);
        throw error;
    }
};

/**
 * Remove a reaction from a proposal
 * @param proposalId The ID of the proposal
 * @param userDid The DID of the user
 * @param reactionType The type of reaction (e.g., "like")
 * @returns Success status
 */
export const removeReactionFromProposal = async (
    proposalId: string,
    userDid: string,
    reactionType: string = "like",
): Promise<boolean> => {
    try {
        // Delete the reaction
        const result = await Reactions.deleteOne({
            contentId: proposalId,
            contentType: "proposal",
            userDid,
            reactionType,
        });

        if (result.deletedCount === 0) {
            return false; // Reaction didn't exist
        }

        // Update the proposal's reaction count
        await Proposals.updateOne({ _id: new ObjectId(proposalId) }, { $inc: { [`reactions.${reactionType}`]: -1 } });

        return true;
    } catch (error) {
        console.error("Error removing reaction from proposal:", error);
        throw error;
    }
};

/**
 * Get users who reacted to a proposal
 * @param proposalId The ID of the proposal
 * @param reactionType Optional type of reaction to filter by
 * @param limit Maximum number of users to return
 * @returns Array of users who reacted
 */
export const getProposalReactions = async (
    proposalId: string,
    reactionType?: string,
    limit: number = 20,
): Promise<Circle[]> => {
    try {
        const query: any = { contentId: proposalId, contentType: "proposal" };
        if (reactionType) {
            query.reactionType = reactionType;
        }

        const reactions = await Reactions.find(query).limit(limit).toArray();
        const userDids = reactions.map((r) => r.userDid);

        const users = await Circles.find({ did: { $in: userDids } }, { projection: SAFE_CIRCLE_PROJECTION }).toArray();

        return users.map((user) => ({
            did: user.did,
            name: user.name,
            picture: user.picture,
            handle: user.handle,
        })) as Circle[];
    } catch (error) {
        console.error("Error getting proposal reactions:", error);
        throw error;
    }
};
