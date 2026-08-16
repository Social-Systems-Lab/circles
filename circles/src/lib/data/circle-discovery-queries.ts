import type { Circle, CircleType } from "@/models/models";
import type { ObjectId } from "mongodb";

export const sanitizeCircleDiscoveryResult = <T extends Circle>(circle: T): T => {
    const {
        parentCircleId: _parentCircleId,
        affiliatedCircleIds: _affiliatedCircleIds,
        circleLevel: _circleLevel,
        ...safeCircle
    } = circle;

    return safeCircle as T;
};

export const getPublishedCircleQuery = () => ({
    $or: [{ publishStatus: "published" as const }, { publishStatus: { $exists: false } }],
});

export const buildDiscoverableCircleIdsQuery = (objectIds: ObjectId[], discoveryQuery: Record<string, unknown>) => ({
    $and: [{ _id: { $in: objectIds } }, discoveryQuery],
});

export const buildSwipeCircleQuery = (discoveryQuery: Record<string, unknown>) => ({
    $and: [
        getPublishedCircleQuery(),
        discoveryQuery,
        {
            $or: [
                { circleType: { $ne: "user" } },
                { $and: [{ circleType: "user" }, { accountStatus: { $ne: "rejected" } }] },
            ],
        },
    ],
});

export const buildCircleListQuery = ({
    parentCircleId,
    circleType,
    sdgHandles,
    discoveryQuery,
    includeCreatedBy,
    includeMemberCircleIds = [],
}: {
    parentCircleId?: string;
    circleType?: CircleType;
    sdgHandles?: string[];
    discoveryQuery: Record<string, unknown>;
    includeCreatedBy?: string;
    includeMemberCircleIds?: ObjectId[];
}) => {
    const scopes: Record<string, unknown>[] = [];
    if (parentCircleId) scopes.push({ parentCircleId });
    if (includeCreatedBy) scopes.push({ createdBy: includeCreatedBy });
    if (includeMemberCircleIds.length > 0) scopes.push({ _id: { $in: includeMemberCircleIds } });
    const query: Record<string, any> = {
        $and: [
            { circleType: circleType ?? "circle" },
            getPublishedCircleQuery(),
            discoveryQuery,
            ...(scopes.length > 0 ? [{ $or: scopes }] : []),
        ],
    };
    if (sdgHandles?.length) query.$and.push({ causes: { $in: sdgHandles } });
    return query;
};

export const buildCommunityRelatedCirclesQuery = (
    circleId: string,
    discoveryQuery: Record<string, unknown>,
    sdgHandles: string[] = [],
) => ({
    $and: [
        { circleType: "circle" },
        getPublishedCircleQuery(),
        discoveryQuery,
        { $or: [{ parentCircleId: circleId }, { affiliatedCircleIds: circleId }] },
        ...(sdgHandles.length > 0 ? [{ causes: { $in: sdgHandles } }] : []),
    ],
});

export const composeSearchCandidateQuery = (
    candidateQuery: Record<string, unknown>,
    discoveryQuery: Record<string, unknown>,
) => ({ $and: [candidateQuery, discoveryQuery] });
