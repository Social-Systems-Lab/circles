// proposal.ts - Proposal data access functions
import { Proposals, Circles, Members, Reactions } from "./db";
import { ObjectId } from "mongodb";
import { Proposal, ProposalDisplay, ProposalStage, ProposalOutcome, Circle } from "@/models/models";
import { getCircleById, SAFE_CIRCLE_PROJECTION } from "./circle";
import { getUserByDid } from "./user";

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
 * @param proposal The proposal to create
 * @returns The created proposal
 */
export const createProposal = async (proposal: Proposal): Promise<Proposal> => {
    try {
        const result = await Proposals.insertOne(proposal);
        return { ...proposal, _id: result.insertedId.toString() };
    } catch (error) {
        console.error("Error creating proposal:", error);
        throw error;
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
 * @param outcome Optional outcome (for resolved stage)
 * @param outcomeReason Optional reason for the outcome
 * @returns Success status
 */
export const changeProposalStage = async (
    proposalId: string,
    newStage: ProposalStage,
    outcome?: ProposalOutcome,
    outcomeReason?: string,
): Promise<boolean> => {
    try {
        const updates: Partial<Proposal> = { stage: newStage };
        let unsetFields: any = {}; // Fields to potentially remove

        // If moving to resolved stage, include outcome, reason, and the stage it was resolved at
        if (newStage === "resolved" && outcome) {
            // Find the proposal to determine the stage it's coming *from*
            const proposal = await Proposals.findOne({ _id: new ObjectId(proposalId) });
            if (!proposal) return false; // Proposal not found

            updates.outcome = outcome;
            updates.resolvedAtStage = proposal.stage; // Store the stage before resolving
            if (outcomeReason) {
                updates.outcomeReason = outcomeReason;
            } else {
                // If reason is empty or undefined, ensure it's removed from the document
                unsetFields.outcomeReason = "";
            }
        } else {
            // If moving *out* of resolved, clear outcome fields
            unsetFields.outcome = "";
            unsetFields.outcomeReason = "";
            unsetFields.resolvedAtStage = "";
        }

        // Perform the update and potentially unset fields in one operation
        const updateOperation: any = { $set: updates };
        if (Object.keys(unsetFields).length > 0) {
            updateOperation.$unset = unsetFields;
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
