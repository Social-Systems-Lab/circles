import {
    Circles,
    Events,
    EventRsvps,
    Feeds,
    Posts,
    EventInvitations,
    EventOccurrences,
    EventOccurrenceRsvps,
    EventOccurrenceInvitations,
} from "./db";
import { ObjectId } from "mongodb";
import {
    Event,
    EventDisplay,
    EventStage,
    EventRsvp,
    Circle,
    Post,
    Media,
    EventInvitation,
    EventOccurrence,
    EventOccurrenceRsvp,
} from "@/models/models";
import {
    buildRecurringOccurrenceDisplay,
    getRecurringOccurrenceStarts,
    isGeneratedEventOccurrence,
    parseEventOccurrenceId,
    applyEventOccurrenceRsvpState,
    filterEventsForOccurrenceParticipation,
} from "@/lib/event-occurrence";
import { SAFE_CIRCLE_PROJECTION } from "./circle";
import { createPost } from "./feed";
import { upsertVbdEvents } from "./vdb";
import { runDerivedResourceVectorSafeMutation } from "./derived-vector-publication";
import { notifyEventInvitation } from "./notifications";
import { getUserPrivate } from "./user";
import { isAuthorized } from "../auth/auth";
import { features } from "./constants";
import { getCircleById } from "./circle";
import { isAcceptedConnectionForUserDid } from "./relationships";

// Safe projection for event queries
export const SAFE_EVENT_PROJECTION = {
    _id: 1,
    circleId: 1,
    hostCircleIds: 1,
    createdBy: 1,
    createdAt: 1,
    updatedAt: 1,
    title: 1,
    description: 1,
    stage: 1,
    userGroups: 1,
    location: 1,
    commentPostId: 1,
    noticeboardPostId: 1,
    noticeboardPostIdsByCircleId: 1,
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
    recurrence: 1,
} as const;

type Range = { from?: Date; to?: Date };

export function normalizeEventHostCircleIds(event: Pick<Event, "circleId" | "hostCircleIds">): string[] {
    return Array.from(new Set([event.circleId, ...(event.hostCircleIds || [])].filter(Boolean)));
}

export function eventHostCircleMatch(circleId: string) {
    return {
        $or: [{ circleId }, { hostCircleIds: circleId }],
    };
}

export async function canManageEvent(
    userDid: string | undefined | null,
    event: Pick<Event, "circleId" | "hostCircleIds" | "createdBy">,
): Promise<boolean> {
    if (!userDid) {
        return false;
    }
    if (event.createdBy === userDid) {
        return true;
    }

    const hostCircleIds = normalizeEventHostCircleIds(event);
    const checks = await Promise.all(
        hostCircleIds.map(async (hostCircleId) => {
            const canReview = await isAuthorized(userDid, hostCircleId, features.events.review);
            if (canReview) {
                return true;
            }
            return isAuthorized(userDid, hostCircleId, features.events.moderate);
        }),
    );
    return checks.some(Boolean);
}

function occurrenceMapKey(seriesId: string, occurrenceKey: number): string {
    return `${seriesId}:${occurrenceKey}`;
}

function buildRecurringInstance(
    event: EventDisplay,
    occurrenceStart: Date,
    occurrence?: EventOccurrence | null,
    occurrenceRsvps: EventOccurrenceRsvp[] = [],
    userDid = "",
): EventDisplay {
    const occurrenceEvent = {
        ...buildRecurringOccurrenceDisplay(event, occurrenceStart, undefined, occurrence),
        originalEventId: event._id,
    };
    return applyEventOccurrenceRsvpState(occurrenceEvent, occurrenceRsvps, userDid);
}

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
 * Expand a recurring event into multiple instances within a range.
 */
