// events/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { Feeds, Events } from "@/lib/data/db";
import {
    Circle,
    Media,
    mediaSchema,
    locationSchema,
    didSchema,
    Event as EventModel,
    EventDisplay,
    EventStage,
    CircleType,
} from "@/models/models";
import { getCircleByHandle, ensureModuleIsEnabledOnCircle, getCirclesBySearchQuery } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid, getUserPrivate } from "@/lib/data/user";
import { saveFile, deleteFile, FileInfo as StorageFileInfo, isFile } from "@/lib/data/storage";
import { features } from "@/lib/data/constants";

// Data layer
import {
    getEventsByCircleId,
    getEventById,
    createEvent as createEventDb,
    updateEvent as updateEventDb,
    deleteEvent as deleteEventDb,
    changeEventStage as changeEventStageDb,
} from "@/lib/data/event";
import { getCirclesByDids } from "@/lib/data/circle";
import { upsertRsvp, cancelRsvp } from "@/lib/data/eventRsvp";
import {
    notifyEventSubmittedForReview,
    notifyEventApproved,
    notifyEventStatusChanged,
} from "@/lib/data/eventNotifications";
import { inviteUsersToEvent } from "@/lib/data/event";
import { getMembers } from "@/lib/data/member";
import { addCommentToDiscussion, getDiscussionWithComments } from "@/lib/data/discussion";
import { Comment } from "@/models/models";

// ----- Types -----

type GetEventsActionResult = {
    events: EventDisplay[];
};

type GetInvitedUsersActionResult = {
    users: Circle[];
};

type GetCircleMembersActionResult = {
    members: Circle[];
};

type GetCirclesBySearchQueryActionResult = {
    circles: Circle[];
};

// ----- Zod Schemas -----

const createEventSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    images: z.array(z.any()).optional(),
    location: z
        .string()
        .optional()
        .refine(
            (val) => {
                if (!val) return true;
                try {
                    locationSchema.parse(JSON.parse(val));
                    return true;
                } catch {
                    return false;
                }
            },
            { message: "Invalid location data format" },
        ),
    userGroups: z.array(z.string()).optional(),
    isVirtual: z.string().optional(), // "on" / "true" / undefined
    isHybrid: z.string().optional(),
    virtualUrl: z.string().url().optional().or(z.literal("")).optional(),
    startAt: z.string().min(1, "Start date/time is required"),
    endAt: z.string().min(1, "End date/time is required"),
    allDay: z.string().optional(), // "on" / undefined
    categories: z.array(z.string()).optional(),
    causes: z.array(z.string()).optional(),
    capacity: z.string().optional(), // parse to number
});

const updateEventSchema = createEventSchema;

// ----- Helpers -----

function parseBool(val?: string): boolean | undefined {
    if (!val) return undefined;
    const v = (val || "").toLowerCase();
    return v === "true" || v === "on" ? true : v === "false" ? false : true;
}

function parseDate(val: string): Date {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
        throw new Error(`Invalid date: ${val}`);
    }
    return d;
}

// ----- Actions -----

/**
 * Get list of events for a circle (optionally filtered by range)
 */
export async function getEventsAction(
    circleHandle: string,
    params?: { from?: string; to?: string },
    includeCreated?: boolean,
    includeParticipating?: boolean,
): Promise<GetEventsActionResult> {
    const defaultResult: GetEventsActionResult = { events: [] };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return defaultResult;

        const range =
            params && (params.from || params.to)
                ? {
                      from: params.from ? parseDate(params.from) : undefined,
                      to: params.to ? parseDate(params.to) : undefined,
                  }
                : undefined;

        const events = await getEventsByCircleId(
            circle._id!.toString(),
            userDid,
            range,
            includeCreated,
            includeParticipating,
        );
        return { events };
    } catch (error) {
        console.error("Error in getEventsAction:", error);
        return defaultResult;
    }
}

/**
 * Get single event by id
 */
