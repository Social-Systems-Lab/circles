import { Circles, Events, EventRsvps, Feeds, Posts, EventInvitations } from "./db";
import { ObjectId } from "mongodb";
import { Event, EventDisplay, EventStage, EventRsvp, Circle, Post, Media, EventInvitation } from "@/models/models";
import { SAFE_CIRCLE_PROJECTION } from "./circle";
import { createPost } from "./feed";
import { upsertVbdEvents } from "./vdb";
import { notifyEventInvitation } from "./notifications";
import { getUserPrivate } from "./user";
import { isAuthorized } from "../auth/auth";
import { features } from "./constants";

// Safe projection for event queries
export const SAFE_EVENT_PROJECTION = {
    _id: 1,
    circleId: 1,
    createdBy: 1,
    createdAt: 1,
    updatedAt: 1,
    title: 1,
    description: 1,
    stage: 1,
    userGroups: 1,
    location: 1,
    commentPostId: 1,
    images: 1,
    isVirtual: 1,
    virtualUrl: 1,
    isHybrid: 1,
    startAt: 1,
    endAt: 1,
    allDay: 1,
    categories: 1,
    causes: 1,
    capacity: 1,
    visibility: 1,
    invitations: 1,
} as const;

type Range = { from?: Date; to?: Date };

/**
 * Build $match for optional date range. Includes events that overlap the range window.
 */
function buildRangeMatch(range?: Range) {
    if (!range || (!range.from && !range.to)) return {};
    const clauses: any[] = [];
    if (range.from) {
        // event ends at/after from
        clauses.push({ endAt: { $gte: range.from } });
    }
    if (range.to) {
        // event starts at/before to
        clauses.push({ startAt: { $lte: range.to } });
    }
    return clauses.length ? { $and: clauses } : {};
}

/**
 * Get all events for a circle (optionally within a time range),
 * including author, circle, user RSVP status and 'going' count.
 */
export const getEventsByCircleId = async (
    circleId: string,
    userDid: string,
    range?: Range,
    includeCreated?: boolean,
    includeParticipating?: boolean,
): Promise<EventDisplay[]> => {
    try {
        const dateMatch = buildRangeMatch(range);
        const circle = await Circles.findOne({ _id: new ObjectId(circleId) });
        const matchQuery: any = {
            circleId,
            ...(dateMatch as Record<string, unknown>),
        };

        let hiddenCancelledObjectIds: ObjectId[] = [];
        try {
            const viewer = await getUserPrivate(userDid);
            const hiddenIds = (viewer?.hiddenCancelledEventIds || []) as string[];
            hiddenCancelledObjectIds = hiddenIds
                .filter((id) => ObjectId.isValid(id))
                .map((id) => new ObjectId(id));
        } catch (err) {
            hiddenCancelledObjectIds = [];
        }

        if (circle && circle.circleType === "user" && circle.did === userDid) {
            const userQueries = [];
            if (includeCreated) {
                userQueries.push({ createdBy: userDid });
            }
            if (includeParticipating) {
                const rsvps = await EventRsvps.find({ userDid, status: "going" }).toArray();
                const eventIds = rsvps.map((rsvp) => new ObjectId(rsvp.eventId));
                userQueries.push({ _id: { $in: eventIds } });
            }

            if (userQueries.length > 0) {
                matchQuery.$or = [{ circleId }, ...userQueries];
                delete matchQuery.circleId;
            }
        }

        const hideCancelledMatchStage =
            hiddenCancelledObjectIds.length > 0
                ? [
                      {
                          $match: {
                              $or: [{ stage: { $ne: "cancelled" } }, { _id: { $nin: hiddenCancelledObjectIds } }],
                          },
                      },
                  ]
                : [];

        const events = (await Events.aggregate([
            // 1) Match circle and optional date overlap
            {
                $match: matchQuery,
            },
            ...hideCancelledMatchStage,

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

            // 3) Lookup circle details
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
                                enabledModules: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // 4) RSVP counts (going)
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$eventId", "$$eId"] },
                            },
                        },
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    as: "rsvpCounts",
                },
            },

            // 5) Current user's RSVP
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userRsvpDocs",
                },
            },

            // 6) Current user's invitation
            {
                $lookup: {
                    from: "eventInvitations",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userInvDocs",
                },
            },

            // 7) Visibility gating
            {
                $match: {
                    $expr: {
                        $or: [
                            { $ne: ["$visibility", "private"] }, // default/undefined treated as public
                            { $eq: ["$createdBy", userDid] },
                            { $gt: [{ $size: "$userRsvpDocs" }, 0] },
                            { $gt: [{ $size: "$userInvDocs" }, 0] },
                        ],
                    },
                },
            },

            // 8) Final projection
            {
                $project: {
                    ...SAFE_EVENT_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    circle: "$circleDetails",
                    attendees: {
                        $let: {
                            vars: {
                                goingObj: {
                                    $first: {
                                        $filter: {
                                            input: "$rsvpCounts",
                                            as: "rc",
                                            cond: { $eq: ["$$rc._id", "going"] },
                                        },
                                    },
                                },
                            },
                            in: { $ifNull: ["$$goingObj.count", 0] },
                        },
                    },
                    userRsvpStatus: {
                        $let: {
                            vars: { firstRsvp: { $first: "$userRsvpDocs" } },
                            in: {
                                $ifNull: ["$$firstRsvp.status", "none"],
                            },
                        },
                    },
                },
            },

            // 7) Sort by soonest start date
            { $sort: { startAt: 1 } },
        ]).toArray()) as EventDisplay[];

        return events;
    } catch (error) {
        console.error("Error getting events by circle ID:", error);
        throw error;
    }
};

