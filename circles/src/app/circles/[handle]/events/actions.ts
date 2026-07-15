// events/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { Feeds, Events, EventInvitations, EventRsvps, Members } from "@/lib/data/db";
import { createDefaultFeed, createPost, deletePost, getFeedByHandle, updatePost } from "@/lib/data/feed";
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
    eventVisibilitySchema,
    Post,
    TaskDisplay,
    postSchema,
} from "@/models/models";
import { getCircleByHandle, ensureModuleIsEnabledOnCircle, getCirclesBySearchQuery } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { getUserByDid, getUserPrivate, getPrivateUserByDid, updateUser, getUserByHandle } from "@/lib/data/user";
import { saveFile, deleteFile, FileInfo as StorageFileInfo, isFile } from "@/lib/data/storage";
import { features } from "@/lib/data/constants";
import { canParticipate, getParticipationRequiredMessage } from "@/lib/profile-completion";

// Data layer
import {
    getEventsByCircleId,
    getEventById,
    createEvent as createEventDb,
    updateEvent as updateEventDb,
    deleteEvent as deleteEventDb,
    changeEventStage as changeEventStageDb,
    canManageEvent,
    normalizeEventHostCircleIds,
} from "@/lib/data/event";
import { getCirclesByDids, getCirclesByIds } from "@/lib/data/circle";
import { upsertRsvp, cancelRsvp, listAttendees } from "@/lib/data/eventRsvp";
import { listAttendeesWithDetails } from "@/lib/data/eventRsvp";
import {
    notifyEventSubmittedForReview,
    notifyEventApproved,
    notifyEventStatusChanged,
} from "@/lib/data/eventNotifications";
import { inviteUsersToEvent } from "@/lib/data/event";
import { getMembers } from "@/lib/data/member";
import { addCommentToDiscussion, getDiscussionWithComments } from "@/lib/data/discussion";
import { Comment } from "@/models/models";
import { getTasksByEventId } from "@/lib/data/task";
import {
    listAcceptedConnectionsForUserDid,
    searchAcceptedConnectionsForUserDid,
} from "@/lib/data/relationships";
import {
    EXTERNAL_EVENT_INVITE_ERRORS,
    getExternalEventInviteProfileError,
    resolveExternalEventInviteHandle,
} from "@/lib/event-external-invite";
import { notifyEventInvitation } from "@/lib/data/notifications";

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

type InviteCandidateSource = "circle_member" | "contact";

type InviteCandidate = Circle & {
    inviteSources?: InviteCandidateSource[];
    inviteSourceLabel?: string;
};

type GetInviteCandidatesActionResult = {
    candidates: InviteCandidate[];
    canBulkInviteCircleMembers: boolean;
    circleMemberCount: number;
};

type GetCircleMemberInviteCandidatesActionResult = {
    candidates: InviteCandidate[];
    count: number;
    success: boolean;
    message?: string;
};

type ResolveExternalEventInviteActionResult = {
    success: boolean;
    message?: string;
    user?: Pick<Circle, "_id" | "did" | "name" | "handle" | "picture" | "circleType">;
};

type GetCirclesBySearchQueryActionResult = {
    circles: Circle[];
};

type GetEventHostCirclesActionResult = {
    circles: Circle[];
};

type GetTasksByEventActionResult = {
    tasks: TaskDisplay[];
};

type HideCancelledEventResult = {
    success: boolean;
    message?: string;
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
    visibility: eventVisibilitySchema.optional(),
    hostCircleIds: z.array(z.string()).optional(),
    recurrence: z
        .string()
        .optional()
        .refine(
            (val) => {
                if (!val) return true;
                try {
                    const parsed = JSON.parse(val);
                    return parsed.frequency && ["daily", "weekly", "monthly", "yearly"].includes(parsed.frequency);
                } catch {
                    return false;
                }
            },
            { message: "Invalid recurrence format" },
        ),
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

function normalizeRecurrenceEndDate(endDate?: Date): Date | undefined {
    if (!endDate) return undefined;
    if (
        endDate.getUTCHours() === 0 &&
        endDate.getUTCMinutes() === 0 &&
        endDate.getUTCSeconds() === 0 &&
        endDate.getUTCMilliseconds() === 0
    ) {
        const normalized = new Date(endDate);
        normalized.setUTCHours(23, 59, 59, 999);
        return normalized;
    }
    return endDate;
}

const shouldPublishToNoticeboard = (formData: FormData) => formData.get("publishToNoticeboard") === "true";

const uniqueStrings = (values: unknown[]) =>
    Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));

const parseHostCircleIds = (formData: FormData, primaryCircleId: string): string[] => {
    const rawValues = formData.getAll("hostCircleIds");
    const parsedValues = rawValues.flatMap((value) => {
        if (typeof value !== "string" || value.trim().length === 0) {
            return [];
        }
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [value];
        } catch {
            return [value];
        }
    });
    return uniqueStrings([primaryCircleId, ...parsedValues]);
};

const getHostCirclesByIds = async (hostCircleIds: string[]) => {
    const hostCircles = await getCirclesByIds(hostCircleIds.filter((id) => ObjectId.isValid(id)));
    const hostCircleById = new Map(hostCircles.map((hostCircle) => [hostCircle._id?.toString(), hostCircle]));
    return hostCircleIds
        .map((hostCircleId) => hostCircleById.get(hostCircleId))
        .filter((hostCircle): hostCircle is Circle => Boolean(hostCircle?._id));
};

