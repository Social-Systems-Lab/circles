"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
    Circle,
    Media,
    Issue,
    IssueDisplay,
    IssueStage,
    mediaSchema,
    locationSchema, // Import locationSchema
    didSchema, // Import didSchema for assignedTo validation
} from "@/models/models";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid, getUserPrivate } from "@/lib/data/user"; // Added getUserPrivate
import { saveFile, deleteFile, FileInfo as StorageFileInfo } from "@/lib/data/storage";
import { features } from "@/lib/data/constants"; // Assuming features.issues will be added here
// Placeholder imports for issue data functions (to be created in src/lib/data/issue.ts)
import {
    getIssuesByCircleId,
    getIssueById,
    createIssue,
    updateIssue,
    deleteIssue,
    changeIssueStage,
    assignIssue,
} from "@/lib/data/issue"; // Placeholder
// Placeholder imports for issue notification functions (to be created in src/lib/data/notifications.ts)

/**
 * Get all issues for a circle
 * @param circleHandle The handle of the circle
 * @returns Array of issues
 */
export async function getIssuesAction(circleHandle: string): Promise<IssueDisplay[]> {
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

        // Check if user has permission to view issues (Placeholder feature handle)
        const canViewIssues = await isAuthorized(userDid, circle._id as string, features.issues?.view || "issues_view"); // Use placeholder
        if (!canViewIssues) {
            // Return empty array instead of throwing error, as some users might just not have access
            return [];
            // throw new Error("Not authorized to view issues");
        }

        // Get issues from the database (Placeholder data function)
        const issues = await getIssuesByCircleId(circle._id as string, userDid);
        return issues;
    } catch (error) {
        console.error("Error getting issues:", error);
        // Return empty array on error to avoid breaking the UI
        return [];
        // throw error; // Or re-throw if preferred
    }
}

/**
 * Get a single issue by ID
 * @param circleHandle The handle of the circle
 * @param issueId The ID of the issue
 * @returns The issue or null if not found or not authorized
 */
export async function getIssueAction(circleHandle: string, issueId: string): Promise<IssueDisplay | null> {
    try {
        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            // Not authenticated, cannot view
            return null;
            // throw new Error("User not authenticated");
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            // Circle doesn't exist
            return null;
            // throw new Error("Circle not found");
        }

        // Get the issue from the database first (Placeholder data function)
        // We need the issue data to check its specific userGroups for visibility
        const issue = await getIssueById(issueId, userDid);
        if (!issue) {
            // Issue doesn't exist
            return null;
        }

        // Check general permission to view any issues in the circle (Placeholder feature handle)
        const canViewModule = await isAuthorized(userDid, circle._id as string, features.issues?.view || "issues_view"); // Use placeholder

        // Check if the user belongs to any of the user groups allowed to see *this specific* issue
        // This requires comparing issue.userGroups with the user's groups in this circle
        // (Logic for this check needs the user's memberships for the circle)
        // For now, assume if they can view the module, they can view the specific issue if found
        // TODO: Implement fine-grained access check based on issue.userGroups

        if (!canViewModule) {
            // Not authorized to view issues module at all
            return null;
            // throw new Error("Not authorized to view issues");
        }

        // If authorized and issue exists, return it
        return issue;
    } catch (error) {
        console.error("Error getting issue:", error);
        return null; // Return null on error
        // throw error; // Or re-throw
    }
}

// --- Zod Schemas for Validation ---

const createIssueSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    images: z.array(z.any()).optional(), // Allow files or existing Media objects initially
    location: z
        .string()
        .optional()
        .refine(
            (val) => {
                if (!val) return true; // Optional is fine
                try {
                    locationSchema.parse(JSON.parse(val)); // Validate parsed object
                    return true;
                } catch {
                    return false;
                }
            },
            { message: "Invalid location data format" },
        ),
    userGroups: z.array(z.string()).optional(), // Optional: User groups for visibility
});

const updateIssueSchema = createIssueSchema.extend({
    // Updates use the same base fields
});

const assignIssueSchema = z.object({
    assigneeDid: didSchema.optional(), // Allow unassigning by passing undefined/null
});

// --- Action Functions ---

/**
 * Create a new issue
 * @param circleHandle The handle of the circle
 * @param formData The form data containing issue details
 * @returns The created issue ID and success status/message
 */
