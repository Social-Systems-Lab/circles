import { Events, EventRsvps, Feeds, Posts } from "./db";
import { ObjectId } from "mongodb";
import { Event, EventDisplay, EventStage, EventRsvp, Circle, Post, Media } from "@/models/models";
import { SAFE_CIRCLE_PROJECTION } from "./circle";
import { createPost } from "./feed";

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
): Promise<EventDisplay[]> => {
    try {
        const dateMatch = buildRangeMatch(range);

        const events = (await Events.aggregate([
            // 1) Match circle and optional date overlap
            {
                $match: {
                    circleId,
                    ...(dateMatch as Record<string, unknown>),
                },
            },

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

            // 6) Final projection
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
export const createEvent = async (data: Omit<Event, "_id" | "commentPostId">): Promise<Event> => {
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

    return createdEvent as Event;
};

/**
 * Update an event
 */
export const updateEvent = async (eventId: string, updates: Partial<Event>): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(eventId)) {
            console.error("Invalid eventId provided for update:", eventId);
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