const validateHostCirclePermissions = async (
    userDid: string,
    hostCircleIds: string[],
    requestedStage: "draft" | "open" | "preserve",
    existingEvent?: EventDisplay,
): Promise<{ success: true; hostCircles: Circle[] } | { success: false; message: string }> => {
    const hostCircles = await getHostCirclesByIds(hostCircleIds);
    if (hostCircles.length !== hostCircleIds.length) {
        return { success: false, message: "One or more host circles could not be found" };
    }

    const isExistingAuthor = existingEvent?.createdBy === userDid;
    const existingHostCircleIds = existingEvent ? normalizeEventHostCircleIds(existingEvent) : [];
    const checks = await Promise.all(
        hostCircles.map(async (hostCircle) => {
            const hostCircleId = hostCircle._id!.toString();
            const canCreate = await isAuthorized(userDid, hostCircleId, features.events.create);
            const canReview = await isAuthorized(userDid, hostCircleId, features.events.review);
            const canModerate = await isAuthorized(userDid, hostCircleId, features.events.moderate);
            const canManage = canReview || canModerate;
            return {
                canHost:
                    existingEvent && isExistingAuthor && existingHostCircleIds.includes(hostCircleId)
                        ? true
                        : canCreate || canManage,
                canPublish: requestedStage !== "open" || canManage,
            };
        }),
    );

    if (checks.some((check) => !check.canHost)) {
        return { success: false, message: "Not authorized to host events in one or more selected circles" };
    }
    if (checks.some((check) => !check.canPublish)) {
        return { success: false, message: "Not authorized to publish events in one or more selected circles" };
    }

    return { success: true, hostCircles };
};

const isRouteCircleEventHost = (circleId: string, event: Pick<EventModel, "circleId" | "hostCircleIds">) =>
    normalizeEventHostCircleIds(event).includes(circleId);

const hasEventHostManagementPermission = async (
    userDid: string,
    event: Pick<EventModel, "circleId" | "hostCircleIds">,
) => {
    const checks = await Promise.all(
        normalizeEventHostCircleIds(event).map(async (hostCircleId) => {
            const canReview = await isAuthorized(userDid, hostCircleId, features.events.review);
            if (canReview) {
                return true;
            }
            return isAuthorized(userDid, hostCircleId, features.events.moderate);
        }),
    );
    return checks.some(Boolean);
};

const revalidateEventHostPaths = (hostCircles: Circle[], eventId?: string) => {
    for (const hostCircle of hostCircles) {
        const handle = hostCircle.handle;
        if (!handle) continue;
        revalidatePath(`/circles/${handle}/events`);
        revalidatePath(`/circles/${handle}/feed`);
        if (eventId) {
            revalidatePath(`/circles/${handle}/events/${eventId}`);
        }
    }
};

const parseRequestedStage = (formData: FormData): "draft" | "open" | "preserve" => {
    const value = formData.get("submitStage");
    if (value === "preserve") return "preserve";
    return value === "open" ? "open" : "draft";
};

const getEventInternalPreviewUrl = (circleHandle: string, eventId: string) => {
    const baseUrl = (process.env.CIRCLES_URL || "http://localhost:3000").replace(/\/+$/, "");
    return `${baseUrl}/circles/${circleHandle}/events/${eventId}?source=noticeboard`;
};

const getInviteSourceLabel = (sources: InviteCandidateSource[] = []) => {
    const uniqueSources = Array.from(new Set(sources));
    if (uniqueSources.includes("circle_member") && uniqueSources.includes("contact")) {
        return "Circle member + Contact";
    }
    if (uniqueSources.includes("circle_member")) {
        return "Circle member";
    }
    if (uniqueSources.includes("contact")) {
        return "Contact";
    }
    return "Eligible";
};

const addInviteCandidate = (
    candidatesByDid: Map<string, InviteCandidate>,
    user: Circle,
    source: InviteCandidateSource,
) => {
    if (!user.did) return;
    const existing = candidatesByDid.get(user.did);
    const inviteSources = Array.from(new Set([...(existing?.inviteSources || []), source]));
    candidatesByDid.set(user.did, {
        ...(existing || user),
        ...user,
        inviteSources,
        inviteSourceLabel: getInviteSourceLabel(inviteSources),
    });
};

const candidateMatchesQuery = (candidate: Circle, query?: string) => {
    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return Boolean(
        candidate.name?.toLowerCase().includes(normalizedQuery) ||
            candidate.handle?.toLowerCase().includes(normalizedQuery),
    );
};

const getEligibleInviteCandidatesForCircle = async (
    circle: Circle,
    inviterDid: string,
    query?: string,
    limit: number = 100,
): Promise<InviteCandidate[]> => {
    const candidatesByDid = new Map<string, InviteCandidate>();

    if (circle.circleType === "user") {
        const contacts = query?.trim()
            ? await searchAcceptedConnectionsForUserDid(inviterDid, query, limit)
            : await listAcceptedConnectionsForUserDid(inviterDid);
        contacts.forEach((contact) => addInviteCandidate(candidatesByDid, contact, "contact"));
    } else {
        const memberUsers = await getEligibleCircleMemberInviteCandidates(circle, inviterDid);
        memberUsers.forEach((member) => addInviteCandidate(candidatesByDid, member, "circle_member"));

        const contacts = await listAcceptedConnectionsForUserDid(inviterDid);
        contacts.forEach((contact) => addInviteCandidate(candidatesByDid, contact, "contact"));
    }

    return Array.from(candidatesByDid.values())
        .filter((candidate) => candidate.did !== inviterDid)
        .filter((candidate) => candidateMatchesQuery(candidate, query))
        .sort((a, b) => (a.name || a.handle || "").localeCompare(b.name || b.handle || ""))
        .slice(0, limit);
};