/**
 * Get a single event by ID with author, circle and RSVP info.
 */
export const getEventById = async (eventId: string, userDid: string): Promise<EventDisplay | null> => {
    try {
        if (!ObjectId.isValid(eventId)) {
            return null;
        }

        const events = (await Events.aggregate([
            { $match: { _id: new ObjectId(eventId) } },

            // Author
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

            // Circle
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
                                enabledModules: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // RSVP counts
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$eventId", "$$eId"] },
                            },
                        },
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    as: "rsvpCounts",
                },
            },

            // user RSVP
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userRsvpDocs",
                },
            },

            // Current user's invitation
            {
                $lookup: {
                    from: "eventInvitations",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userInvDocs",
                },
            },

            // Visibility gating
            {
                $match: {
                    $expr: {
                        $or: [
                            { $ne: ["$visibility", "private"] },
                            { $eq: ["$createdBy", userDid] },
                            { $gt: [{ $size: "$userRsvpDocs" }, 0] },
                            { $gt: [{ $size: "$userInvDocs" }, 0] },
                        ],
                    },
                },
            },

            // Final
            {
                $project: {
                    ...SAFE_EVENT_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    circle: "$circleDetails",
                    attendees: {
                        $let: {
                            vars: {
                                goingObj: {
                                    $first: {
                                        $filter: {
                                            input: "$rsvpCounts",
                                            as: "rc",
                                            cond: { $eq: ["$$rc._id", "going"] },
                                        },
                                    },
                                },
                            },
                            in: { $ifNull: ["$$goingObj.count", 0] },
                        },
                    },
                    userRsvpStatus: {
                        $let: {
                            vars: { firstRsvp: { $first: "$userRsvpDocs" } },
                            in: {
                                $ifNull: ["$$firstRsvp.status", "none"],
                            },
                        },
                    },
                },
            },
        ]).toArray()) as EventDisplay[];

        return events.length > 0 ? events[0] : null;
    } catch (error) {
        console.error(`Error getting event by ID (${eventId}):`, error);
        throw error;
    }
};

/**
 * Create a new event and shadow post for comments (if a feed exists).
 * Returns the created event (with commentPostId if created).
 */
/**
 * Invite users to an event, create invitation records, and send notifications.
 */
