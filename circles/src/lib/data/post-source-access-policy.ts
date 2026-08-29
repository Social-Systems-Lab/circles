import { ObjectId, type Document } from "mongodb";
import type { Circle, Event, FundingAsk, Goal, Issue, Post, Proposal, Task } from "@/models/models";
import { canReadCircle, circleVisibilityMongoQuery, getCanonicalMemberCircleIds } from "./circle-visibility-policy";
import { getReadableLifecycleQuery } from "./circle-lifecycle-policy";

export const PARENT_POST_SOURCE_TYPES = ["task", "event", "goal", "issue", "proposal"] as const;
export const POST_SOURCE_TYPES = [...PARENT_POST_SOURCE_TYPES, "funding"] as const;
export type PostSourceType = (typeof POST_SOURCE_TYPES)[number];
export type PostSourceReference = {
    type: PostSourceType;
    id: string;
    marker: "parent" | "funding" | "legacyFunding";
};

type SourceResource = Task | Event | Goal | Issue | Proposal | FundingAsk;

export type PostSourceDependencies = {
    findSource: (type: PostSourceType, id: ObjectId) => Promise<SourceResource | null>;
    findCircles: (ids: ObjectId[]) => Promise<Circle[]>;
    canReadOwner: (viewerDid: string | undefined, circle: Circle) => Promise<boolean>;
};

const sourceCollections: Record<PostSourceType, string> = {
    task: "tasks",
    event: "events",
    goal: "goals",
    issue: "issues",
    proposal: "proposals",
    funding: "fundingAsks",
};

const defaultDependencies: PostSourceDependencies = {
    findSource: async (type, id) => {
        const { Tasks, Events, Goals, Issues, Proposals, FundingAsks } = await import("./db");
        const collections = {
            task: Tasks,
            event: Events,
            goal: Goals,
            issue: Issues,
            proposal: Proposals,
            funding: FundingAsks,
        };
        return (await collections[type].findOne({ _id: id })) as SourceResource | null;
    },
    findCircles: async (ids) => {
        const { Circles } = await import("./db");
        return Circles.find({ _id: { $in: ids } }).toArray();
    },
    canReadOwner: canReadCircle,
};

const normalizeObjectId = (value: unknown): ObjectId | null =>
    typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;

export function getPostSourceReference(
    post: Pick<
        Post,
        | "parentItemId"
        | "parentItemType"
        | "sourceResourceId"
        | "sourceResourceType"
        | "internalPreviewId"
        | "internalPreviewType"
    >,
): PostSourceReference | null | false {
    const hasParentType = post.parentItemType !== undefined;
    const hasParentId = post.parentItemId !== undefined;
    if (hasParentType || hasParentId) {
        if (
            !hasParentType ||
            !hasParentId ||
            !PARENT_POST_SOURCE_TYPES.includes(post.parentItemType as (typeof PARENT_POST_SOURCE_TYPES)[number])
        )
            return false;
        return { type: post.parentItemType as PostSourceType, id: post.parentItemId!, marker: "parent" };
    }
    const hasSourceType = post.sourceResourceType !== undefined;
    const hasSourceId = post.sourceResourceId !== undefined;
    if (hasSourceType || hasSourceId) {
        if (!hasSourceType || !hasSourceId || post.sourceResourceType !== "funding") return false;
        return { type: "funding", id: post.sourceResourceId!, marker: "funding" };
    }
    // Legacy Funding noticeboard posts copied ask content but predate the explicit parent marker.
    if (post.internalPreviewType === "funding") {
        return post.internalPreviewId ? { type: "funding", id: post.internalPreviewId, marker: "legacyFunding" } : null;
    }
    return null;
}

function getOwnerCircleIds(type: PostSourceType, source: SourceResource): string[] | null {
    let rawIds: unknown[];
    if (type === "event") {
        const event = source as Event;
        const hostCircleIds: unknown = event.hostCircleIds;
        if (hostCircleIds !== undefined && hostCircleIds !== null && !Array.isArray(hostCircleIds)) return null;
        rawIds = [event.circleId, ...((hostCircleIds ?? []) as unknown[])];
    } else {
        rawIds = [(source as Exclude<SourceResource, Event>).circleId];
    }
    if (rawIds.length === 0 || rawIds.some((id) => typeof id !== "string" || !ObjectId.isValid(id))) return null;
    return Array.from(new Set(rawIds.map((id) => new ObjectId(id as string).toHexString())));
}