const getEligibleCircleMemberInviteCandidates = async (
    circle: Circle,
    inviterDid: string,
): Promise<InviteCandidate[]> => {
    if (circle.circleType === "user") {
        return [];
    }

    const members = await getMembers(circle._id!.toString());
    const memberDids = members.map((m) => m.userDid);
    const memberUsers = await getCirclesByDids(memberDids);
    const eligibilityChecks = await Promise.all(
        memberUsers.map((u) =>
            u.did ? isAuthorized(u.did, circle._id as string, features.events.view) : Promise.resolve(false),
        ),
    );

    return memberUsers
        .filter((_, idx) => eligibilityChecks[idx])
        .filter((member) => member.did !== inviterDid)
        .map((member) => ({
            ...member,
            inviteSources: ["circle_member" as const],
            inviteSourceLabel: "Circle member",
        }))
        .sort((a, b) => (a.name || a.handle || "").localeCompare(b.name || b.handle || ""));
};

const buildEventNoticeboardPostContent = (event: Pick<EventModel, "description">) => {
    const description = event.description.trim();
    return description ? `Attend this event. ${description}` : "Attend this event.";
};

const upsertEventNoticeboardPost = async ({
    circle,
    circleHandle,
    event,
    noticeboardPostId,
}: {
    circle: Circle;
    circleHandle: string;
    event: Pick<EventModel, "_id" | "title" | "description" | "createdBy">;
    noticeboardPostId?: string;
}): Promise<string | null> => {
    if (!circle._id || !event._id) {
        return null;
    }

    let feed = await getFeedByHandle(circle._id.toString(), "default");
    if (!feed) {
        feed = await createDefaultFeed(circle._id.toString());
    }
    if (!feed?._id) {
        throw new Error("Noticeboard feed not found.");
    }

    const eventId = event._id.toString();
    const postData: Partial<Post> = {
        title: event.title,
        content: buildEventNoticeboardPostContent(event),
        feedId: feed._id.toString(),
        createdBy: event.createdBy,
        createdAt: new Date(),
        editedAt: new Date(),
        reactions: {},
        comments: 0,
        userGroups: ["admins", "moderators", "members"],
        postType: "post",
        internalPreviewType: "event",
        internalPreviewId: eventId,
        internalPreviewUrl: getEventInternalPreviewUrl(circleHandle, eventId),
    };

    if (noticeboardPostId) {
        try {
            await updatePost({
                _id: noticeboardPostId,
                title: postData.title,
                content: postData.content,
                editedAt: new Date(),
                userGroups: postData.userGroups,
                postType: postData.postType,
                internalPreviewType: postData.internalPreviewType,
                internalPreviewId: postData.internalPreviewId,
                internalPreviewUrl: postData.internalPreviewUrl,
            });
            return noticeboardPostId;
        } catch (error) {
            console.error("Failed to update linked noticeboard post for event:", error);
        }
    }

    const createdPost = await createPost(
        await postSchema.parseAsync({
            ...postData,
            createdAt: new Date(),
            editedAt: undefined,
        }),
    );
    return createdPost._id?.toString?.() ?? createdPost._id ?? null;
};

const upsertEventNoticeboardPosts = async ({
    hostCircles,
    event,
}: {
    hostCircles: Circle[];
    event: Pick<
        EventModel,
        "_id" | "title" | "description" | "createdBy" | "circleId" | "noticeboardPostId" | "noticeboardPostIdsByCircleId"
    >;
}) => {
    const nextPostIdsByCircleId = { ...(event.noticeboardPostIdsByCircleId || {}) };

    for (const hostCircle of hostCircles) {
        if (!hostCircle._id || !hostCircle.handle) continue;
        const hostCircleId = hostCircle._id.toString();
        const existingPostId =
            nextPostIdsByCircleId[hostCircleId] ||
            (hostCircleId === event.circleId ? event.noticeboardPostId : undefined);
        const noticeboardPostId = await upsertEventNoticeboardPost({
            circle: hostCircle,
            circleHandle: hostCircle.handle,
            event,
            noticeboardPostId: existingPostId,
        });
        if (noticeboardPostId) {
            nextPostIdsByCircleId[hostCircleId] = noticeboardPostId;
        }
    }

    return {
        noticeboardPostIdsByCircleId: nextPostIdsByCircleId,
        noticeboardPostId: nextPostIdsByCircleId[event.circleId],
    };
};

const removeEventNoticeboardPosts = async (
    eventOrNoticeboardPostId?: Pick<EventModel, "noticeboardPostId" | "noticeboardPostIdsByCircleId"> | string | null,
) => {
    if (!eventOrNoticeboardPostId) {
        return;
    }
    const noticeboardPostIds =
        typeof eventOrNoticeboardPostId === "string"
            ? [eventOrNoticeboardPostId]
            : [
                  eventOrNoticeboardPostId.noticeboardPostId,
                  ...Object.values(eventOrNoticeboardPostId.noticeboardPostIdsByCircleId || {}),
              ];

    const uniqueNoticeboardPostIds = uniqueStrings(noticeboardPostIds);
    try {
        await Promise.allSettled(uniqueNoticeboardPostIds.map((noticeboardPostId) => deletePost(noticeboardPostId)));
    } catch (error) {
        console.error("Failed to delete linked noticeboard posts for event:", error);
    }
};

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
        if (event && !isRouteCircleEventHost(circle._id!.toString(), event)) {
            return null;
        }
        return event;
    } catch (error) {
        console.error("Error in getEventAction:", error);
        return null;
    }
}

