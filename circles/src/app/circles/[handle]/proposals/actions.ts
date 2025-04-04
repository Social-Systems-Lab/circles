"use server";

import { revalidatePath } from "next/cache";
import { Circle, Proposal, ProposalDisplay, ProposalOutcome, ProposalStage } from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid } from "@/lib/data/user";
import { features } from "@/lib/data/constants";
import {
    getProposalsByCircleId,
    getProposalById,
    createProposal,
    updateProposal,
    deleteProposal,
    changeProposalStage,
    addReactionToProposal,
    removeReactionFromProposal,
} from "@/lib/data/proposal";

/**
 * Get all proposals for a circle
 * @param circleHandle The handle of the circle
 * @returns Array of proposals
 */
export async function getProposalsAction(circleHandle: string): Promise<ProposalDisplay[]> {
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

        // Check if user has permission to view proposals
        const canViewProposals = await isAuthorized(userDid, circle._id as string, features.proposals.view);
        if (!canViewProposals) {
            throw new Error("Not authorized to view proposals");
        }

        // Get proposals from the database
        const proposals = await getProposalsByCircleId(circle._id as string, userDid);
        return proposals;
    } catch (error) {
        console.error("Error getting proposals:", error);
        throw error;
    }
}

/**
 * Get a single proposal by ID
 * @param circleHandle The handle of the circle
 * @param proposalId The ID of the proposal
 * @returns The proposal or null if not found
 */
export async function getProposalAction(circleHandle: string, proposalId: string): Promise<ProposalDisplay | null> {
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

        // Check if user has permission to view proposals
        const canViewProposals = await isAuthorized(userDid, circle._id as string, features.proposals.view);
        if (!canViewProposals) {
            throw new Error("Not authorized to view proposals");
        }

        // Get the proposal from the database
        const proposal = await getProposalById(proposalId, userDid);
        return proposal;
    } catch (error) {
        console.error("Error getting proposal:", error);
        throw error;
    }
}

/**
 * Create a new proposal
 * @param circleHandle The handle of the circle
 * @param data The proposal data
 * @returns The created proposal
 */
export async function createProposalAction(
    circleHandle: string,
    data: { name: string; description: string },
): Promise<{ success: boolean; message?: string; proposal?: ProposalDisplay }> {
    try {
        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const user = await getUserByDid(userDid);

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Check if user has permission to create proposals
        const canCreateProposals = await isAuthorized(userDid, circle._id as string, features.proposals.create);
        if (!canCreateProposals) {
            return { success: false, message: "Not authorized to create proposals" };
        }

        // Create the proposal
        const newProposal: Proposal = {
            name: data.name,
            description: data.description,
            circleId: circle._id as string,
            createdBy: userDid,
            createdAt: new Date(),
            stage: "draft",
            reactions: {},
            userGroups: ["admins", "moderators", "members"], // Default visibility
        };

        const createdProposal = await createProposal(newProposal);

        // Get the full proposal with author details
        const fullProposal = await getProposalById(createdProposal._id as string, userDid);

        // Revalidate the proposals page
        revalidatePath(`/circles/${circleHandle}/proposals`);

        return {
            success: true,
            message: "Proposal created successfully",
            proposal: fullProposal as ProposalDisplay,
        };
    } catch (error) {
        console.error("Error creating proposal:", error);
        return { success: false, message: "Failed to create proposal" };
    }
}

/**
 * Update an existing proposal
 * @param circleHandle The handle of the circle
 * @param proposalId The ID of the proposal
 * @param data The updated proposal data
 * @returns Success status and message
 */
export async function updateProposalAction(
    circleHandle: string,
    proposalId: string,
    data: { name: string; description: string },
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

        // Get the proposal
        const proposal = await getProposalById(proposalId, userDid);
        if (!proposal) {
            return { success: false, message: "Proposal not found" };
        }

        // Check if user is the author or has moderation permissions
        const isAuthor = userDid === proposal.createdBy;
        const canModerate = await isAuthorized(userDid, circle._id as string, features.proposals.moderate);

        if (!isAuthor && !canModerate) {
            return { success: false, message: "Not authorized to update this proposal" };
        }

        // Only allow editing if the proposal is in draft stage, or if the user is a moderator
        if (proposal.stage !== "draft" && !canModerate) {
            return { success: false, message: "Proposals can only be edited in draft stage" };
        }

        // Update the proposal
        const success = await updateProposal(proposalId, {
            name: data.name,
            description: data.description,
            editedAt: new Date(),
        });

        if (!success) {
            return { success: false, message: "Failed to update proposal" };
        }

        // Revalidate the proposal pages
        revalidatePath(`/circles/${circleHandle}/proposals`);
        revalidatePath(`/circles/${circleHandle}/proposals/${proposalId}`);

        return { success: true, message: "Proposal updated successfully" };
    } catch (error) {
        console.error("Error updating proposal:", error);
        return { success: false, message: "Failed to update proposal" };
    }
}