export async function getEventAction(circleHandle: string, eventId: string): Promise<EventDisplay | null> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return null;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return null;

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return null;

        const event = await getEventById(eventId, userDid);
        return event;
    } catch (error) {
        console.error("Error in getEventAction:", error);
        return null;
    }
}

/**
 * Create event
 */
export async function createEventAction(
    circleHandle: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string; eventId?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const user = await getUserByDid(userDid);
        if (!user) return { success: false, message: "User not found" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const canCreate = await isAuthorized(userDid, circle._id as string, features.events.create);
        if (!canCreate) return { success: false, message: "Not authorized to create events" };

        const validated = createEventSchema.safeParse({
            title: formData.get("title"),
            description: formData.get("description"),
            images: formData.getAll("images"),
            location: formData.get("location") ?? undefined,
            userGroups: formData.getAll("userGroups"),
            isVirtual: (formData.get("isVirtual") as string) ?? undefined,
            isHybrid: (formData.get("isHybrid") as string) ?? undefined,
            virtualUrl: (formData.get("virtualUrl") as string) ?? undefined,
            startAt: (formData.get("startAt") as string) ?? "",
            endAt: (formData.get("endAt") as string) ?? "",
            allDay: (formData.get("allDay") as string) ?? undefined,
            categories: formData.getAll("categories"),
            causes: formData.getAll("causes"),
            capacity: (formData.get("capacity") as string) ?? undefined,
        });
        if (!validated.success) {
            return {
                success: false,
                message: `Invalid input: ${validated.error.errors.map((e) => e.message).join(", ")}`,
            };
        }
        const data = validated.data;

        // Parse primitives
        const startAt = parseDate(data.startAt);
        const endAt = parseDate(data.endAt);
        const allDay = parseBool(data.allDay) ?? false;
        const isVirtual = parseBool(data.isVirtual);
        const isHybrid = parseBool(data.isHybrid);
        const virtualUrl = (data.virtualUrl || "").trim() || undefined;
        const capacity =
            typeof data.capacity === "string" && data.capacity.trim().length > 0 ? Number(data.capacity) : undefined;

        let locationData: EventModel["location"] = undefined;
        if (data.location) {
            locationData = JSON.parse(data.location);
        }

        // Handle images
        const imageFiles = (data.images || []).filter(isFile);
        let uploadedImages: Media[] = [];
        if (imageFiles.length > 0) {
            const uploadPromises = imageFiles.map(async (file) => {
                const prefix = `event_image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                return await saveFile(file, prefix, circle._id as string, true);
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

        // Build event payload
        const newEvent: Omit<EventModel, "_id" | "commentPostId"> = {
            circleId: circle._id!.toString(),
            createdBy: userDid,
            createdAt: new Date(),
            updatedAt: new Date(),
            title: data.title,
            description: data.description,
            images: uploadedImages,
            location: locationData,
            stage: "draft",
            userGroups: data.userGroups || [],
            isVirtual,
            virtualUrl,
            isHybrid,
            startAt,
            endAt,
            allDay,
            categories: (data.categories as string[])?.filter(Boolean),
            causes: (data.causes as string[])?.filter(Boolean),
            capacity,
        };

        // Create in DB (will also create shadow post if feed exists)
        const created = await createEventDb(newEvent, user);

        // Revalidate list
        revalidatePath(`/circles/${circleHandle}/events`);

        // Ensure module enabled on user's own circle
        try {
            if (circle.circleType === "user" && circle.did === userDid) {
                await ensureModuleIsEnabledOnCircle(circle._id as string, "events", userDid);
            }
        } catch (err) {
            console.error("Failed to ensure events module is enabled on user circle:", err);
        }

        return { success: true, message: "Event created successfully", eventId: created._id?.toString() };
    } catch (error) {
        console.error("Error creating event:", error);
        return { success: false, message: "Failed to create event" };
    }
}

/**
 * Update event
 */
export async function updateEventAction(
    circleHandle: string,
    eventId: string,
    formData: FormData,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const event = await getEventById(eventId, userDid);
        if (!event) return { success: false, message: "Event not found" };

        const isAuthor = userDid === event.createdBy;
        const canModerate = await isAuthorized(userDid, circle._id as string, features.events.moderate);
        const canEdit = isAuthor || canModerate;
        if (!canEdit) return { success: false, message: "Not authorized to update this event" };

        const validated = updateEventSchema.safeParse({
            title: formData.get("title"),
            description: formData.get("description"),
            images: formData.getAll("images"),
            location: formData.get("location") ?? undefined,
            userGroups: formData.getAll("userGroups"),
            isVirtual: (formData.get("isVirtual") as string) ?? undefined,
            isHybrid: (formData.get("isHybrid") as string) ?? undefined,
            virtualUrl: (formData.get("virtualUrl") as string) ?? undefined,
            startAt: (formData.get("startAt") as string) ?? event.startAt?.toString() ?? "",
            endAt: (formData.get("endAt") as string) ?? event.endAt?.toString() ?? "",
            allDay: (formData.get("allDay") as string) ?? undefined,
            categories: formData.getAll("categories"),
            causes: formData.getAll("causes"),
            capacity: (formData.get("capacity") as string) ?? undefined,
        });
        if (!validated.success) {
            return {
                success: false,
                message: `Invalid input: ${validated.error.errors.map((e) => e.message).join(", ")}`,
            };
        }
        const data = validated.data;

        let locationData: EventModel["location"] = event.location;
        if (data.location) {
            try {
                locationData = JSON.parse(data.location);
            } catch {
                /* already validated */
            }
        }

        // Reconcile images
        const existingImages = event.images || [];
        const submittedImageEntries = data.images || [];
        const newFiles = submittedImageEntries.filter(isFile);
        const existingMediaJsonStrings = submittedImageEntries.filter((e): e is string => typeof e === "string");

        let parsedExistingMedia: Media[] = [];
        try {
            parsedExistingMedia = existingMediaJsonStrings.map((s) => JSON.parse(s));
        } catch {
            return { success: false, message: "Failed to process existing image data." };
        }

        const remainingExistingUrls = new Set(parsedExistingMedia.map((m) => m?.fileInfo?.url));
        const toDelete = existingImages.filter((img) => !remainingExistingUrls.has(img.fileInfo.url));

        // Upload new
        let newlyUploaded: Media[] = [];
        if (newFiles.length > 0) {
            const uploadPromises = newFiles.map(async (file) => {
                const prefix = `event_image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                return await saveFile(file, prefix, circle._id as string, true);
            });
            const results = await Promise.all(uploadPromises);
            newlyUploaded = results.map(
                (r: StorageFileInfo): Media => ({
                    name: r.originalName || "Uploaded Image",
                    type: newFiles.find((f) => f.name === r.originalName)?.type || "application/octet-stream",
                    fileInfo: {
                        url: r.url,
                        fileName: r.fileName,
                        originalName: r.originalName,
                    },
                }),
            );
        }

        if (toDelete.length > 0) {
            await Promise.allSettled(toDelete.map((img) => deleteFile(img.fileInfo.url)));
        }

        const startAt = data.startAt ? parseDate(data.startAt) : event.startAt;
        const endAt = data.endAt ? parseDate(data.endAt) : event.endAt;

        const updateData: Partial<EventModel> = {
            title: data.title,
            description: data.description,
            images: [...parsedExistingMedia, ...newlyUploaded],
            location: locationData,
            userGroups: data.userGroups || event.userGroups,
            isVirtual: parseBool(data.isVirtual),
            isHybrid: parseBool(data.isHybrid),
            virtualUrl: (data.virtualUrl || "").trim() || undefined,
            allDay: parseBool(data.allDay) ?? event.allDay,
            startAt,
            endAt,
            categories: (data.categories as string[])?.filter(Boolean),
            causes: (data.causes as string[])?.filter(Boolean),
            capacity:
                typeof data.capacity === "string" && data.capacity.trim().length > 0
                    ? Number(data.capacity)
                    : undefined,
            updatedAt: new Date(),
        };

        const user = await getUserByDid(userDid);
        if (!user) return { success: false, message: "User not found" };

        const success = await updateEventDb(eventId, updateData, user);
        if (!success) return { success: false, message: "Failed to update event" };

        revalidatePath(`/circles/${circleHandle}/events`);
        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);
        return { success: true, message: "Event updated successfully" };
    } catch (error) {
        console.error("Error updating event:", error);
        return { success: false, message: "Failed to update event" };
    }
}

