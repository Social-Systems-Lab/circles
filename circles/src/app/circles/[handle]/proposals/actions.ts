"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod"; // Add zod import
import { Feeds, Posts, Proposals } from "@/lib/data/db"; // Import DB collections
import { Post } from "@/models/models"; // Import Post type
import { createPost } from "@/lib/data/feed"; // Import createPost
import { ObjectId } from "mongodb"; // Import ObjectId
import { Circle, Media, Proposal, ProposalDisplay, ProposalOutcome, ProposalStage, mediaSchema } from "@/models/models"; // Add Media, mediaSchema
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid } from "@/lib/data/user";
import { saveFile, deleteFile, FileInfo as StorageFileInfo, isFile } from "@/lib/data/storage"; // Correct storage functions and add FileInfo type alias, import isFile
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
import { ensureModuleIsEnabledOnCircle } from "@/lib/data/circle"; // Added

/**
 * Get all proposals for a circle (client-callable action)
 * @param circleHandle The handle of the circle
 * @returns Object with success status, proposals array, or error message
 */
export async function getProposalsByCircleIdAction(
    circleHandle: string,
): Promise<{ success: boolean; proposals?: ProposalDisplay[]; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        // Note: getProposalsByCircleId handles userDid being null for public visibility,
        // but for an action, we might want to enforce authentication or specific view rights.
        // For now, let's proceed assuming getProposalsByCircleId's internal logic is sufficient.

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Optional: Add explicit permission check here if needed, beyond what getProposalsByCircleId does.
        // const canView = await isAuthorized(userDid, circle._id.toString(), features.proposals.view);
        // if (!canView) {
        //     return { success: false, message: "Not authorized to view proposals for this circle." };
        // }

        const proposals = await getProposalsByCircleId(circle._id.toString(), userDid || undefined);
        return { success: true, proposals };
    } catch (error) {
        console.error("Error in getProposalsByCircleIdAction:", error);
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        return { success: false, message };
    }
}

/**
 * Get all proposals for a circle (legacy, consider deprecating or aligning with new action)
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
        const canViewProposals = await isAuthorized(userDid, circle._id.toString(), features.proposals.view);
        if (!canViewProposals) {
            throw new Error("Not authorized to view proposals");
        }

        // Get proposals from the database
        const proposals = await getProposalsByCircleId(circle._id.toString(), userDid);
        return proposals;
    } catch (error) {
        console.error("Error getting proposals:", error);
        throw error;
    }
}

/**
 * Ensures a shadow post exists for comments on a proposal. Creates one if missing.
 * Called server-side, e.g., from the page component.
 * @param proposalId The ID of the proposal
 * @param circleId The ID of the circle
 * @returns The commentPostId (string) or null if creation failed or wasn't needed.
 */
