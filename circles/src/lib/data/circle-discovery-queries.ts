import type { Circle, CircleType } from "@/models/models";
import type { ObjectId } from "mongodb";

export const getCircleRelationshipToCurrentCircle = (
    circle: Pick<Circle, "parentCircleId" | "affiliatedCircleIds">,
    circleId: string,
): "child" | "affiliate" | undefined => {
    if (circle.parentCircleId === circleId) return "child";
    if (circle.affiliatedCircleIds?.includes(circleId)) return "affiliate";
    return undefined;
};

export const canViewUnpublishedInventoryCircle = async (
    circle: Pick<Circle, "_id" | "createdBy">,
    viewerDid: string | undefined,
    canEditCircle: (circleId: string) => Promise<boolean>,
): Promise<boolean> => {
    if (!viewerDid) return false;
    if (circle.createdBy === viewerDid) return true;
    const circleId = circle._id?.toString();
    return Boolean(circleId && (await canEditCircle(circleId)));
};

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
    includeCreatedBy?: string,
    includeMemberCircleIds: ObjectId[] = [],
): Record<string, any> => {
    const relationshipScopes = [{ parentCircleId: circleId }, { affiliatedCircleIds: circleId }];
    const inventoryScopes: Record<string, unknown>[] = [];
    if (includeCreatedBy) inventoryScopes.push({ createdBy: includeCreatedBy });
    if (includeMemberCircleIds.length > 0) inventoryScopes.push({ _id: { $in: includeMemberCircleIds } });
    const allScopes = [...relationshipScopes, ...inventoryScopes];
    const publicationScope =
        inventoryScopes.length > 0
            ? {
                  $or: [
                      { $and: [getPublishedCircleQuery(), { $or: allScopes }] },
                      {
                          $and: [
                              { publishStatus: { $in: ["draft", "pending_verification"] } },
                              { $or: inventoryScopes },
                          ],
                      },
                  ],
              }
            : { $and: [getPublishedCircleQuery(), { $or: relationshipScopes }] };

    return {
        $and: [
            { circleType: "circle" },
            discoveryQuery,
            publicationScope,
            ...(sdgHandles.length > 0 ? [{ causes: { $in: sdgHandles } }] : []),
        ],
    };
};

export const composeSearchCandidateQuery = (
    candidateQuery: Record<string, unknown>,
    discoveryQuery: Record<string, unknown>,
) => ({ $and: [candidateQuery, discoveryQuery] });