export async function createIssueAction(
    circleHandle: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string; issueId?: string }> {
    try {
        // Validate form data
        const validatedData = createIssueSchema.safeParse({
            title: formData.get("title"),
            description: formData.get("description"),
            images: formData.getAll("images"),
            location: formData.get("location"),
            userGroups: formData.getAll("userGroups"), // Assuming multi-select or similar
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
        const user = await getUserByDid(userDid);
        if (!user) {
            return { success: false, message: "User data not found" };
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Check permission to create issues (Placeholder feature handle)
        const canCreate = await isAuthorized(userDid, circle._id as string, features.issues?.create || "issues_create"); // Placeholder
        if (!canCreate) {
            return { success: false, message: "Not authorized to create issues" };
        }

        // --- Parse Location ---
        let locationData: Issue["location"] = undefined;
        if (data.location) {
            locationData = JSON.parse(data.location); // Already validated by Zod refine
        }

        // --- Handle Image Uploads ---
        let uploadedImages: Media[] = [];
        const imageFiles = (data.images || []).filter((img): img is File => img instanceof File);

        if (imageFiles.length > 0) {
            const uploadPromises = imageFiles.map(async (file) => {
                const fileNamePrefix = `issue_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                return await saveFile(file, fileNamePrefix, circle._id as string, true);
            });
            const uploadResults = await Promise.all(uploadPromises);

            uploadedImages = uploadResults.map(
                (result: StorageFileInfo): Media => ({
                    name: result.originalName || "Uploaded Image",
                    type: imageFiles.find((f) => f.name === result.originalName)?.type || "application/octet-stream",
                    fileInfo: {
                        url: result.url,
                        fileName: result.fileName,
                        originalName: result.originalName,
                    },
                }),
            );
        }
        // --- End Image Uploads ---

        // Determine initial stage based on circle rules (e.g., skip review?)
        // For now, default to 'review' as per spec
        const initialStage: IssueStage = "review";
        // TODO: Check circle settings/access rules if review step can be skipped

        // Create the issue object
        const newIssueData: Omit<Issue, "_id" | "updatedAt" | "resolvedAt" | "assignedTo" | "commentPostId"> = {
            title: data.title,
            description: data.description,
            images: uploadedImages,
            location: locationData,
            circleId: circle._id as string,
            createdBy: userDid,
            createdAt: new Date(),
            stage: initialStage,
            userGroups: data.userGroups || [], // Use provided groups or default to empty
        };

        // Create issue in DB (Placeholder data function)
        const createdIssue = await createIssue(newIssueData);

        // --- Trigger Notification ---
        if (initialStage === "review") {
            // Notify reviewers (Placeholder notification function)
            //notifyIssueSubmittedForReview(createdIssue, user); // Placeholder
        } else {
            // If skipping review (stage is 'open'), notify creator differently?
            // notifyIssueApproved(createdIssue, user); // Placeholder for direct open
        }

        // Revalidate the issues list page
        revalidatePath(`/circles/${circleHandle}/issues`);

        return {
            success: true,
            message: "Issue submitted successfully",
            issueId: createdIssue._id?.toString(),
        };
    } catch (error) {
        console.error("Error creating issue:", error);
        return { success: false, message: "Failed to submit issue" };
    }
}

/**
 * Update an existing issue
 * @param circleHandle The handle of the circle
 * @param issueId The ID of the issue to update
 * @param formData The form data containing updated details
 * @returns Success status and message
 */
export async function updateIssueAction(
    circleHandle: string,
    issueId: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate form data
        const validatedData = updateIssueSchema.safeParse({
            title: formData.get("title"),
            description: formData.get("description"),
            images: formData.getAll("images"),
            location: formData.get("location"),
            userGroups: formData.getAll("userGroups"),
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

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Get the existing issue (Placeholder data function)
        const issue = await getIssueById(issueId, userDid);
        if (!issue) {
            return { success: false, message: "Issue not found" };
        }

        // Check permissions: Author or Moderator? (Placeholder feature handle)
        const isAuthor = userDid === issue.createdBy;
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.issues?.moderate || "issues_moderate",
        ); // Placeholder

        // Define who can edit and when
        // Example: Author can edit in 'review', Moderator can edit anytime before 'resolved'
        const canEdit = (isAuthor && issue.stage === "review") || (canModerate && issue.stage !== "resolved");

        if (!canEdit) {
            return { success: false, message: "Not authorized to update this issue at its current stage" };
        }

        // --- Parse Location ---
        let locationData: Issue["location"] = undefined;
        if (data.location) {
            locationData = JSON.parse(data.location); // Validated by Zod
        } else {
            locationData = undefined; // Explicitly remove if empty
        }

        // --- Handle Image Updates (Similar logic to proposal update) ---
        const existingImages = issue.images || [];
        const submittedImageEntries = data.images || [];
        const newImageFiles = submittedImageEntries.filter((entry): entry is File => entry instanceof File);
        const existingMediaJsonStrings = submittedImageEntries.filter(
            (entry): entry is string => typeof entry === "string",
        );

        let parsedExistingMedia: Media[] = [];
        try {
            parsedExistingMedia = existingMediaJsonStrings.map((jsonString) => JSON.parse(jsonString) as Media);
        } catch (e) {
            return { success: false, message: "Failed to process existing image data." };
        }

        const remainingExistingMediaUrls = parsedExistingMedia
            .map((media) => media?.fileInfo?.url)
            .filter((url): url is string => typeof url === "string");

        const imagesToDelete = existingImages.filter(
            (existing: Media) => !remainingExistingMediaUrls.includes(existing.fileInfo.url), // Added type Media
        );

        let newlyUploadedImages: Media[] = [];
        if (newImageFiles.length > 0) {
            const uploadPromises = newImageFiles.map(async (file) => {
                const fileNamePrefix = `issue_image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                return await saveFile(file, fileNamePrefix, circle._id as string, true);
            });
            const uploadResults = await Promise.all(uploadPromises);
            newlyUploadedImages = uploadResults.map(
                (result: StorageFileInfo): Media => ({
                    name: result.originalName || "Uploaded Image",
                    type: newImageFiles.find((f) => f.name === result.originalName)?.type || "application/octet-stream",
                    fileInfo: { url: result.url, fileName: result.fileName, originalName: result.originalName },
                }),
            );
        }

        if (imagesToDelete.length > 0) {
            const deletePromises = imagesToDelete.map((img: Media) => deleteFile(img.fileInfo.url)); // Added type Media
            await Promise.all(deletePromises).catch((err) => console.error("Failed to delete some images:", err)); // Log errors but continue
        }

        const finalImages: Media[] = [...parsedExistingMedia, ...newlyUploadedImages];
        // --- End Image Updates ---

        // Prepare update data
        const updateData: Partial<Issue> = {
            title: data.title,
            description: data.description,
            images: finalImages,
            location: locationData,
            userGroups: data.userGroups || issue.userGroups, // Keep existing if not provided
            updatedAt: new Date(),
        };

        // Update issue in DB (Placeholder data function)
        const success = await updateIssue(issueId, updateData);

        if (!success) {
            return { success: false, message: "Failed to update issue" };
        }

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/issues`);
        revalidatePath(`/circles/${circleHandle}/issues/${issueId}`);

        return { success: true, message: "Issue updated successfully" };
    } catch (error) {
        console.error("Error updating issue:", error);
        return { success: false, message: "Failed to update issue" };
    }
}

/**
 * Delete an issue
 * @param circleHandle The handle of the circle
 * @param issueId The ID of the issue to delete
 * @returns Success status and message
 */
export async function deleteIssueAction(
    circleHandle: string,
    issueId: string,
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

        // Get the issue (Placeholder data function)
        const issue = await getIssueById(issueId, userDid);
        if (!issue) {
            return { success: false, message: "Issue not found" };
        }

        // Check permissions: Author or Moderator? (Placeholder feature handle)
        const isAuthor = userDid === issue.createdBy;
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.issues?.moderate || "issues_moderate",
        ); // Placeholder

        if (!isAuthor && !canModerate) {
            return { success: false, message: "Not authorized to delete this issue" };
        }

        // --- Delete Associated Images ---
        if (issue.images && issue.images.length > 0) {
            const deletePromises = issue.images.map((img: Media) => deleteFile(img.fileInfo.url)); // Added type Media
            await Promise.all(deletePromises).catch((err) => console.error("Failed to delete some issue images:", err)); // Log errors but continue
        }
        // --- End Delete Images ---

        // TODO: Delete associated shadow post for comments if implemented

        // Delete issue from DB (Placeholder data function)
        const success = await deleteIssue(issueId);

        if (!success) {
            return { success: false, message: "Failed to delete issue" };
        }

        // Revalidate the issues list page
        revalidatePath(`/circles/${circleHandle}/issues`);

        return { success: true, message: "Issue deleted successfully" };
    } catch (error) {
        console.error("Error deleting issue:", error);
        return { success: false, message: "Failed to delete issue" };
    }
}

/**
 * Change the stage of an issue
 * @param circleHandle The handle of the circle
 * @param issueId The ID of the issue
 * @param newStage The target stage
 * @returns Success status and message
 */
export async function changeIssueStageAction(
    circleHandle: string,
    issueId: string,
    newStage: IssueStage,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const user = await getUserByDid(userDid); // For notifications
        if (!user) {
            return { success: false, message: "User data not found" };
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Get the issue (Placeholder data function)
        const issue = await getIssueById(issueId, userDid);
        if (!issue) {
            return { success: false, message: "Issue not found" };
        }

        // --- Permission Checks based on transition ---
        let canChange = false;
        const currentStage = issue.stage;
        const isAssignee = userDid === issue.assignedTo;
        const canReview = await isAuthorized(userDid, circle._id as string, features.issues?.review || "issues_review"); // Placeholder
        const canResolve = await isAuthorized(
            userDid,
            circle._id as string,
            features.issues?.resolve || "issues_resolve",
        ); // Placeholder
        const canModerate = await isAuthorized(
            userDid,
            circle._id as string,
            features.issues?.moderate || "issues_moderate",
        ); // Placeholder

        if (canModerate) {
            canChange = true; // Moderators can likely do any valid transition
        } else if (currentStage === "review" && newStage === "open") {
            canChange = canReview; // User needs review permission
        } else if (currentStage === "open" && newStage === "inProgress") {
            // Assignee or anyone with resolve perm? Or just assignee? Let's say assignee or resolver.
            canChange = isAssignee || canResolve;
        } else if (currentStage === "inProgress" && newStage === "resolved") {
            canChange = isAssignee || canResolve; // Assignee or resolver can resolve
        } else if (currentStage === "inProgress" && newStage === "open") {
            // Allow moving back from In Progress to Open (e.g., unassigning work)
            canChange = isAssignee || canResolve; // Assignee or resolver
        }
        // Add other valid transitions as needed

        if (!canChange) {
            return { success: false, message: `Not authorized to move issue from ${currentStage} to ${newStage}` };
        }

        // --- Update Stage in DB --- (Placeholder data function)
        const success = await changeIssueStage(issueId, newStage);

        if (!success) {
            return { success: false, message: "Failed to change issue stage" };
        }

        // --- Trigger Notifications --- (Placeholders)
        const updatedIssue = await getIssueById(issueId, userDid); // Get updated issue for context
        if (updatedIssue) {
            if (currentStage === "review" && newStage === "open") {
                // TODO
                //notifyIssueApproved(updatedIssue, user);
            } else if (newStage === "resolved") {
                // TODO
                // Notify creator and assignee?
                //notifyIssueStatusChanged(updatedIssue, user, currentStage);
            } else {
                // TODO
                // General status change notification
                //notifyIssueStatusChanged(updatedIssue, user, currentStage);
            }
        }

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/issues`);
        revalidatePath(`/circles/${circleHandle}/issues/${issueId}`);

        return { success: true, message: `Issue stage changed to ${newStage}` };
    } catch (error) {
        console.error("Error changing issue stage:", error);
        return { success: false, message: "Failed to change issue stage" };
    }
}

/**
 * Assign an issue to a user
 * @param circleHandle The handle of the circle
 * @param issueId The ID of the issue
 * @param formData Contains assigneeDid (optional)
 * @returns Success status and message
 */
export async function assignIssueAction(
    circleHandle: string,
    issueId: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        // Validate assignee DID
        const validatedData = assignIssueSchema.safeParse({
            assigneeDid: formData.get("assigneeDid") || undefined, // Handle empty string or null from form
        });

        if (!validatedData.success) {
            return { success: false, message: "Invalid assignee data" };
        }
        const { assigneeDid } = validatedData.data; // Can be string or undefined

        // Get the current user
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "User not authenticated" };
        }
        const assignerUser = await getUserByDid(userDid); // For notifications
        if (!assignerUser) {
            return { success: false, message: "Assigner user data not found" };
        }

        // Get the circle
        const circle = await getCircleByHandle(circleHandle);
        if (!circle) {
            return { success: false, message: "Circle not found" };
        }

        // Get the issue (Placeholder data function)
        const issue = await getIssueById(issueId, userDid);
        if (!issue) {
            return { success: false, message: "Issue not found" };
        }

        // Check permission to assign (Placeholder feature handle)
        const canAssign = await isAuthorized(userDid, circle._id as string, features.issues?.assign || "issues_assign"); // Placeholder
        if (!canAssign) {
            return { success: false, message: "Not authorized to assign issues" };
        }

        // Optional: Check if the assignee is actually a member of the circle?

        // Update assignment in DB (Placeholder data function)
        const success = await assignIssue(issueId, assigneeDid); // Pass undefined to unassign

        if (!success) {
            return { success: false, message: "Failed to assign issue" };
        }

        // --- Trigger Notification --- (Placeholder)
        const updatedIssue = await getIssueById(issueId, userDid); // Get updated issue
        if (updatedIssue && assigneeDid) {
            const assigneeUser = await getUserPrivate(assigneeDid); // Use getUserPrivate for UserPrivate type
            if (assigneeUser) {
                // TODO
                //notifyIssueAssigned(updatedIssue, assignerUser, assigneeUser);
            }
        }
        // TODO: Handle notification for unassignment?

        // Revalidate relevant pages
        revalidatePath(`/circles/${circleHandle}/issues`);
        revalidatePath(`/circles/${circleHandle}/issues/${issueId}`);

        return {
            success: true,
            message: assigneeDid ? "Issue assigned successfully" : "Issue unassigned successfully",
        };
    } catch (error) {
        console.error("Error assigning issue:", error);
        return { success: false, message: "Failed to assign issue" };
    }
}

// TODO: Add actions for comment handling if using shadow posts or a dedicated system.