function expandRecurringEvent(
    event: EventDisplay,
    range: Range,
    occurrenceBySeriesAndKey: ReadonlyMap<string, EventOccurrence>,
    rsvpsBySeriesAndKey: ReadonlyMap<string, EventOccurrenceRsvp[]>,
    userDid: string,
): EventDisplay[] {
    if (!event.recurrence || !range.from || !range.to) return [event];

    const instances = getRecurringOccurrenceStarts(
        { startAt: event.startAt, recurrence: event.recurrence },
        {
            from: range.from,
            to: range.to,
        },
    );

    const seriesId = String(event._id);
    return instances.map((date: Date) =>
        buildRecurringInstance(
            event,
            date,
            occurrenceBySeriesAndKey.get(occurrenceMapKey(seriesId, date.getTime())),
            rsvpsBySeriesAndKey.get(occurrenceMapKey(seriesId, date.getTime())),
            userDid,
        ),
    );
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
        const canReview = await isAuthorized(userDid, circleId, features.events.review);
        const canModerate = await isAuthorized(userDid, circleId, features.events.moderate);
        const canManageUnpublished = canReview || canModerate;
        const matchQuery: any = eventHostCircleMatch(circleId);
        let filterToParticipatingOccurrences = false;
        const participatingSeriesIds = new Set<string>();
        const occurrenceStatusByIdentity = new Map<string, EventOccurrenceRsvp["status"]>();
        const legacyParticipatingSeriesIds = new Set<string>();
        if (Object.keys(dateMatch).length > 0) {
            matchQuery.$and = [
                ...(matchQuery.$and || []),
                { $or: [dateMatch, { recurrence: { $exists: true, $ne: null } }] },
            ];
        }

        let hiddenCancelledObjectIds: ObjectId[] = [];
        try {
            const viewer = await getUserPrivate(userDid);
            const hiddenIds = (viewer?.hiddenCancelledEventIds || []) as string[];
            hiddenCancelledObjectIds = hiddenIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
        } catch (err) {
            hiddenCancelledObjectIds = [];
        }

        if (circle && circle.circleType === "user" && circle.did === userDid) {
            const userQueries = [];
            if (includeCreated) {
                userQueries.push({ createdBy: userDid });
            }
            if (includeParticipating) {
                const [rsvps, occurrenceRsvps] = await Promise.all([
                    EventRsvps.find({ userDid, status: "going" }).toArray(),
                    EventOccurrenceRsvps.find({ userDid }).toArray(),
                ]);
                rsvps.forEach((rsvp) => {
                    legacyParticipatingSeriesIds.add(rsvp.eventId);
                    participatingSeriesIds.add(rsvp.eventId);
                });
                occurrenceRsvps.forEach((rsvp) => {
                    occurrenceStatusByIdentity.set(occurrenceMapKey(rsvp.seriesId, rsvp.occurrenceKey), rsvp.status);
                    if (rsvp.status === "going") participatingSeriesIds.add(rsvp.seriesId);
                });
                filterToParticipatingOccurrences = true;
                const eventIds = Array.from(
                    new Set([
                        ...rsvps.map((rsvp) => rsvp.eventId),
                        ...occurrenceRsvps.filter((rsvp) => rsvp.status === "going").map((rsvp) => rsvp.seriesId),
                    ]),
                )
                    .filter((eventId) => ObjectId.isValid(eventId))
                    .map((eventId) => new ObjectId(eventId));
                userQueries.push({ _id: { $in: eventIds } });
            }

            if (userQueries.length > 0) {
                // User profile circle:
                // show events the user CREATED or is PARTICIPATING in,
                // regardless of which circle the event belongs to
                matchQuery.$or = userQueries;
                delete matchQuery.$and;
            }
        }

        if (
            !(
                circle &&
                circle.circleType === "user" &&
                circle.did === userDid &&
                (includeCreated || includeParticipating)
            )
        ) {
            matchQuery.$and = [
                ...(matchQuery.$and || []),
                canManageUnpublished
                    ? {}
                    : {
                          $or: [{ stage: { $nin: ["draft", "review"] } }, { createdBy: userDid }],
                      },
            ];
        } else if (!canManageUnpublished) {
            matchQuery.$and = [
                ...(matchQuery.$and || []),
                {
                    $or: [{ stage: { $nin: ["draft", "review"] } }, { createdBy: userDid }],
                },
            ];
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
            // 1) Match circle and optional date overlap OR recurrence
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

        let occurrenceBySeriesAndKey = new Map<string, EventOccurrence>();
        let rsvpsBySeriesAndKey = new Map<string, EventOccurrenceRsvp[]>();
        if (range?.from && range?.to) {
            const recurringSeriesIds = events.filter((event) => event.recurrence).map((event) => String(event._id));
            if (recurringSeriesIds.length > 0) {
                const occurrences = await EventOccurrences.find({
                    seriesId: { $in: recurringSeriesIds },
                    occurrenceKey: { $gte: range.from.getTime(), $lte: range.to.getTime() },
                }).toArray();
                occurrenceBySeriesAndKey = new Map(
                    occurrences.map((occurrence) => [
                        occurrenceMapKey(occurrence.seriesId, occurrence.occurrenceKey),
                        occurrence,
                    ]),
                );
                const occurrenceRsvps = await EventOccurrenceRsvps.find({
                    seriesId: { $in: recurringSeriesIds },
                    occurrenceKey: { $gte: range.from.getTime(), $lte: range.to.getTime() },
                }).toArray();
                rsvpsBySeriesAndKey = occurrenceRsvps.reduce((map, rsvp) => {
                    const key = occurrenceMapKey(rsvp.seriesId, rsvp.occurrenceKey);
                    map.set(key, [...(map.get(key) || []), rsvp]);
                    return map;
                }, new Map<string, EventOccurrenceRsvp[]>());
            }
        }

        const expandedEvents =
            range?.from && range?.to
                ? events.flatMap((event) =>
                      expandRecurringEvent(event, range, occurrenceBySeriesAndKey, rsvpsBySeriesAndKey, userDid),
                  )
                : events;

        const independentlyIncludedSeriesIds = new Set<string>();
        if (includeCreated) {
            events
                .filter((event) => event.createdBy === userDid)
                .forEach((event) => independentlyIncludedSeriesIds.add(String(event._id)));
        }
        const visibleEvents = filterToParticipatingOccurrences
            ? filterEventsForOccurrenceParticipation(
                  expandedEvents,
                  participatingSeriesIds,
                  legacyParticipatingSeriesIds,
                  occurrenceStatusByIdentity,
                  independentlyIncludedSeriesIds,
              )
            : expandedEvents;

        return visibleEvents.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
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
        const recurringInstance = parseEventOccurrenceId(eventId);
        const lookupEventId = recurringInstance?.seriesId ?? eventId;

        if (!ObjectId.isValid(lookupEventId)) {
            return null;
        }

        const occurrenceInvitation = recurringInstance
            ? await EventOccurrenceInvitations.findOne({
                  seriesId: recurringInstance.seriesId,
                  occurrenceKey: recurringInstance.occurrenceKey,
                  userDid,
              })
            : null;

        const events = (await Events.aggregate([
            { $match: { _id: new ObjectId(lookupEventId) } },

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
                            { $literal: Boolean(occurrenceInvitation) },
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

        if (events.length === 0) {
            return null;
        }

        const event = events[0];
        const canManageUnpublished = await canManageEvent(userDid, event);

        if (
            (event.stage === "draft" || event.stage === "review") &&
            event.createdBy !== userDid &&
            !canManageUnpublished
        ) {
            return null;
        }

        if (!recurringInstance) {
            return event;
        }

        if (!event.recurrence) {
            return null;
        }

        if (
            !isGeneratedEventOccurrence(
                { startAt: event.startAt, recurrence: event.recurrence },
                recurringInstance.originalStartAt,
            )
        ) {
            return null;
        }

        const occurrence = await EventOccurrences.findOne({
            seriesId: String(event._id),
            occurrenceKey: recurringInstance.occurrenceKey,
        });
        const occurrenceRsvps = await EventOccurrenceRsvps.find({
            seriesId: String(event._id),
            occurrenceKey: recurringInstance.occurrenceKey,
        }).toArray();
        const occurrenceEvent = buildRecurringInstance(
            event,
            recurringInstance.originalStartAt,
            occurrence,
            occurrenceRsvps,
            userDid,
        );
        return {
            ...occurrenceEvent,
            _id: event._id,
            occurrenceInvitationMessage: occurrenceInvitation?.message,
        } as EventDisplay;
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

    const circle = await getCircleById(circleId);
    if (!circle) {
        return;
    }

    const existingInvitations = await EventInvitations.find({ eventId, userDid: { $in: userDids } }).toArray();
    const existingUserDids = new Set(existingInvitations.map((inv) => inv.userDid));
    const newUserDids = userDids.filter((did) => !existingUserDids.has(did));

    if (newUserDids.length === 0) {
        return;
    }

    let targetUserDids = newUserDids;

    if (circle.circleType === "user" && inviter.did) {
        const acceptedChecks = await Promise.all(
            newUserDids.map((did) => isAcceptedConnectionForUserDid(inviter.did!, did)),
        );
        targetUserDids = newUserDids.filter((_, idx) => acceptedChecks[idx]);
    } else {
        // Only invite circle viewers or the inviter's accepted contacts.
        const [permissionChecks, contactChecks] = await Promise.all([
            Promise.all(newUserDids.map((did) => isAuthorized(did, circleId, features.events.view))),
            Promise.all(
                newUserDids.map((did) =>
                    inviter.did ? isAcceptedConnectionForUserDid(inviter.did, did) : Promise.resolve(false),
                ),
            ),
        ]);
        targetUserDids = newUserDids.filter((_, idx) => permissionChecks[idx] || contactChecks[idx]);
    }

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

        const ownershipChanges =
            Object.prototype.hasOwnProperty.call(updates, "circleId") ||
            Object.prototype.hasOwnProperty.call(updates, "hostCircleIds");
        const mutate = () => Events.updateOne({ _id: new ObjectId(eventId) }, updateOp);
        const result = ownershipChanges
            ? await runDerivedResourceVectorSafeMutation({
                  kind: "events",
                  resourceId: eventId,
                  mutate,
                  didMutate: (updateResult) => updateResult.matchedCount > 0,
              })
            : await mutate();

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

        // TODO: Delete associated shadow post? Would need to find Posts by parentItemId/Type.
        // await Posts.deleteOne({ _id: new ObjectId(createdPostId) });

        const result = await runDerivedResourceVectorSafeMutation({
            kind: "events",
            resourceId: eventId,
            beforeMutation: async () => {
                await EventRsvps.deleteMany({ eventId });
                await EventInvitations.deleteMany({ eventId });
                await EventOccurrences.deleteMany({ seriesId: eventId });
                await EventOccurrenceRsvps.deleteMany({ seriesId: eventId });
                await EventOccurrenceInvitations.deleteMany({ seriesId: eventId });
            },
            mutate: () => Events.deleteOne({ _id: new ObjectId(eventId) }),
            didMutate: (deleteResult) => deleteResult.deletedCount > 0,
        });
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