export async function getEventHostCirclesAction(): Promise<GetEventHostCirclesActionResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { circles: [] };

        const user = await getUserPrivate(userDid);
        if (!user) return { circles: [] };

        const memberships = await Members.find({ userDid }, { projection: { circleId: 1 } }).toArray();
        const memberCircles = await getCirclesByIds(
            memberships
                .map((membership) => membership.circleId)
                .filter((circleId): circleId is string => Boolean(circleId && circleId !== String(user._id))),
        );
        const candidateCircles = [user as Circle, ...memberCircles].filter(
            (circle, index, circles) =>
                circles.findIndex((candidate) => String(candidate._id) === String(circle._id)) === index,
        );

        const checks = await Promise.all(
            candidateCircles.map(async (candidateCircle) => {
                if (!candidateCircle._id || !candidateCircle.handle) return false;
                const circleId = candidateCircle._id.toString();
                if (candidateCircle.circleType === "user" && String(candidateCircle._id) === String(user._id)) return true;
                const canCreate = await isAuthorized(userDid, circleId, features.events.create);
                if (canCreate) return true;
                const canReview = await isAuthorized(userDid, circleId, features.events.review);
                if (canReview) return true;
                return isAuthorized(userDid, circleId, features.events.moderate);
            }),
        );

        const circles = candidateCircles
            .filter((_, index) => checks[index])
            .sort((a, b) => (a.name || a.handle || "").localeCompare(b.name || b.handle || ""));

        return { circles: JSON.parse(JSON.stringify(circles)) };
    } catch (error) {
        console.error("Error in getEventHostCirclesAction:", error);
        return { circles: [] };
    }
}

/**
 * Get tasks linked to an event
 */