export async function canReadEventOwners(
    event: Pick<Event, "circleId" | "hostCircleIds">,
    viewerDid?: string,
    dependencies: Pick<PostSourceDependencies, "findCircles" | "canReadOwner"> = defaultDependencies,
): Promise<boolean> {
    const ownerIds = getOwnerCircleIds("event", event as Event);
    if (!ownerIds?.length) return false;
    const circles = await dependencies.findCircles(ownerIds.map((id) => new ObjectId(id)));
    const circleMap = new Map(circles.map((circle) => [circle._id?.toString(), circle]));
    if (circleMap.size !== ownerIds.length) return false;
    for (const ownerId of ownerIds) {
        const circle = circleMap.get(ownerId);
        if (!circle || !(await dependencies.canReadOwner(viewerDid, circle))) return false;
    }
    return true;
}

export async function canReadPostSource(
    post: Pick<
        Post,
        | "_id"
        | "parentItemId"
        | "parentItemType"
        | "sourceResourceId"
        | "sourceResourceType"
        | "internalPreviewId"
        | "internalPreviewType"
    >,
    viewerDid?: string,
    dependencies: PostSourceDependencies = defaultDependencies,
): Promise<boolean> {
    const reference = getPostSourceReference(post);
    if (reference === null) return true;
    if (reference === false) return false;
    const sourceId = normalizeObjectId(reference.id);
    if (!sourceId) return reference.marker === "legacyFunding";
    const source = await dependencies.findSource(reference.type, sourceId);
    if (!source || source._id?.toString() !== sourceId.toHexString()) return reference.marker === "legacyFunding";
    if (
        reference.marker === "legacyFunding" &&
        ((source as FundingAsk).noticeboardPostId !== post._id?.toString() ||
            !ObjectId.isValid(post._id?.toString() ?? ""))
    ) {
        return true;
    }
    if (reference.type === "event") {
        return canReadEventOwners(source as Event, viewerDid, dependencies);
    }
    const ownerIds = getOwnerCircleIds(reference.type, source);
    if (!ownerIds?.length) return false;
    const circles = await dependencies.findCircles(ownerIds.map((id) => new ObjectId(id)));
    const circleMap = new Map(circles.map((circle) => [circle._id?.toString(), circle]));
    if (circleMap.size !== ownerIds.length) return false;
    for (const ownerId of ownerIds) {
        const circle = circleMap.get(ownerId);
        if (!circle || !(await dependencies.canReadOwner(viewerDid, circle))) return false;
    }
    return true;
}

const sourceLookupProjection = (type: PostSourceType) =>
    type === "event" ? { _id: 1, circleId: 1, hostCircleIds: 1 } : { _id: 1, circleId: 1 };