/**
 * Delete a proposal
 * @param circleHandle The handle of the circle
 * @param proposalId The ID of the proposal
 * @returns Success status and message
 */
export async function deleteProposalAction(
    circleHandle: string,
    proposalId: string,
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

        // Get the proposal
        const proposal = await getProposalById(proposalId, userDid);
        if (!proposal) {
            return { success: false, message: "Proposal not found" };
        }

        // Check if user is the author or has moderation permissions
        const isAuthor = userDid === proposal.createdBy;
        const canModerate = await isAuthorized(userDid, circle._id as string, features.proposals.moderate);

        if (!isAuthor && !canModerate) {
            return { success: false, message: "Not authorized to delete this proposal" };
        }

        // Delete the proposal
        const success = await deleteProposal(proposalId);

        if (!success) {
            return { success: false, message: "Failed to delete proposal" };
        }

        // Revalidate the proposals page
        revalidatePath(`/circles/${circleHandle}/proposals`);

        return { success: true, message: "Proposal deleted successfully" };
    } catch (error) {
        console.error("Error deleting proposal:", error);
        return { success: false, message: "Failed to delete proposal" };
    }
}

/**
 * Change the stage of a proposal
 * @param circleHandle The handle of the circle
 * @param proposalId The ID of the proposal
 * @param newStage The new stage for the proposal
 * @param outcome Optional outcome (for resolved stage)
 * @param outcomeReason Optional reason for the outcome
 * @returns Success status and message
 */
export async function changeProposalStageAction(
    circleHandle: string,
    proposalId: string,
    newStage: ProposalStage,
    outcome?: ProposalOutcome,
    outcomeReason?: string,
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

        // Get the proposal
        const proposal = await getProposalById(proposalId, userDid);
        if (!proposal) {
            return { success: false, message: "Proposal not found" };
        }

        // Check permissions based on current stage and new stage
        const isAuthor = userDid === proposal.createdBy;
        const canReview = await isAuthorized(userDid, circle._id as string, features.proposals.review);
        const canResolve = await isAuthorized(userDid, circle._id as string, features.proposals.resolve);
        const canModerate = await isAuthorized(userDid, circle._id as string, features.proposals.moderate);

        // Determine if the user can make this stage change
        let canChangeStage = false;

        if (canModerate) {
            // Moderators can change to any stage
            canChangeStage = true;
        } else if (proposal.stage === "draft" && newStage === "review") {
            // Authors can submit their draft for review
            canChangeStage = isAuthor;
        } else if (proposal.stage === "review") {
            // Reviewers can approve for voting or reject
            canChangeStage = canReview;
        } else if (proposal.stage === "voting" && newStage === "resolved") {
            // Resolvers can mark as resolved
            canChangeStage = canResolve;
        }

        if (!canChangeStage) {
            return { success: false, message: "Not authorized to change the stage of this proposal" };
        }

        // Change the proposal stage
        const success = await changeProposalStage(proposalId, newStage, outcome, outcomeReason);

        if (!success) {
            return { success: false, message: "Failed to change proposal stage" };
        }

        // Revalidate the proposal pages
        revalidatePath(`/circles/${circleHandle}/proposals`);
        revalidatePath(`/circles/${circleHandle}/proposals/${proposalId}`);

        return { success: true, message: `Proposal moved to ${newStage} stage` };
    } catch (error) {
        console.error("Error changing proposal stage:", error);
        return { success: false, message: "Failed to change proposal stage" };
    }
}

/**
 * Vote on a proposal
 * @param circleHandle The handle of the circle
 * @param proposalId The ID of the proposal
 * @param voteType The type of vote (like, unlike)
 * @returns Success status and message
 */
export async function voteOnProposalAction(
    circleHandle: string,
    proposalId: string,
    voteType: "like" | null,
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

        // Get the proposal
        const proposal = await getProposalById(proposalId, userDid);
        if (!proposal) {
            return { success: false, message: "Proposal not found" };
        }

        // Check if the proposal is in the voting stage
        if (proposal.stage !== "voting") {
            return { success: false, message: "Proposal is not in the voting stage" };
        }

        // Check if user has permission to vote
        const canVote = await isAuthorized(userDid, circle._id as string, features.proposals.vote);
        if (!canVote) {
            return { success: false, message: "Not authorized to vote on proposals" };
        }

        // Add or remove the vote
        let success = false;
        if (voteType === "like") {
            success = await addReactionToProposal(proposalId, userDid);
        } else {
            success = await removeReactionFromProposal(proposalId, userDid);
        }

        if (!success) {
            return { success: false, message: "Failed to process vote" };
        }

        // Revalidate the proposal pages
        revalidatePath(`/circles/${circleHandle}/proposals`);
        revalidatePath(`/circles/${circleHandle}/proposals/${proposalId}`);

        return {
            success: true,
            message: voteType ? "Vote added successfully" : "Vote removed successfully",
        };
    } catch (error) {
        console.error("Error voting on proposal:", error);
        return { success: false, message: "Failed to process vote" };
    }
}