export async function getTasksByEventAction(
    circleHandle: string,
    eventId: string,
): Promise<GetTasksByEventActionResult> {
    const defaultResult: GetTasksByEventActionResult = { tasks: [] };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        // Require permission to view events (mirrors event detail access)
        const canViewEvents = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canViewEvents) return defaultResult;

        const tasks = await getTasksByEventId(eventId, circle._id!.toString());
        return { tasks };
    } catch (error) {
        console.error("Error in getTasksByEventAction:", error);
        return defaultResult;
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

        const user = await getUserPrivate(userDid);
        if (!user) return { success: false, message: "User not found" };
        if (!canParticipate(user)) {
            return { success: false, message: getParticipationRequiredMessage("create events") };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const canCreate = await isAuthorized(userDid, circle._id as string, features.events.create);
        if (!canCreate) return { success: false, message: "Not authorized to create events" };
        const canPublish =
            (await isAuthorized(userDid, circle._id as string, features.events.review)) ||
            (await isAuthorized(userDid, circle._id as string, features.events.moderate));

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
            visibility: (formData.get("visibility") as string) ?? undefined,
            hostCircleIds: parseHostCircleIds(formData, circle._id!.toString()),
            recurrence: (formData.get("recurrence") as string) ?? undefined,
        });
        if (!validated.success) {
            return {
                success: false,
                message: `Invalid input: ${validated.error.errors.map((e) => e.message).join(", ")}`,
            };
        }
        const data = validated.data;
        const requestedStage = parseRequestedStage(formData);
        const hostCircleIds = uniqueStrings([circle._id!.toString(), ...(data.hostCircleIds || [])]);
        const hostValidation = await validateHostCirclePermissions(userDid, hostCircleIds, requestedStage);
        if (!hostValidation.success) {
            return { success: false, message: hostValidation.message };
        }
        const hostCircles = hostValidation.hostCircles;

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

        let recurrenceData: EventModel["recurrence"] = undefined;
        if (data.recurrence) {
            recurrenceData = JSON.parse(data.recurrence);
            if (recurrenceData?.endDate) {
                recurrenceData.endDate = normalizeRecurrenceEndDate(new Date(recurrenceData.endDate));
            }
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
            hostCircleIds,
            createdBy: userDid,
            createdAt: new Date(),
            updatedAt: new Date(),
            title: data.title,
            description: data.description,
            images: uploadedImages,
            location: locationData,
            stage: requestedStage === "open" && canPublish ? "open" : "draft",
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
            visibility: (data.visibility as any) ?? "public",
            recurrence: recurrenceData,
        };

        // Create in DB (will also create shadow post if feed exists)
        const created = await createEventDb(newEvent, user);

        // Ensure module enabled on user's own circle
        try {
            if (circle.circleType === "user" && circle.did === userDid) {
                await ensureModuleIsEnabledOnCircle(circle._id as string, "events", userDid);
            }
        } catch (err) {
            console.error("Failed to ensure events module is enabled on user circle:", err);
        }

        if (shouldPublishToNoticeboard(formData) && created.stage === "open") {
            try {
                const noticeboardPostIds = await upsertEventNoticeboardPosts({
                    hostCircles,
                    event: created,
                });
                await Events.updateOne({ _id: new ObjectId(created._id!.toString()) }, { $set: noticeboardPostIds });
            } catch (error) {
                console.error("Failed to create linked noticeboard post for event:", error);
                return {
                    success: true,
                    message: "Event created, but Noticeboard post could not be created.",
                    eventId: created._id?.toString(),
                };
            }
        }

        revalidateEventHostPaths(hostCircles, created._id?.toString());

        return {
            success: true,
            message: created.stage === "open" ? "Event published successfully" : "Event saved as draft",
            eventId: created._id?.toString(),
        };
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
        if (!isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { success: false, message: "This event is not hosted by this circle" };
        }

        const canEdit = await canManageEvent(userDid, event);
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
            visibility: (formData.get("visibility") as string) ?? undefined,
            hostCircleIds:
                formData.getAll("hostCircleIds").length > 0
                    ? parseHostCircleIds(formData, event.circleId)
                    : normalizeEventHostCircleIds(event),
            recurrence: (formData.get("recurrence") as string) ?? undefined,
        });
        if (!validated.success) {
            return {
                success: false,
                message: `Invalid input: ${validated.error.errors.map((e) => e.message).join(", ")}`,
            };
        }
        const data = validated.data;
        const requestedStage = parseRequestedStage(formData);
        const hostCircleIds = uniqueStrings([event.circleId, ...(data.hostCircleIds || normalizeEventHostCircleIds(event))]);
        const hostValidation = await validateHostCirclePermissions(userDid, hostCircleIds, requestedStage, event);
        if (!hostValidation.success) {
            return { success: false, message: hostValidation.message };
        }
        const hostCircles = hostValidation.hostCircles;

        let locationData: EventModel["location"] = event.location;
        if (data.location) {
            try {
                locationData = JSON.parse(data.location);
            } catch {
                /* already validated */
            }
        }

        let recurrenceData: EventModel["recurrence"] | null = event.recurrence ?? undefined;
        const rawRecurrence = formData.get("recurrence") as string | null;
        console.log(`[updateEventAction] Event ${eventId} - Raw Recurrence:`, rawRecurrence);

        if (rawRecurrence && rawRecurrence.trim() !== "") {
            try {
                recurrenceData = JSON.parse(rawRecurrence);
                if (recurrenceData?.endDate) {
                    recurrenceData.endDate = normalizeRecurrenceEndDate(new Date(recurrenceData.endDate));
                }
            } catch (e) {
                console.error("[updateEventAction] Failed to parse recurrence:", e);
            }
        } else if (rawRecurrence === "") {
            console.log("[updateEventAction] Clearing recurrence");
            recurrenceData = null; // Explicitly clear
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

        const nextStage =
            requestedStage === "preserve" ? event.stage : requestedStage === "open" ? "open" : "draft";

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
            visibility: (data.visibility as any) ?? event.visibility,
            hostCircleIds,
            recurrence: recurrenceData as any,
            stage: nextStage,
            updatedAt: new Date(),
        };

        const user = await getUserByDid(userDid);
        if (!user) return { success: false, message: "User not found" };

        const success = await updateEventDb(eventId, updateData, user);
        if (!success) return { success: false, message: "Failed to update event" };

        if (updateData.stage === "draft") {
            await removeEventNoticeboardPosts(event);
            if (event.noticeboardPostId || Object.keys(event.noticeboardPostIdsByCircleId || {}).length > 0) {
                await Events.updateOne(
                    { _id: new ObjectId(eventId) },
                    { $unset: { noticeboardPostId: "", noticeboardPostIdsByCircleId: "" } },
                );
            }
        } else if (shouldPublishToNoticeboard(formData)) {
            try {
                const removedHostPostIds = Object.entries(event.noticeboardPostIdsByCircleId || {})
                    .filter(([hostCircleId]) => !hostCircleIds.includes(hostCircleId))
                    .map(([, noticeboardPostId]) => noticeboardPostId);
                await removeEventNoticeboardPosts({
                    noticeboardPostIdsByCircleId: Object.fromEntries(
                        removedHostPostIds.map((noticeboardPostId) => [noticeboardPostId, noticeboardPostId]),
                    ),
                });

                const noticeboardPostIds = await upsertEventNoticeboardPosts({
                    hostCircles,
                    event: {
                        ...event,
                        ...updateData,
                        _id: eventId,
                        createdBy: event.createdBy,
                        noticeboardPostId: event.noticeboardPostId,
                        noticeboardPostIdsByCircleId: event.noticeboardPostIdsByCircleId,
                    },
                });
                await Events.updateOne({ _id: new ObjectId(eventId) }, { $set: noticeboardPostIds });
            } catch (error) {
                console.error("Failed to create linked noticeboard post for event:", error);
                return { success: true, message: "Event updated, but Noticeboard post could not be created." };
            }
        }

        revalidateEventHostPaths(hostCircles, eventId);
        return {
            success: true,
            message: updateData.stage === "open" ? "Event published successfully" : "Event saved as draft",
        };
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
        if (!isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { success: false, message: "This event is not hosted by this circle" };
        }

        if (!(await canManageEvent(userDid, event))) {
            return { success: false, message: "Not authorized to delete this event" };
        }

        // delete images
        if (event.images?.length) {
            await Promise.allSettled(event.images.map((img) => deleteFile(img.fileInfo.url)));
        }

        await removeEventNoticeboardPosts(event);

        const success = await deleteEventDb(eventId);
        if (!success) return { success: false, message: "Failed to delete event" };

        revalidateEventHostPaths(await getHostCirclesByIds(normalizeEventHostCircleIds(event)), eventId);
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
        if (!isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { success: false, message: "This event is not hosted by this circle" };
        }

        const currentStage = event.stage;
        let allowed = false;

        const hostCircleIds = normalizeEventHostCircleIds(event);
        const hostCircles = await getHostCirclesByIds(hostCircleIds);
        const isAuthor = userDid === event.createdBy;
        const canHostManage = await hasEventHostManagementPermission(userDid, event);

        if (canHostManage) {
            allowed = true;
        } else if (currentStage === "draft" && newStage === "review") {
            // Author can submit for review; reviewers can also move directly to review if needed
            allowed = isAuthor;
        } else if (
            (currentStage === "review" || currentStage === "open" || currentStage === "cancelled") &&
            newStage === "draft"
        ) {
            allowed = isAuthor;
        } else if ((currentStage === "draft" || currentStage === "review") && newStage === "open") {
            // Reviewers can open directly from draft, or after review
            allowed = canHostManage;
        } else if (currentStage === "open" && newStage === "cancelled") {
            // allow review or moderate to cancel
            allowed = canHostManage;
        }

        if (!allowed) {
            return { success: false, message: `Not authorized to move event from ${currentStage} to ${newStage}` };
        }

        let success = false;
        if (currentStage === "open" && newStage === "cancelled") {
            const activeRsvpCount = await EventRsvps.countDocuments({
                eventId,
                status: { $in: ["going", "interested", "waitlist"] },
            });

            if (activeRsvpCount === 0) {
                await removeEventNoticeboardPosts(event);
                success = await deleteEventDb(eventId);
                if (!success) return { success: false, message: "Failed to withdraw event" };

                revalidateEventHostPaths(hostCircles, eventId);
                return { success: true, message: "Event withdrawn" };
            }
        }

        success = await changeEventStageDb(eventId, newStage);
        if (!success) return { success: false, message: "Failed to change event stage" };

        if (newStage === "draft") {
            await removeEventNoticeboardPosts(event);
            if (event.noticeboardPostId || Object.keys(event.noticeboardPostIdsByCircleId || {}).length > 0) {
                await Events.updateOne(
                    { _id: new ObjectId(eventId) },
                    { $unset: { noticeboardPostId: "", noticeboardPostIdsByCircleId: "" } },
                );
            }
        }

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

        revalidateEventHostPaths(hostCircles, eventId);

        return {
            success: true,
            message:
                newStage === "draft"
                    ? "Event reverted to draft"
                    : newStage === "open"
                      ? "Event published"
                      : `Event stage changed to ${newStage}`,
        };
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

        const user = await getUserPrivate(userDid);
        if (!user) return { success: false, message: "User not found" };
        if (!canParticipate(user)) {
            return { success: false, message: getParticipationRequiredMessage("RSVP to events") };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const canRsvp = await isAuthorized(userDid, circle._id as string, features.events.rsvp);
        if (!canRsvp) return { success: false, message: "Not authorized to RSVP" };

        const event = await getEventById(eventId, userDid);
        if (!event || !isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { success: false, message: "Event not found" };
        }

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

        const event = await getEventById(eventId, userDid);
        if (!event || !isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { success: false, message: "Event not found" };
        }

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
        if (!isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { success: false, message: "This event is not hosted by this circle" };
        }
        if (!(await canManageEvent(userDid, event))) {
            return { success: false, message: "Not authorized to invite users to this event" };
        }

        await inviteUsersToEvent(eventId, circle._id!.toString(), userDids, user);

        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);
        return { success: true, message: "Invitations sent" };
    } catch (error) {
        console.error("Error inviting users to event:", error);
        return { success: false, message: "Failed to send invitations" };
    }
}