/**
 * Delete event
 */
export async function deleteEventAction(
    circleHandle: string,
    eventId: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const event = await getEventById(eventId, userDid);
        if (!event) return { success: false, message: "Event not found" };

        const isAuthor = userDid === event.createdBy;
        const canModerate = await isAuthorized(userDid, circle._id as string, features.events.moderate);
        if (!isAuthor && !canModerate) return { success: false, message: "Not authorized to delete this event" };

        // delete images
        if (event.images?.length) {
            await Promise.allSettled(event.images.map((img) => deleteFile(img.fileInfo.url)));
        }

        const success = await deleteEventDb(eventId);
        if (!success) return { success: false, message: "Failed to delete event" };

        revalidatePath(`/circles/${circleHandle}/events`);
        return { success: true, message: "Event deleted successfully" };
    } catch (error) {
        console.error("Error deleting event:", error);
        return { success: false, message: "Failed to delete event" };
    }
}

/**
 * Change event stage
 */
export async function changeEventStageAction(
    circleHandle: string,
    eventId: string,
    newStage: EventStage,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const event = await getEventById(eventId, userDid);
        if (!event) return { success: false, message: "Event not found" };

        const currentStage = event.stage;
        let allowed = false;

        const canReview = await isAuthorized(userDid, circle._id as string, features.events.review);
        const canModerate = await isAuthorized(userDid, circle._id as string, features.events.moderate);

        if (canModerate) {
            allowed = true;
        } else if (currentStage === "draft" && newStage === "review") {
            // Author can submit for review; reviewers can also move directly to review if needed
            allowed = userDid === event.createdBy || canReview;
        } else if ((currentStage === "draft" || currentStage === "review") && newStage === "open") {
            // Reviewers can open directly from draft, or after review
            allowed = canReview;
        } else if (currentStage === "open" && newStage === "cancelled") {
            // allow review or moderate to cancel
            allowed = canReview;
        }

        if (!allowed) {
            return { success: false, message: `Not authorized to move event from ${currentStage} to ${newStage}` };
        }

        const success = await changeEventStageDb(eventId, newStage);
        if (!success) return { success: false, message: "Failed to change event stage" };

        // Send notifications based on transition
        try {
            const actor = await getUserByDid(userDid);
            if (actor) {
                if (currentStage === "draft" && newStage === "review") {
                    await notifyEventSubmittedForReview(
                        { _id: event._id!, title: event.title, circleId: event.circleId },
                        actor,
                    );
                } else if ((currentStage === "draft" || currentStage === "review") && newStage === "open") {
                    await notifyEventApproved(
                        { _id: event._id!, title: event.title, circleId: event.circleId, createdBy: event.createdBy },
                        actor,
                    );
                } else {
                    await notifyEventStatusChanged(
                        {
                            _id: event._id!,
                            title: event.title,
                            circleId: event.circleId,
                            createdBy: event.createdBy,
                            stage: newStage,
                        },
                        actor,
                        currentStage,
                    );
                }
            }
        } catch (notifyErr) {
            console.error("Error sending event stage change notifications:", notifyErr);
        }

        revalidatePath(`/circles/${circleHandle}/events`);
        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);

        return { success: true, message: `Event stage changed to ${newStage}` };
    } catch (error) {
        console.error("Error changing event stage:", error);
        return { success: false, message: "Failed to change event stage" };
    }
}

