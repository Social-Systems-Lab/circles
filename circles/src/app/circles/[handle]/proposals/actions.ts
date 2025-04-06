"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod"; // Add zod import
import { Circle, Media, Proposal, ProposalDisplay, ProposalOutcome, ProposalStage, mediaSchema } from "@/models/models"; // Add Media, mediaSchema
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid } from "@/lib/data/user";
import { saveFile, deleteFile, FileInfo as StorageFileInfo } from "@/lib/data/storage"; // Correct storage functions and add FileInfo type alias
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
import {
    notifyProposalSubmittedForReview,
    notifyProposalMovedToVoting,
    notifyProposalApprovedForVoting,
    notifyProposalResolvedAuthor,
    notifyProposalResolvedVoters,
    notifyProposalVote,
} from "@/lib/data/notifications";

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
 * @param data The proposal data (validated)
 * @returns The created proposal ID and success status/message
 */

// Define schema for input validation
const createProposalSchema = z.object({
    name: z.string().min(1),
    background: z.string().min(1),
    decisionText: z.string().min(1),
    images: z.array(z.any()).optional(), // Allow files or existing Media objects initially
});

export async function createProposalAction(
    circleHandle: string,
    formData: FormData, // Use FormData for file uploads
): Promise<{ success: boolean; message?: string; proposalId?: string }> {
    try {
        // Validate form data against schema
        const validatedData = createProposalSchema.safeParse({
            name: formData.get("name"),
            background: formData.get("background"),
            decisionText: formData.get("decisionText"),
            images: formData.getAll("images"), // Get all files/data associated with 'images'
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
        const user = await getUserByDid(userDid); // Get user object for notifications
        if (!user) {
            // Should not happen if authenticated, but good practice to check
            return { success: false, message: "User data not found" };
        }

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

        // --- Handle Image Uploads ---
        let uploadedImages: Media[] = [];
        const imageFiles = (data.images || []).filter((img): img is File => img instanceof File);

        if (imageFiles.length > 0) {
            const uploadPromises = imageFiles.map(async (file) => {
                // Generate a unique filename prefix, saveFile adds timestamp
                const fileNamePrefix = `proposal_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                return await saveFile(file, fileNamePrefix, circle._id as string, true); // Use saveFile, overwrite=true
            });
            const uploadResults = await Promise.all(uploadPromises);

            // Map StorageFileInfo to Media
            uploadedImages = uploadResults.map(
                (result: StorageFileInfo): Media => ({
                    name: result.originalName || "Uploaded Image",
                    // We don't get contentType back from saveFile, use file.type if available
                    type: imageFiles.find((f) => f.name === result.originalName)?.type || "application/octet-stream",
                    fileInfo: {
                        url: result.url,
                        // saveFile doesn't return the final timestamped name in fileName prop, store it if needed or reconstruct path
                        fileName: result.fileName, // This might just be the prefix passed in
                        originalName: result.originalName,
                    },
                }),
            );
        }
        // --- End Image Uploads ---

        // Create the proposal object
        const newProposalData: Omit<Proposal, "_id"> = {
            name: data.name,
            background: data.background,
            decisionText: data.decisionText,
            images: uploadedImages, // Use uploaded image data
            circleId: circle._id as string,
            createdBy: userDid,
            createdAt: new Date(),
            stage: "draft",
            reactions: {},
            userGroups: ["admins", "moderators", "members"], // Default visibility
        };

        const createdProposal = await createProposal(newProposalData);

        // Revalidate the proposals page
        revalidatePath(`/circles/${circleHandle}/proposals`);

        // Don't need full proposal here, just ID for navigation
        // const fullProposal = await getProposalById(createdProposal._id as string, userDid);

        // Revalidate the proposals page
        revalidatePath(`/circles/${circleHandle}/proposals`);

        return {
            success: true,
            message: "Proposal created successfully",
            proposalId: createdProposal._id?.toString(), // Return the ID
        };
    } catch (error) {
        console.error("Error creating proposal:", error);
        return { success: false, message: "Failed to create proposal" };
    }
}

/**
 * Create a minimal proposal draft (only name required)
 * Used by the quick create dialog in the proposals list.
 * @param circleHandle The handle of the circle
 * @param name The name for the new proposal draft
 * @returns The created proposal ID and success status/message
 */
export async function createProposalDraftAction(
    circleHandle: string,
    name: string,
): Promise<{ success: boolean; message?: string; proposalId?: string }> {
    try {
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

        // Check permission
        const canCreateProposals = await isAuthorized(userDid, circle._id as string, features.proposals.create);
        if (!canCreateProposals) {
            return { success: false, message: "Not authorized to create proposals" };
        }

        // Validate just the name
        if (!name || name.trim().length === 0) {
            return { success: false, message: "Proposal name cannot be empty" };
        }

        // Create the minimal proposal draft object
        const newProposalData: Omit<Proposal, "_id"> = {
            name: name.trim(),
            background: "", // Default empty
            decisionText: "", // Default empty
            images: [], // Default empty
            circleId: circle._id as string,
            createdBy: userDid,
            createdAt: new Date(),
            stage: "draft",
            reactions: {},
            userGroups: ["admins", "moderators", "members"], // Default visibility
        };

        const createdProposal = await createProposal(newProposalData);

        // Revalidate the proposals page
        revalidatePath(`/circles/${circleHandle}/proposals`);

        return {
            success: true,
            message: "Proposal draft created successfully",
            proposalId: createdProposal._id?.toString(), // Return the ID
        };
    } catch (error) {
        console.error("Error creating proposal draft:", error);
        return { success: false, message: "Failed to create proposal draft" };
    }
}

/**
 * Update an existing proposal
 * @param circleHandle The handle of the circle
 * @param proposalId The ID of the proposal
 * @param data The updated proposal data (validated)
 * @returns Success status and message
 */

// Define schema for update input validation
const updateProposalSchema = z.object({
    name: z.string().min(1),
    background: z.string().min(1),
    decisionText: z.string().min(1),
    images: z.array(z.any()).optional(), // Allow files or existing Media objects
});

export async function updateProposalAction(
    circleHandle: string,
    proposalId: string,
    formData: FormData, // Use FormData for file uploads
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate form data
        const validatedData = updateProposalSchema.safeParse({
            name: formData.get("name"),
            background: formData.get("background"),
            decisionText: formData.get("decisionText"),
            images: formData.getAll("images"), // Get all files/data associated with 'images'
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
        const user = await getUserByDid(userDid); // Get user object for notifications
        if (!user) {
            return { success: false, message: "User data not found" };
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

        // --- Handle Image Updates ---
        const existingImages = proposal.images || [];
        const submittedImageEntries = data.images || []; // These are Files or JSON strings

        // Separate new files from existing media identifiers (JSON strings)
        const newImageFiles = submittedImageEntries.filter((entry): entry is File => entry instanceof File);
        const existingMediaJsonStrings = submittedImageEntries.filter(
            (entry): entry is string => typeof entry === "string",
        );

        // Parse the JSON strings back into Media objects
        let parsedExistingMedia: Media[] = [];
        try {
            parsedExistingMedia = existingMediaJsonStrings.map((jsonString) => JSON.parse(jsonString) as Media);
        } catch (e) {
            console.error("Failed to parse existing media JSON:", e);
            // Handle error appropriately, maybe return failure or proceed without existing images
            return { success: false, message: "Failed to process existing image data." };
        }

        // Safely map to URLs, filtering out any malformed entries
        const remainingExistingMediaUrls = parsedExistingMedia
            .map((media) => media?.fileInfo?.url) // Safely access nested property
            .filter((url): url is string => typeof url === "string"); // Filter out undefined/null URLs

        // Identify images to delete (compare original existing images with the URLs of those submitted back)
        const imagesToDelete = existingImages.filter(
            (existing) => !remainingExistingMediaUrls.includes(existing.fileInfo.url),
        );

        // Upload new files
        let newlyUploadedImages: Media[] = [];
        if (newImageFiles.length > 0) {
            const uploadPromises = newImageFiles.map(async (file) => {
                const fileNamePrefix = `proposal_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                return await saveFile(file, fileNamePrefix, circle._id as string, true); // Use saveFile
            });
            const uploadResults = await Promise.all(uploadPromises);

            newlyUploadedImages = uploadResults.map(
                (result: StorageFileInfo): Media => ({
                    name: result.originalName || "Uploaded Image",
                    type: newImageFiles.find((f) => f.name === result.originalName)?.type || "application/octet-stream",
                    fileInfo: {
                        url: result.url,
                        fileName: result.fileName, // Might be just prefix
                        originalName: result.originalName,
                    },
                }),
            );
        }

        // Delete removed files from storage using their URLs
        if (imagesToDelete.length > 0) {
            const deletePromises = imagesToDelete.map(async (img) => {
                try {
                    await deleteFile(img.fileInfo.url); // Use deleteFile with URL
                } catch (error) {
                    console.error(`Failed to delete file ${img.fileInfo.url}:`, error);
                    // Decide if failure to delete should stop the update or just be logged
                }
            });
            await Promise.all(deletePromises);
        }

        // Combine remaining existing images and newly uploaded images
        const finalImages: Media[] = [
            ...parsedExistingMedia, // Use the parsed Media objects
            ...newlyUploadedImages,
        ];
        // --- End Image Updates ---

        // Prepare update data
        const updateData: Partial<Proposal> = {
            name: data.name,
            background: data.background,
            decisionText: data.decisionText,
            images: finalImages,
            editedAt: new Date(),
        };

        // Update the proposal in the database
        const success = await updateProposal(proposalId, updateData);

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
        const user = await getUserByDid(userDid); // Get user object for notifications
        if (!user) {
            return { success: false, message: "User data not found" };
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
        const user = await getUserByDid(userDid); // Get user object for notifications
        if (!user) {
            return { success: false, message: "User data not found" };
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

        // --- Trigger Notifications ---
        // Fetch the updated proposal *after* the stage change to ensure correct data
        const updatedProposal = await getProposalById(proposalId, userDid);
        if (updatedProposal) {
            if (proposal.stage === "draft" && newStage === "review") {
                // Notify reviewers when submitted
                notifyProposalSubmittedForReview(updatedProposal, user);
            } else if (proposal.stage === "review" && newStage === "voting") {
                // Notify voters and author when moved to voting
                notifyProposalMovedToVoting(updatedProposal, user);
                notifyProposalApprovedForVoting(updatedProposal, user);
            } else if (newStage === "resolved") {
                // Notify author and voters when resolved
                notifyProposalResolvedAuthor(updatedProposal, user);
                notifyProposalResolvedVoters(updatedProposal, user);
            }
        } else {
            console.error("Failed to fetch updated proposal for notifications:", proposalId);
        }
        // --- End Notifications ---

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
        const user = await getUserByDid(userDid); // Get user object for notifications
        if (!user) {
            return { success: false, message: "User data not found" };
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

        // --- Trigger Notification ---
        if (voteType === "like") {
            // Notify author only when a vote is added (not removed)
            notifyProposalVote(proposal, user);
        }
        // --- End Notification ---

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