async function resolveExternalInviteTarget(
    circleHandle: string,
    eventId: string,
    input: string,
): Promise<
    | {
          success: true;
          userDid: string;
          inviter: Circle;
          target: Circle;
          event: EventDisplay;
          circle: Circle;
      }
    | { success: false; message: string }
> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "User not authenticated" };
    }

    const inviter = await getUserByDid(userDid);
    if (!inviter) {
        return { success: false, message: "User not found" };
    }

    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        return { success: false, message: "Circle not found" };
    }

    const event = await getEventById(eventId, userDid);
    if (!event || !isRouteCircleEventHost(circle._id!.toString(), event)) {
        return { success: false, message: "Event not found" };
    }

    if (!(await canManageEvent(userDid, event))) {
        return { success: false, message: EXTERNAL_EVENT_INVITE_ERRORS.unauthorized };
    }

    const handle = resolveExternalEventInviteHandle(input);
    if (!handle) {
        return { success: false, message: EXTERNAL_EVENT_INVITE_ERRORS.notFound };
    }

    const target = await getUserByHandle(handle);
    if (!target) {
        return { success: false, message: EXTERNAL_EVENT_INVITE_ERRORS.notFound };
    }

    const targetDid = target.did;
    if (!targetDid) {
        return { success: false, message: EXTERNAL_EVENT_INVITE_ERRORS.cannotInvite };
    }

    const [existingInvitation, existingRsvp] = await Promise.all([
        EventInvitations.findOne({ eventId, userDid: targetDid }, { projection: { _id: 1 } }),
        EventRsvps.findOne(
            { eventId, userDid: targetDid, status: { $ne: "cancelled" } },
            { projection: { _id: 1 } },
        ),
    ]);

    const profileError = getExternalEventInviteProfileError({
        target,
        inviterDid: userDid,
        alreadyInvited: Boolean(existingInvitation),
        alreadyAttending: Boolean(existingRsvp),
    });
    if (profileError) {
        return { success: false, message: profileError };
    }

    return { success: true, userDid, inviter, target, event, circle };
}