/**
 * RSVP - going / interested / waitlist
 */
export async function rsvpEventAction(
    circleHandle: string,
    eventId: string,
    status: "going" | "interested" | "waitlist",
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const user = await getUserByDid(userDid);
        if (!user) return { success: false, message: "User not found" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const canRsvp = await isAuthorized(userDid, circle._id as string, features.events.rsvp);
        if (!canRsvp) return { success: false, message: "Not authorized to RSVP" };

        const ok = await upsertRsvp(eventId, circle._id!.toString(), userDid, status);
        if (!ok) return { success: false, message: "Failed to RSVP" };

        revalidatePath(`/circles/${circleHandle}/events`);
        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);
        return { success: true, message: "RSVP updated" };
    } catch (error) {
        console.error("Error RSVPing:", error);
        return { success: false, message: "Failed to RSVP" };
    }
}

/**
 * Cancel RSVP
 */
export async function cancelRsvpAction(
    circleHandle: string,
    eventId: string,
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const canRsvp = await isAuthorized(userDid, circle._id as string, features.events.rsvp);
        if (!canRsvp) return { success: false, message: "Not authorized to RSVP" };

        const ok = await cancelRsvp(eventId, userDid);
        if (!ok) return { success: false, message: "Failed to cancel RSVP" };

        revalidatePath(`/circles/${circleHandle}/events`);
        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);
        return { success: true, message: "RSVP cancelled" };
    } catch (error) {
        console.error("Error cancelling RSVP:", error);
        return { success: false, message: "Failed to cancel RSVP" };
    }
}