export async function buildReadablePostSourceAggregationStages(viewerDid?: string): Promise<Document[]> {
    const memberCircleIds = await getCanonicalMemberCircleIds(viewerDid);
    const readableCircleQuery = {
        $and: [circleVisibilityMongoQuery({ viewerDid, memberCircleIds }), getReadableLifecycleQuery()],
    };
    const stages: Document[] = [
        {
            $set: {
                __hasParentMarker: {
                    $or: [
                        { $ne: [{ $type: "$parentItemType" }, "missing"] },
                        { $ne: [{ $type: "$parentItemId" }, "missing"] },
                    ],
                },
                __hasFundingMarker: {
                    $or: [
                        { $ne: [{ $type: "$sourceResourceType" }, "missing"] },
                        { $ne: [{ $type: "$sourceResourceId" }, "missing"] },
                    ],
                },
            },
        },
        {
            $set: {
                __sourceType: {
                    $cond: [
                        "$__hasParentMarker",
                        {
                            $cond: [
                                { $in: ["$parentItemType", PARENT_POST_SOURCE_TYPES] },
                                "$parentItemType",
                                "__invalid",
                            ],
                        },
                        {
                            $cond: [
                                "$__hasFundingMarker",
                                {
                                    $cond: [
                                        {
                                            $and: [
                                                { $eq: ["$sourceResourceType", "funding"] },
                                                { $ne: [{ $type: "$sourceResourceId" }, "missing"] },
                                            ],
                                        },
                                        "funding",
                                        "__invalid",
                                    ],
                                },
                                {
                                    $cond: [
                                        {
                                            $and: [
                                                { $eq: ["$internalPreviewType", "funding"] },
                                                { $ne: [{ $type: "$internalPreviewId" }, "missing"] },
                                            ],
                                        },
                                        "__legacyFunding",
                                        null,
                                    ],
                                },
                            ],
                        },
                    ],
                },
                __sourceId: {
                    $convert: {
                        input: {
                            $cond: [
                                "$__hasParentMarker",
                                "$parentItemId",
                                {
                                    $cond: ["$__hasFundingMarker", "$sourceResourceId", "$internalPreviewId"],
                                },
                            ],
                        },
                        to: "objectId",
                        onError: null,
                        onNull: null,
                    },
                },
            },
        },
    ];
    for (const type of POST_SOURCE_TYPES) {
        stages.push({
            $lookup: {
                from: sourceCollections[type],
                let: {
                    sourceId: "$__sourceId",
                    sourceType: "$__sourceType",
                    postId: { $toString: "$_id" },
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {
                                        $in: [
                                            "$$sourceType",
                                            type === "funding" ? ["funding", "__legacyFunding"] : [type],
                                        ],
                                    },
                                    { $eq: ["$_id", "$$sourceId"] },
                                    ...(type === "funding"
                                        ? [
                                              {
                                                  $or: [
                                                      { $eq: ["$$sourceType", "funding"] },
                                                      { $eq: ["$noticeboardPostId", "$$postId"] },
                                                  ],
                                              },
                                          ]
                                        : []),
                                ],
                            },
                        },
                    },
                    { $project: sourceLookupProjection(type) },
                ],
                as: `__source_${type}`,
            },
        });
    }
    stages.push(
        {
            $set: {
                __sourceType: {
                    $cond: [
                        { $eq: ["$__sourceType", "__legacyFunding"] },
                        { $cond: [{ $eq: [{ $size: "$__source_funding" }, 1] }, "funding", null] },
                        "$__sourceType",
                    ],
                },
            },
        },
        {
            $set: {
                __sourceDocs: {
                    $switch: {
                        branches: POST_SOURCE_TYPES.map((type) => ({
                            case: { $eq: ["$__sourceType", type] },
                            then: `$__source_${type}`,
                        })),
                        default: [],
                    },
                },
            },
        },
        {
            $set: {
                __sourceOwnerRawIds: {
                    $cond: [
                        { $eq: ["$__sourceType", "event"] },
                        {
                            $setUnion: [
                                [{ $arrayElemAt: ["$__sourceDocs.circleId", 0] }],
                                {
                                    $cond: [
                                        {
                                            $or: [
                                                {
                                                    $eq: [
                                                        {
                                                            $type: {
                                                                $arrayElemAt: ["$__sourceDocs.hostCircleIds", 0],
                                                            },
                                                        },
                                                        "missing",
                                                    ],
                                                },
                                                {
                                                    $eq: [{ $arrayElemAt: ["$__sourceDocs.hostCircleIds", 0] }, null],
                                                },
                                            ],
                                        },
                                        [],
                                        {
                                            $cond: [
                                                {
                                                    $isArray: {
                                                        $arrayElemAt: ["$__sourceDocs.hostCircleIds", 0],
                                                    },
                                                },
                                                { $arrayElemAt: ["$__sourceDocs.hostCircleIds", 0] },
                                                [null],
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                        [{ $arrayElemAt: ["$__sourceDocs.circleId", 0] }],
                    ],
                },
            },
        },
        {
            $set: {
                __sourceOwnerIds: {
                    $map: {
                        input: "$__sourceOwnerRawIds",
                        as: "ownerId",
                        in: { $convert: { input: "$$ownerId", to: "objectId", onError: null, onNull: null } },
                    },
                },
            },
        },
        {
            $lookup: {
                from: "circles",
                let: { ownerIds: "$__sourceOwnerIds" },
                pipeline: [
                    { $match: { $expr: { $in: ["$_id", "$$ownerIds"] } } },
                    { $match: readableCircleQuery },
                    { $project: { _id: 1 } },
                ],
                as: "__readableSourceOwners",
            },
        },
        {
            $match: {
                $expr: {
                    $or: [
                        { $eq: ["$__sourceType", null] },
                        {
                            $and: [
                                { $in: ["$__sourceType", POST_SOURCE_TYPES] },
                                { $eq: [{ $size: "$__sourceDocs" }, 1] },
                                { $gt: [{ $size: "$__sourceOwnerIds" }, 0] },
                                { $not: [{ $in: [null, "$__sourceOwnerIds"] }] },
                                { $eq: [{ $size: "$__sourceOwnerIds" }, { $size: "$__readableSourceOwners" }] },
                            ],
                        },
                    ],
                },
            },
        },
        {
            $unset: [
                "__sourceType",
                "__sourceId",
                "__hasParentMarker",
                "__hasFundingMarker",
                "__sourceDocs",
                "__sourceOwnerRawIds",
                "__sourceOwnerIds",
                "__readableSourceOwners",
                ...POST_SOURCE_TYPES.map((type) => `__source_${type}`),
            ],
        },
    );
    return stages;
}

export async function buildSourceFilteredPostMatchStages(match: Document, viewerDid?: string): Promise<Document[]> {
    return [{ $match: match }, ...(await buildReadablePostSourceAggregationStages(viewerDid))];
}