export async function resolveExternalEventInviteAction(
    circleHandle: string,
    eventId: string,
    input: string,
): Promise<ResolveExternalEventInviteActionResult> {
    try {
        const resolved = await resolveExternalInviteTarget(circleHandle, eventId, input);
        if (!resolved.success) {
            return resolved;
        }

        return {
            success: true,
            user: {
                _id: resolved.target._id?.toString(),
                did: resolved.target.did,
                name: resolved.target.name,
                handle: resolved.target.handle,
                picture: resolved.target.picture,
                circleType: resolved.target.circleType,
            },
        };
    } catch (error) {
        console.error("Error resolving external event invite:", error);
        return { success: false, message: EXTERNAL_EVENT_INVITE_ERRORS.notFound };
    }
}

export async function inviteExternalUserToEventAction(
    circleHandle: string,
    eventId: string,
    input: string,
): Promise<{ success: boolean; message?: string; user?: Circle }> {
    try {
        const resolved = await resolveExternalInviteTarget(circleHandle, eventId, input);
        if (!resolved.success) {
            return resolved;
        }

        const now = new Date();
        const insertResult = await EventInvitations.updateOne(
            { eventId, userDid: resolved.target.did },
            {
                $setOnInsert: {
                    eventId,
                    circleId: resolved.circle._id!.toString(),
                    userDid: resolved.target.did!,
                    status: "pending",
                    createdAt: now,
                    updatedAt: now,
                },
            },
            { upsert: true },
        );

        if (insertResult.upsertedCount === 0) {
            return { success: false, message: EXTERNAL_EVENT_INVITE_ERRORS.duplicate };
        }

        const invitedUser = await getUserPrivate(resolved.target.did!);
        await notifyEventInvitation(resolved.event, resolved.inviter, invitedUser);

        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);
        return { success: true, message: "Invitation sent", user: resolved.target };
    } catch (error) {
        console.error("Error inviting external user to event:", error);
        return { success: false, message: "Failed to send invitation" };
    }
}

type GetAttendeesActionResult = {
    users: Circle[];
};

export async function getAttendeesAction(circleHandle: string, eventId: string): Promise<GetAttendeesActionResult> {
    const defaultResult: GetAttendeesActionResult = { users: [] };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return defaultResult;

        const users = await listAttendees(eventId, "going");
        return { users };
    } catch (error) {
        console.error("Error in getAttendeesAction:", error);
        return defaultResult;
    }
}

type GetAttendeesWithDetailsActionResult = {
    attendees: { user: Circle; message?: string }[];
};

export async function getAttendeesWithDetailsAction(
    circleHandle: string,
    eventId: string,
): Promise<GetAttendeesWithDetailsActionResult> {
    const defaultResult: GetAttendeesWithDetailsActionResult = { attendees: [] };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return defaultResult;

        const attendees = await listAttendeesWithDetails(eventId, "going");
        return { attendees };
    } catch (error) {
        console.error("Error in getAttendeesWithDetailsAction:", error);
        return defaultResult;
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

        // Invitations are stored in EventInvitations collection (not on the event document)
        const invitations = await EventInvitations.find({ eventId }).toArray();
        const invitedDids = Array.from(new Set(invitations.map((inv: any) => inv.userDid).filter(Boolean)));
        if (invitedDids.length === 0) return defaultResult;

        const users = await getCirclesByDids(invitedDids);
        return { users };
    } catch (error) {
        console.error("Error in getInvitedUsersAction:", error);
        return defaultResult;
    }
}

/**
 * RSVP with options (isPublic + message)
 */
export async function rsvpEventWithOptionsAction(
    circleHandle: string,
    eventId: string,
    status: "going" | "interested" | "waitlist",
    options?: { isPublic?: boolean; message?: string },
): Promise<{ success: boolean; message?: string }> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { success: false, message: "User not authenticated" };

        const user = await getUserPrivate(userDid);
        if (!user) return { success: false, message: "User not found" };
        if (!canParticipate(user)) {
            return { success: false, message: getParticipationRequiredMessage("RSVP to events") };
        }

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { success: false, message: "Circle not found" };

        const canRsvp = await isAuthorized(userDid, circle._id as string, features.events.rsvp);
        if (!canRsvp) return { success: false, message: "Not authorized to RSVP" };

        const event = await getEventById(eventId, userDid);
        if (!event || !isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { success: false, message: "Event not found" };
        }

        const ok = await upsertRsvp(
            eventId,
            circle._id!.toString(),
            userDid,
            status,
            undefined,
            options?.isPublic,
            options?.message,
        );
        if (!ok) return { success: false, message: "Failed to RSVP" };

        revalidatePath(`/circles/${circleHandle}/events`);
        revalidatePath(`/circles/${circleHandle}/events/${eventId}`);
        return { success: true, message: "RSVP updated" };
    } catch (error) {
        console.error("Error RSVPing with options:", error);
        return { success: false, message: "Failed to RSVP" };
    }
}