/**
 * Ensure shadow post exists for comments on an event (fallback).
 * Note: createEvent in data layer already attempts this. This is a utility for idempotency.
 */
export async function ensureShadowPostForEventAction(eventId: string, circleId: string): Promise<string | null> {
    try {
        if (!ObjectId.isValid(eventId) || !ObjectId.isValid(circleId)) {
            console.error("Invalid eventId or circleId provided to ensureShadowPostForEventAction");
            return null;
        }

        const event = await Events.findOne({ _id: new ObjectId(eventId) });
        if (!event) {
            console.error(`Event not found: ${eventId}`);
            return null;
        }
        if (event.commentPostId) return event.commentPostId;

        const feed = await Feeds.findOne({ circleId });
        if (!feed) {
            console.warn(`No feed found for circle ${circleId} to create shadow post for event ${eventId}.`);
            return null;
        }

        // defer to feed.createPost to ensure consistency
        const { createPost } = await import("@/lib/data/feed");
        const shadowPost = await createPost({
            feedId: feed._id.toString(),
            createdBy: event.createdBy,
            createdAt: new Date(),
            content: `Event: ${event.title}`,
            postType: "event",
            parentItemId: event._id.toString(),
            parentItemType: "event",
            userGroups: event.userGroups || [],
            comments: 0,
            reactions: {},
        });

        if (shadowPost && shadowPost._id) {
            const commentPostIdString = shadowPost._id.toString();
            const updateResult = await Events.updateOne(
                { _id: event._id },
                { $set: { commentPostId: commentPostIdString } },
            );
            if (updateResult.modifiedCount === 1) {
                return commentPostIdString;
            }
        }
        return null;
    } catch (error) {
        console.error(`Error in ensureShadowPostForEventAction for event ${eventId}:`, error);
        return null;
    }
}

/**
 * Invite users to an event
 */
export async function inviteUsersToEventAction(
    circleHandle: string,
    eventId: string,
    userDids: string[],
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const user = await getUserByDid(userDid);
        if (!user) return { success: false, message: "User not found" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const event = await getEventById(eventId, userDid);
        if (!event) return { success: false, message: "Event not found" };

        await inviteUsersToEvent(eventId, circle._id!.toString(), userDids, user);

        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);
        return { success: true, message: "Invitations sent" };
    } catch (error) {
        console.error("Error inviting users to event:", error);
        return { success: false, message: "Failed to send invitations" };
    }
}

/**
 * Get invited users for an event
 */