export async function ensureShadowPostForProposalAction(proposalId: string, circleId: string): Promise<string | null> {
    try {
        if (!ObjectId.isValid(proposalId) || !ObjectId.isValid(circleId)) {
            console.error("Invalid proposalId or circleId provided to ensureShadowPostForProposalAction");
            return null;
        }

        // Use the Proposals collection directly
        const proposal = await Proposals.findOne({ _id: new ObjectId(proposalId) });

        if (!proposal) {
            console.error(`Proposal not found: ${proposalId}`);
            return null;
        }

        // If commentPostId already exists, return it
        if (proposal.commentPostId) {
            return proposal.commentPostId;
        }

        // --- Create Shadow Post if missing ---
        console.log(`Shadow post missing for proposal ${proposalId}, attempting creation...`);
        const feed = await Feeds.findOne({ circleId: circleId });
        if (!feed) {
            console.warn(
                `No feed found for circle ${circleId} to create shadow post for proposal ${proposalId}. Cannot enable comments.`,
            );
            return null; // Cannot create post without a feed
        }

        const shadowPostData: Omit<Post, "_id"> = {
            feedId: feed._id.toString(),
            createdBy: proposal.createdBy, // Use proposal creator
            createdAt: new Date(),
            content: `Proposal: ${proposal.name}`, // Simple content
            postType: "proposal",
            parentItemId: proposal._id.toString(),
            parentItemType: "proposal",
            userGroups: proposal.userGroups || [],
            comments: 0,
            reactions: {},
        };

        const shadowPost = await createPost(shadowPostData); // Use the imported createPost

        if (shadowPost && shadowPost._id) {
            const commentPostIdString = shadowPost._id.toString();
            const updateResult = await Proposals.updateOne(
                { _id: proposal._id },
                { $set: { commentPostId: commentPostIdString } },
            );
            if (updateResult.modifiedCount === 1) {
                console.log(`Shadow post ${commentPostIdString} created and linked to proposal ${proposalId}`);
                return commentPostIdString; // Return the new ID
            } else {
                console.error(`Failed to link shadow post ${commentPostIdString} back to proposal ${proposalId}`);
                // Optional: Delete orphaned shadow post
                // await Posts.deleteOne({ _id: shadowPost._id });
                return null; // Linking failed
            }
        } else {
            console.error(`Failed to create shadow post for proposal ${proposalId}`);
            return null; // Post creation failed
        }
    } catch (error) {
        console.error(`Error in ensureShadowPostForProposalAction for proposal ${proposalId}:`, error);
        return null; // Return null on any error
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
    location: z.string().optional(), // Added location (as JSON string)
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
            location: formData.get("location") ?? undefined, // Convert null to undefined for Zod
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
        const canCreateProposals = await isAuthorized(userDid, circle._id.toString(), features.proposals.create);
        if (!canCreateProposals) {
            return { success: false, message: "Not authorized to create proposals" };
        }

        // --- Parse Location ---
        let locationData: Proposal["location"] = undefined;
        if (data.location) {
            try {
                locationData = JSON.parse(data.location);
                // Optional: Add more specific validation for the parsed location object if needed
            } catch (e) {
                console.error("Failed to parse location JSON:", e);
                return { success: false, message: "Invalid location data format." };
            }
        }

        // --- Handle Image Uploads ---
        let uploadedImages: Media[] = [];
        // Use the isFile helper function to identify file objects
        const imageFiles = (data.images || []).filter(isFile);

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
            location: locationData, // Use parsed location data
            circleId: circle._id.toString(),
            createdBy: userDid,
            createdAt: new Date(),
            stage: "draft", // Default stage
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

        // Ensure 'proposals' module is enabled if creating in user's own circle
        try {
            if (circle.circleType === "user" && circle.did === userDid) {
                await ensureModuleIsEnabledOnCircle(circle._id.toString(), "proposals", userDid);
            }
        } catch (moduleEnableError) {
            console.error("Failed to ensure proposals module is enabled on user circle:", moduleEnableError);
            // Non-critical, so don't fail the proposal creation
        }

        return {
            success: true,
            message: "Proposal created successfully",
            proposalId: createdProposal._id.toString(), // Return the ID
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
        const canCreateProposals = await isAuthorized(userDid, circle._id.toString(), features.proposals.create);
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
            circleId: circle._id.toString(),
            createdBy: userDid,
            createdAt: new Date(),
            stage: "draft", // Default stage
            reactions: {},
            userGroups: ["admins", "moderators", "members"], // Default visibility
        };

        const createdProposal = await createProposal(newProposalData);

        // Revalidate the proposals page
        revalidatePath(`/circles/${circleHandle}/proposals`);

        return {
            success: true,
            message: "Proposal draft created successfully",
            proposalId: createdProposal._id.toString(), // Return the ID
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
    location: z.string().optional(), // Added location (as JSON string)
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
            location: formData.get("location") ?? undefined, // Convert null to undefined for Zod
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
        const canModerate = await isAuthorized(userDid, circle._id.toString(), features.proposals.moderate);

        if (!isAuthor && !canModerate) {
            return { success: false, message: "Not authorized to update this proposal" };
        }

        // Only allow editing if the proposal is in draft stage, or if the user is a moderator
        if (proposal.stage !== "draft" && !canModerate) {
            return { success: false, message: "Proposals can only be edited in draft stage" };
        }

        // Prevent editing for proposals in voting or any terminal stage (accepted, implemented, rejected) by non-moderators
        if (["voting", "accepted", "implemented", "rejected"].includes(proposal.stage) && !canModerate) {
            return { success: false, message: "Proposals in this stage cannot be edited." };
        }

        // --- Parse Location ---
        let locationData: Proposal["location"] = undefined;
        if (data.location) {
            try {
                locationData = JSON.parse(data.location);
                // Optional: Add more specific validation for the parsed location object if needed
            } catch (e) {
                console.error("Failed to parse location JSON:", e);
                return { success: false, message: "Invalid location data format." };
            }
        } else {
            // If location string is empty or null, explicitly set it to undefined to remove it
            locationData = undefined;
        }

        // --- Handle Image Updates ---
        const existingImages = proposal.images || [];
        const submittedImageEntries = data.images || []; // These are Files or JSON strings

        // Separate new files from existing media identifiers (JSON strings)
        // Use the isFile helper function to identify file objects
        const newImageFiles = submittedImageEntries.filter(isFile);
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
                return await saveFile(file, fileNamePrefix, circle._id.toString(), true); // Use saveFile
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
            location: locationData, // Use parsed location data (or undefined to remove)
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
        const canModerate = await isAuthorized(userDid, circle._id.toString(), features.proposals.moderate);

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
 * @param options Optional parameters: outcome, outcomeReason, goalId
 * @returns Success status and message
 */
export async function changeProposalStageAction(
    circleHandle: string,
    proposalId: string,
    newStage: ProposalStage,
    options?: {
        // Updated to accept an options object
        outcome?: ProposalOutcome;
        outcomeReason?: string;
        goalId?: string;
    },
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
        const canReview = await isAuthorized(userDid, circle._id.toString(), features.proposals.review);
        const canVote = await isAuthorized(userDid, circle._id.toString(), features.proposals.vote); // For moving to accepted/rejected from voting
        const canRank = await isAuthorized(userDid, circle._id.toString(), features.proposals.rank); // For moving from accepted to implemented
        const canResolve = await isAuthorized(userDid, circle._id.toString(), features.proposals.resolve); // General resolve/reject permission
        const canModerate = await isAuthorized(userDid, circle._id.toString(), features.proposals.moderate);

        let canChangeStage = false;

        if (canModerate) {
            canChangeStage = true;
        } else {
            switch (proposal.stage) {
                case "draft":
                    if (newStage === "review" && isAuthor) canChangeStage = true;
                    break;
                case "review":
                    if ((newStage === "voting" || newStage === "rejected") && canReview) canChangeStage = true;
                    break;
                case "voting":
                    if ((newStage === "accepted" || newStage === "rejected") && (canVote || canResolve))
                        canChangeStage = true;
                    break;
                case "accepted":
                    // Moving from 'accepted' to 'implemented' (requires goalId) or 'rejected'
                    if (newStage === "implemented" && options?.goalId && (canRank || canResolve)) canChangeStage = true;
                    if (newStage === "rejected" && (canRank || canResolve)) canChangeStage = true;
                    break;
                // No transitions out of 'implemented' or 'rejected' by non-moderators
            }
        }

        if (!canChangeStage) {
            return { success: false, message: "Not authorized to change the stage of this proposal." };
        }

        // Change the proposal stage using the new signature for changeProposalStage
        const success = await changeProposalStage(proposalId, newStage, options);

        if (!success) {
            return { success: false, message: "Failed to change proposal stage" };
        }

        // --- Trigger Notifications ---
        const updatedProposal = await getProposalById(proposalId, userDid); // Fetch fresh proposal data for notifications
        if (updatedProposal) {
            // Adapting notification logic based on new stages
            if (proposal.stage === "draft" && newStage === "review") {
                notifyProposalSubmittedForReview(updatedProposal, user);
            } else if (proposal.stage === "review" && newStage === "voting") {
                notifyProposalMovedToVoting(updatedProposal, user); // To voters
                notifyProposalApprovedForVoting(updatedProposal, user); // To author
            } else if (proposal.stage === "voting" && (newStage === "accepted" || newStage === "rejected")) {
                // This is effectively a resolution from the voting stage
                notifyProposalResolvedAuthor(updatedProposal, user); // Notify author
                notifyProposalResolvedVoters(updatedProposal, user); // Notify voters
            } else if (proposal.stage === "accepted" && (newStage === "implemented" || newStage === "rejected")) {
                // Resolution from the accepted (ranking) stage
                notifyProposalResolvedAuthor(updatedProposal, user); // Notify author
                // Consider if voters need another notification here, or if previous one was sufficient.
                // For now, let's assume author notification is key.
            }
            // Add more specific notifications if needed for 'accepted' or 'implemented' stages directly.
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
        const canVote = await isAuthorized(userDid, circle._id.toString(), features.proposals.vote);
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