/**
 * Cancel RSVP
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

        const members = await getEligibleInviteCandidatesForCircle(circle, userDid);
        return { members };
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

        const circles = await getEligibleInviteCandidatesForCircle(circle, userDid, query, limit);
        return { circles };
    } catch (error) {
        console.error("Error in searchEligibleUsersAction:", error);
        return defaultResult;
    }
}

export async function getEventInviteCandidatesAction(
    circleHandle: string,
    eventId: string,
    query: string = "",
    limit: number = 100,
): Promise<GetInviteCandidatesActionResult> {
    const defaultResult: GetInviteCandidatesActionResult = {
        candidates: [],
        canBulkInviteCircleMembers: false,
        circleMemberCount: 0,
    };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return defaultResult;

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return defaultResult;

        const event = await getEventById(eventId, userDid);
        if (!event || !isRouteCircleEventHost(circle._id!.toString(), event)) {
            return defaultResult;
        }

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return defaultResult;

        const [candidates, circleMemberCandidates] = await Promise.all([
            getEligibleInviteCandidatesForCircle(circle, userDid, query, limit),
            getEligibleCircleMemberInviteCandidates(circle, userDid),
        ]);
        const canBulkInviteCircleMembers = await canManageEvent(userDid, event);

        return {
            candidates,
            canBulkInviteCircleMembers,
            circleMemberCount: circleMemberCandidates.length,
        };
    } catch (error) {
        console.error("Error in getEventInviteCandidatesAction:", error);
        return defaultResult;
    }
}

export async function getEventCircleMemberInviteCandidatesAction(
    circleHandle: string,
    eventId: string,
): Promise<GetCircleMemberInviteCandidatesActionResult> {
    const defaultResult: GetCircleMemberInviteCandidatesActionResult = {
        candidates: [],
        count: 0,
        success: false,
    };

    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) return { ...defaultResult, message: "User not authenticated" };

        const circle = await getCircleByHandle(circleHandle);
        if (!circle) return { ...defaultResult, message: "Circle not found" };

        const event = await getEventById(eventId, userDid);
        if (!event || !isRouteCircleEventHost(circle._id!.toString(), event)) {
            return { ...defaultResult, message: "Event not found" };
        }

        const canView = await isAuthorized(userDid, circle._id as string, features.events.view);
        if (!canView) return { ...defaultResult, message: "Not authorized to view this event" };

        const canBulkInviteCircleMembers = await canManageEvent(userDid, event);
        if (!canBulkInviteCircleMembers) {
            return { ...defaultResult, message: "Not authorized to invite users to this event" };
        }

        const candidates = await getEligibleCircleMemberInviteCandidates(circle, userDid);
        return {
            candidates,
            count: candidates.length,
            success: true,
        };
    } catch (error) {
        console.error("Error in getEventCircleMemberInviteCandidatesAction:", error);
        return { ...defaultResult, message: "Failed to load circle members" };
    }
}

/**
 * Hide a cancelled event from the current user's timelines and calendars.
 */
export async function hideCancelledEventAction(
    circleHandle: string,
    eventId: string,
): Promise<HideCancelledEventResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "Not authenticated" };
        }

        if (!ObjectId.isValid(eventId)) {
            return { success: false, message: "Invalid event ID" };
        }

        const [event, user] = await Promise.all([getEventById(eventId, userDid), getPrivateUserByDid(userDid)]);

        if (!event) {
            return { success: false, message: "Event not found" };
        }
        const routeCircle = await getCircleByHandle(circleHandle);
        if (!routeCircle || !routeCircle._id || !isRouteCircleEventHost(routeCircle._id.toString(), event)) {
            return { success: false, message: "Event does not belong to this circle" };
        }

        if (!user || !user._id) {
            return { success: false, message: "User not found" };
        }

        const canView = await isAuthorized(userDid, routeCircle._id.toString(), features.events.view);
        if (!canView) {
            return { success: false, message: "Not authorized" };
        }

        if (event.stage !== "cancelled") {
            return { success: false, message: "Only cancelled events can be hidden" };
        }

        const hidden = user.hiddenCancelledEventIds || [];
        if (hidden.includes(eventId)) {
            return { success: true, message: "Event already hidden" };
        }

        const updatedHidden = [...hidden, eventId];
        await updateUser({ _id: user._id, hiddenCancelledEventIds: updatedHidden }, userDid);

        return { success: true };
    } catch (error) {
        console.error("Error in hideCancelledEventAction:", error);
        return { success: false, message: "Failed to hide event" };
    }
}

/**
 * Remove a cancelled event from the user's hidden list.
 */
export async function unhideCancelledEventAction(
    circleHandle: string,
    eventId: string,
): Promise<HideCancelledEventResult> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return { success: false, message: "Not authenticated" };
        }

        if (!ObjectId.isValid(eventId)) {
            return { success: false, message: "Invalid event ID" };
        }

        const [event, user] = await Promise.all([getEventById(eventId, userDid), getPrivateUserByDid(userDid)]);

        if (!event) {
            return { success: false, message: "Event not found" };
        }
        const routeCircle = await getCircleByHandle(circleHandle);
        if (!routeCircle || !routeCircle._id || !isRouteCircleEventHost(routeCircle._id.toString(), event)) {
            return { success: false, message: "Event does not belong to this circle" };
        }

        if (!user || !user._id) {
            return { success: false, message: "User not found" };
        }

        const canView = await isAuthorized(userDid, routeCircle._id.toString(), features.events.view);
        if (!canView) {
            return { success: false, message: "Not authorized" };
        }

        const hidden = user.hiddenCancelledEventIds || [];
        if (!hidden.includes(eventId)) {
            return { success: true, message: "Event is not hidden" };
        }

        const updatedHidden = hidden.filter((id) => id !== eventId);
        await updateUser({ _id: user._id, hiddenCancelledEventIds: updatedHidden }, userDid);

        return { success: true };
    } catch (error) {
        console.error("Error in unhideCancelledEventAction:", error);
        return { success: false, message: "Failed to unhide event" };
    }
}