export async function getInvitedUsersAction(
    circleHandle: string,
    eventId: string,
): Promise<GetInvitedUsersActionResult> {
    const defaultResult: GetInvitedUsersActionResult = { users: [] };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return defaultResult;

        const event = await getEventById(eventId, userDid);
        if (!event || !event.invitations) return defaultResult;

        const users = await getCirclesByDids(event.invitations);
        return { users };
    } catch (error) {
        console.error("Error in getInvitedUsersAction:", error);
        return defaultResult;
    }
}

/**
 * Get circle members
 */
export async function getCircleMembersAction(circleHandle: string): Promise<GetCircleMembersActionResult> {
    const defaultResult: GetCircleMembersActionResult = { members: [] };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return defaultResult;

        const members = await getMembers(circle._id!.toString());
        const memberDids = members.map((m) => m.userDid);
        const users = await getCirclesByDids(memberDids);

        // Filter to only users who themselves have permission to view events in this circle
        const eligibilityChecks = await Promise.all(
            users.map((u) =>
                u.did ? isAuthorized(u.did, circle._id as string, features.events.view) : Promise.resolve(false),
            ),
        );
        const eligibleUsers = users.filter((_, idx) => eligibilityChecks[idx]);

        return { members: eligibleUsers };
    } catch (error) {
        console.error("Error in getCircleMembersAction:", error);
        return defaultResult;
    }
}

/**
/**
 * Add a comment to an event (via its shadow post)
 */
export async function addEventCommentAction(eventId: string, data: Partial<Comment>) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) throw new Error("Unauthorized");

    const user = await getUserByDid(userDid);
    if (!user) throw new Error("User not found");

    const event = await getEventById(eventId, userDid);
    if (!event) throw new Error("Event not found");

    if (!event.commentPostId) {
        throw new Error("Event has no comment post");
    }

    const canComment = await isAuthorized(userDid, event.circleId, features.feed.comment);
    if (!canComment) throw new Error("Not authorized to comment");

    return addCommentToDiscussion(event.commentPostId, {
        ...data,
        createdBy: userDid,
    });
}

/**
 * Get event with comments (via its shadow post)
 */
export async function getEventWithCommentsAction(eventId: string) {
    const event = await getEventById(eventId, (await getAuthenticatedUserDid()) || "");
    if (!event) throw new Error("Event not found");
    if (!event.commentPostId) return { ...event, comments: [] };

    const discussion = await getDiscussionWithComments(event.commentPostId);
    return { ...event, comments: discussion?.comments || [] };
}

/**
 * Get circles by search query
 */
export async function getCirclesBySearchQueryAction(
    query: string,
    limit: number = 10,
    circleType?: CircleType,
): Promise<GetCirclesBySearchQueryActionResult> {
    const defaultResult: GetCirclesBySearchQueryActionResult = { circles: [] };

    try {
        const circles = await getCirclesBySearchQuery(query, limit, circleType);
        return { circles };
    } catch (error) {
        console.error("Error in getCirclesBySearchQueryAction:", error);
        return defaultResult;
    }
}

/**
 * Search users and return only those eligible to view events in the circle (for invites).
 */
export async function searchEligibleUsersAction(
    circleHandle: string,
    query: string,
    limit: number = 10,
): Promise<GetCirclesBySearchQueryActionResult> {
    const defaultResult: GetCirclesBySearchQueryActionResult = { circles: [] };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        // Ensure current user can view events in this circle
        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return defaultResult;

        const { circles } = await getCirclesBySearchQueryAction(query, limit, "user");

        // Filter search results to only users who themselves have permission to view events in this circle
        const eligibilityChecks = await Promise.all(
            circles.map((c) =>
                c.did ? isAuthorized(c.did, circle._id as string, features.events.view) : Promise.resolve(false),
            ),
        );
        const eligible = circles.filter((_, idx) => eligibilityChecks[idx]);

        return { circles: eligible };
    } catch (error) {
        console.error("Error in searchEligibleUsersAction:", error);
        return defaultResult;
    }
}