export const inviteUsersToEvent = async (
    eventId: string,
    circleId: string,
    userDids: string[],
    inviter: Circle,
): Promise<void> => {
    if (!userDids || userDids.length === 0) {
        return;
    }

    const existingInvitations = await EventInvitations.find({ eventId, userDid: { $in: userDids } }).toArray();
    const existingUserDids = new Set(existingInvitations.map((inv) => inv.userDid));
    const newUserDids = userDids.filter((did) => !existingUserDids.has(did));

    if (newUserDids.length === 0) {
        return;
    }

    // Only invite users who are permitted to view events in this circle
    const permissionChecks = await Promise.all(
        newUserDids.map((did) => isAuthorized(did, circleId, features.events.view)),
    );
    const targetUserDids = newUserDids.filter((_, idx) => permissionChecks[idx]);

    if (targetUserDids.length === 0) {
        return;
    }

    const now = new Date();
    const invitations: Omit<EventInvitation, "_id">[] = targetUserDids.map((userDid) => ({
        eventId,
        circleId,
        userDid,
        status: "pending",
        createdAt: now,
        updatedAt: now,
    }));

    await EventInvitations.insertMany(invitations);

    const event = await getEventById(eventId, inviter.did!);
    if (!event) {
        console.error(`Event not found for invitation: ${eventId}`);
        return;
    }

    // Send notifications
    for (const userDid of targetUserDids) {
        const user = await getUserPrivate(userDid);
        if (user) {
            await notifyEventInvitation(event, inviter, user);
        }
    }
};

export const createEvent = async (data: Omit<Event, "_id" | "commentPostId">, inviter: Circle): Promise<Event> => {
    const eventToInsert = {
        ...data,
        createdAt: data.createdAt || new Date(),
        updatedAt: new Date(),
    };
    const result = await Events.insertOne(eventToInsert);
    if (!result.insertedId) {
        throw new Error("Failed to insert event into database.");
    }

    const createdEventId = result.insertedId;
    let createdEvent = (await Events.findOne({
        _id: createdEventId,
    })) as Event | null;

    if (!createdEvent) {
        throw new Error("Failed to retrieve created event after insertion.");
    }

    // Create shadow post for comments (if feed exists)
    try {
        const feed = await Feeds.findOne({ circleId: data.circleId });
        if (feed) {
            const shadowPostData: Omit<Post, "_id"> = {
                feedId: feed._id.toString(),
                createdBy: data.createdBy,
                createdAt: new Date(),
                content: `Event: ${data.title}`,
                postType: "event",
                parentItemId: createdEventId.toString(),
                parentItemType: "event",
                userGroups: data.userGroups || [],
                comments: 0,
                reactions: {},
            };

            const shadowPost = await createPost(shadowPostData);

            if (shadowPost && shadowPost._id) {
                const commentPostIdString = shadowPost._id.toString();
                const updateResult = await Events.updateOne(
                    { _id: createdEventId },
                    { $set: { commentPostId: commentPostIdString } },
                );
                if (updateResult.modifiedCount === 1) {
                    createdEvent.commentPostId = commentPostIdString;
                    console.log(`Shadow post ${commentPostIdString} created and linked to event ${createdEventId}`);
                } else {
                    console.error(`Failed to link shadow post ${commentPostIdString} to event ${createdEventId}`);
                }
            } else {
                console.error(`Failed to create shadow post for event ${createdEventId}`);
            }
        } else {
            console.warn(
                `No feed found for circle ${data.circleId} to create shadow post for event ${createdEventId}.`,
            );
        }
    } catch (postError) {
        console.error(`Error creating/linking shadow post for event ${createdEventId}:`, postError);
    }

    // Upsert into vector DB
    try {
        await upsertVbdEvents([createdEvent as Event]);
    } catch (e) {
        console.error("Error upserting event to VDB:", e);
    }

    // Handle invitations
    if (createdEvent.invitations && createdEvent.invitations.length > 0) {
        await inviteUsersToEvent(createdEvent._id.toString(), createdEvent.circleId, createdEvent.invitations, inviter);
    }

    return createdEvent as Event;
};

/**
 * Update an event
 */
export const updateEvent = async (eventId: string, updates: Partial<Event>, inviter: Circle): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(eventId)) {
            console.error("Invalid eventId provided for update:", eventId);
            return false;
        }

        const existingEvent = await Events.findOne({ _id: new ObjectId(eventId) });
        if (!existingEvent) {
            return false;
        }

        const updateData: any = { ...updates, updatedAt: new Date() };
        delete updateData._id;

        const updateOp: any = {};
        if (Object.keys(updateData).length > 0) {
            updateOp.$set = updateData;
        }

        if (Object.keys(updateOp).length === 0) {
            return true;
        }

        const result = await Events.updateOne({ _id: new ObjectId(eventId) }, updateOp);

        // Handle new invitations
        if (updates.invitations) {
            const existingInvitations = existingEvent.invitations || [];
            const newInvitations = updates.invitations.filter((did) => !existingInvitations.includes(did));
            if (newInvitations.length > 0) {
                await inviteUsersToEvent(eventId, existingEvent.circleId, newInvitations, inviter);
            }
        }

        return result.matchedCount > 0 || result.modifiedCount > 0;
    } catch (error) {
        console.error(`Error updating event (${eventId}):`, error);
        return false;
    }
};

/**
 * Delete an event and (optionally) its RSVPs.
 */
export const deleteEvent = async (eventId: string): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(eventId)) {
            console.error("Invalid eventId provided for delete:", eventId);
            return false;
        }

        // Delete RSVPs
        await EventRsvps.deleteMany({ eventId });

        // TODO: Delete associated shadow post? Would need to find Posts by parentItemId/Type.
        // await Posts.deleteOne({ _id: new ObjectId(createdPostId) });

        const result = await Events.deleteOne({ _id: new ObjectId(eventId) });
        return result.deletedCount > 0;
    } catch (error) {
        console.error(`Error deleting event (${eventId}):`, error);
        return false;
    }
};

/**
 * Change the stage of an event.
 */
export const changeEventStage = async (eventId: string, newStage: EventStage): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(eventId)) {
            console.error("Invalid eventId for stage change:", eventId);
            return false;
        }

        const updates: Partial<Event> = { stage: newStage, updatedAt: new Date() };

        const result = await Events.updateOne({ _id: new ObjectId(eventId) }, { $set: updates });
        return result.matchedCount > 0;
    } catch (error) {
        console.error(`Error changing stage for event (${eventId}):`, error);
        return false;
    }
};

/**
 * Get open events across all circles for map display.
 * Filters by optional date range overlap or, if no range provided, to upcoming (endAt >= now).
 * Ensures events have a location with lngLat.
 */
export const getOpenEventsForMap = async (userDid: string, range?: Range): Promise<EventDisplay[]> => {
    try {
        const dateMatch = buildRangeMatch(range);
        const now = new Date();

        // Base match: must be open and have a geocoded point
        const baseMatch: any = {
            stage: "open",
            "location.lngLat": { $exists: true },
        };

        // Apply date overlap if provided, otherwise only upcoming
        if (range?.from || range?.to) {
            Object.assign(baseMatch, dateMatch);
        } else {
            baseMatch.endAt = { $gte: now };
        }

        const events = (await Events.aggregate([
            { $match: baseMatch },

            // Author
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

            // Circle
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
                                enabledModules: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // RSVP counts
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$eventId", "$$eId"] },
                            },
                        },
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    as: "rsvpCounts",
                },
            },

            // user RSVP
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userRsvpDocs",
                },
            },

            // Current user's invitation
            {
                $lookup: {
                    from: "eventInvitations",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userInvDocs",
                },
            },

            // Visibility gating
            {
                $match: {
                    $expr: {
                        $or: [
                            { $ne: ["$visibility", "private"] },
                            { $eq: ["$createdBy", userDid] },
                            { $gt: [{ $size: "$userRsvpDocs" }, 0] },
                            { $gt: [{ $size: "$userInvDocs" }, 0] },
                        ],
                    },
                },
            },

            // Final projection
            {
                $project: {
                    ...SAFE_EVENT_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    circle: "$circleDetails",
                    attendees: {
                        $let: {
                            vars: {
                                goingObj: {
                                    $first: {
                                        $filter: {
                                            input: "$rsvpCounts",
                                            as: "rc",
                                            cond: { $eq: ["$$rc._id", "going"] },
                                        },
                                    },
                                },
                            },
                            in: { $ifNull: ["$$goingObj.count", 0] },
                        },
                    },
                    userRsvpStatus: {
                        $let: {
                            vars: { firstRsvp: { $first: "$userRsvpDocs" } },
                            in: {
                                $ifNull: ["$$firstRsvp.status", "none"],
                            },
                        },
                    },
                },
            },

            // Sort soonest first
            { $sort: { startAt: 1 } },
        ]).toArray()) as EventDisplay[];

        return events;
    } catch (error) {
        console.error("Error getting open events for map:", error);
        throw error;
    }
};

/**
 * Get open events across all circles for list display (includes virtual/no-geo events).
 * - Includes events regardless of geocoded point
 * - Filters by optional date range overlap or, if no range provided, to upcoming (endAt >= now)
 * - Stage must be "open"
 * - Applies visibility gating (public, creator, invited, or RSVP'ed)
 */
export const getOpenEventsForList = async (userDid: string, range?: Range): Promise<EventDisplay[]> => {
    try {
        const dateMatch = buildRangeMatch(range);
        const now = new Date();

        // Base match: open events; no lngLat requirement for list
        const baseMatch: any = {
            stage: "open",
        };

        // Apply date overlap if provided, otherwise only upcoming
        if (range?.from || range?.to) {
            Object.assign(baseMatch, dateMatch);
        } else {
            baseMatch.endAt = { $gte: now };
        }

        const events = (await Events.aggregate([
            { $match: baseMatch },

            // Author
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

            // Circle
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
                                enabledModules: 1,
                            },
                        },
                    ],
                    as: "circleDetails",
                },
            },
            { $unwind: { path: "$circleDetails", preserveNullAndEmptyArrays: true } },

            // RSVP counts
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$eventId", "$$eId"] },
                            },
                        },
                        {
                            $group: {
                                _id: "$status",
                                count: { $sum: 1 },
                            },
                        },
                    ],
                    as: "rsvpCounts",
                },
            },

            // user RSVP
            {
                $lookup: {
                    from: "eventRsvps",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userRsvpDocs",
                },
            },

            // Current user's invitation
            {
                $lookup: {
                    from: "eventInvitations",
                    let: { eId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [{ $eq: ["$eventId", "$$eId"] }, { $eq: ["$userDid", userDid] }],
                                },
                            },
                        },
                        {
                            $project: {
                                _id: 0,
                                status: 1,
                            },
                        },
                    ],
                    as: "userInvDocs",
                },
            },

            // Visibility gating
            {
                $match: {
                    $expr: {
                        $or: [
                            { $ne: ["$visibility", "private"] },
                            { $eq: ["$createdBy", userDid] },
                            { $gt: [{ $size: "$userRsvpDocs" }, 0] },
                            { $gt: [{ $size: "$userInvDocs" }, 0] },
                        ],
                    },
                },
            },

            // Final projection
            {
                $project: {
                    ...SAFE_EVENT_PROJECTION,
                    _id: { $toString: "$_id" },
                    author: "$authorDetails",
                    circle: "$circleDetails",
                    attendees: {
                        $let: {
                            vars: {
                                goingObj: {
                                    $first: {
                                        $filter: {
                                            input: "$rsvpCounts",
                                            as: "rc",
                                            cond: { $eq: ["$$rc._id", "going"] },
                                        },
                                    },
                                },
                            },
                            in: { $ifNull: ["$$goingObj.count", 0] },
                        },
                    },
                    userRsvpStatus: {
                        $let: {
                            vars: { firstRsvp: { $first: "$userRsvpDocs" } },
                            in: {
                                $ifNull: ["$$firstRsvp.status", "none"],
                            },
                        },
                    },
                },
            },

            // Sort soonest first
            { $sort: { startAt: 1 } },
        ]).toArray()) as EventDisplay[];

        return events;
    } catch (error) {
        console.error("Error getting open events for list:", error);
        throw error;
    }
};
