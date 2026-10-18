import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";
import { buildViewerCircleDiscoveryQuery } from "./circle-visibility-policy";
import { getPublicCircleCountQuery } from "./platform-stats-query";
import {
    buildCircleListQuery,
    buildCommunityRelatedCirclesQuery,
    buildDiscoverableCircleIdsQuery,
    buildSwipeCircleQuery,
    composeSearchCandidateQuery,
    getCircleRelationshipToCurrentCircle,
    sanitizeCircleDiscoveryResult,
} from "./circle-discovery-queries";

const getValue = (document: Record<string, any>, path: string) =>
    path.split(".").reduce((value, key) => value?.[key], document);

const matches = (document: Record<string, any>, query: Record<string, any>): boolean =>
    Object.entries(query).every(([key, expected]) => {
        if (key === "$and") return expected.every((clause: Record<string, any>) => matches(document, clause));
        if (key === "$or") return expected.some((clause: Record<string, any>) => matches(document, clause));
        const actual = getValue(document, key);
        if (expected instanceof RegExp) return expected.test(String(actual ?? ""));
        if (expected && typeof expected === "object" && !(expected instanceof ObjectId)) {
            if ("$exists" in expected) return (actual !== undefined) === expected.$exists;
            if ("$in" in expected) {
                return expected.$in.some((candidate: unknown) => String(candidate) === String(actual));
            }
            if ("$ne" in expected) return actual !== expected.$ne;
        }
        if (Array.isArray(actual)) return actual.some((value) => String(value) === String(expected));
        return String(actual) === String(expected);
    });

const publicId = new ObjectId();
const legacyId = new ObjectId();
const secretId = new ObjectId();
const pausedSecretId = new ObjectId();
const suspendedSecretId = new ObjectId();
const removedSecretId = new ObjectId();
const userId = new ObjectId();
const documents: Circle[] = [
    { _id: publicId, circleType: "circle", visibility: "public", name: "Public match", publishStatus: "published" },
    { _id: legacyId, circleType: "circle", name: "Legacy match", publishStatus: "published" },
    {
        _id: secretId,
        circleType: "circle",
        visibility: "secret",
        name: "Perfect secret match",
        publishStatus: "published",
        createdBy: "did:creator",
    },
    {
        _id: pausedSecretId,
        circleType: "circle",
        visibility: "secret",
        moderationStatus: "paused",
        name: "Paused secret match",
        publishStatus: "published",
    },
    {
        _id: suspendedSecretId,
        circleType: "circle",
        visibility: "secret",
        moderationStatus: "suspended",
        name: "Suspended secret match",
        publishStatus: "published",
    },
    {
        _id: removedSecretId,
        circleType: "circle",
        visibility: "secret",
        moderationStatus: "removed",
        name: "Removed secret match",
        publishStatus: "published",
    },
    {
        _id: userId,
        circleType: "user",
        visibility: "secret",
        moderationStatus: "suspended",
        name: "User match",
        publishStatus: "published",
    },
] as Circle[];

const visibleIds = (viewerDid?: string, memberIds: string[] = []) => {
    const query = buildViewerCircleDiscoveryQuery(viewerDid, memberIds);
    return documents
        .filter((circle) => matches(circle as Record<string, any>, query))
        .map((circle) => String(circle._id));
};

assert.deepEqual(visibleIds(), [publicId.toString(), legacyId.toString(), userId.toString()]);
assert.deepEqual(visibleIds("did:outsider"), [publicId.toString(), legacyId.toString(), userId.toString()]);
assert.deepEqual(
    visibleIds("did:member", [
        secretId.toString(),
        pausedSecretId.toString(),
        suspendedSecretId.toString(),
        removedSecretId.toString(),
        "bad",
    ]),
    [publicId.toString(), legacyId.toString(), secretId.toString(), pausedSecretId.toString(), userId.toString()],
);

const hiddenParentId = new ObjectId().toString();
const hiddenAffiliateId = new ObjectId().toString();
const structuralCircle = {
    _id: publicId.toString(),
    name: "Public child",
    handle: "public-child",
    picture: { url: "/storage/public-child.png" },
    circleType: "circle",
    parentCircleId: hiddenParentId,
    affiliatedCircleIds: [hiddenAffiliateId],
    circleLevel: "profile_child",
} as Circle;
const safeStructuralCircle = sanitizeCircleDiscoveryResult(structuralCircle);

assert.equal(Object.hasOwn(safeStructuralCircle, "parentCircleId"), false);
assert.equal(Object.hasOwn(safeStructuralCircle, "affiliatedCircleIds"), false);
assert.equal(Object.hasOwn(safeStructuralCircle, "circleLevel"), false);
assert.equal(safeStructuralCircle._id, structuralCircle._id);
assert.equal(safeStructuralCircle.name, structuralCircle.name);
assert.equal(safeStructuralCircle.handle, structuralCircle.handle);
assert.deepEqual(safeStructuralCircle.picture, structuralCircle.picture);
assert.equal(structuralCircle.parentCircleId, hiddenParentId, "sanitizing does not mutate raw/internal results");
assert.deepEqual(structuralCircle.affiliatedCircleIds, [hiddenAffiliateId]);
assert.equal(structuralCircle.circleLevel, "profile_child");

const classifiedRelationship = {
    ...sanitizeCircleDiscoveryResult(structuralCircle),
    relationshipToCurrentCircle: structuralCircle.parentCircleId === hiddenParentId ? "child" : "affiliate",
};
assert.equal(classifiedRelationship.relationshipToCurrentCircle, "child");
assert.equal(Object.hasOwn(classifiedRelationship, "parentCircleId"), false);
assert.equal(Object.hasOwn(classifiedRelationship, "affiliatedCircleIds"), false);

const deterministicSearchResult = sanitizeCircleDiscoveryResult({
    ...structuralCircle,
    metrics: { searchRank: 1, similarity: 1 },
});
assert.equal(Object.hasOwn(deterministicSearchResult, "parentCircleId"), false);
assert.equal(Object.hasOwn(deterministicSearchResult, "affiliatedCircleIds"), false);
assert.equal(Object.hasOwn(deterministicSearchResult, "circleLevel"), false);
const anonymousDiscoveryQuery = buildViewerCircleDiscoveryQuery();

const creatorListQuery = buildCircleListQuery({
    circleType: "circle",
    discoveryQuery: buildViewerCircleDiscoveryQuery("did:creator"),
    includeCreatedBy: "did:creator",
});
assert.equal(
    documents
        .filter((circle) => matches(circle as Record<string, any>, creatorListQuery))
        .some((circle) => circle._id === secretId),
    false,
    "createdBy does not bypass secret discovery",
);
const memberListQuery = buildCircleListQuery({
    circleType: "circle",
    discoveryQuery: buildViewerCircleDiscoveryQuery("did:member", [secretId.toString()]),
    includeMemberCircleIds: [secretId],
});
assert.equal(
    documents
        .filter((circle) => matches(circle as Record<string, any>, memberListQuery))
        .some((circle) => circle._id === secretId),
    true,
);

const relatedDocuments = documents.map((circle) => ({ ...circle, affiliatedCircleIds: ["root-circle"] }));
const outsiderRelationshipQuery = buildCommunityRelatedCirclesQuery("root-circle", anonymousDiscoveryQuery);
assert.equal(
    relatedDocuments
        .filter((circle) => matches(circle as Record<string, any>, outsiderRelationshipQuery))
        .some((circle) => circle._id === secretId),
    false,
    "inaccessible secret affiliation endpoint is omitted",
);
const memberRelationshipQuery = buildCommunityRelatedCirclesQuery(
    "root-circle",
    buildViewerCircleDiscoveryQuery("did:member", [secretId.toString()]),
);
assert.equal(
    relatedDocuments
        .filter((circle) => matches(circle as Record<string, any>, memberRelationshipQuery))
        .some((circle) => circle._id === secretId),
    true,
);

const inventoryRootId = new ObjectId().toString();
const createdId = new ObjectId();
const joinedId = new ObjectId();
const overlappingId = new ObjectId();
const publicChildId = new ObjectId();
const draftCreatorId = new ObjectId();
const draftMemberId = new ObjectId();
const personalProfileId = new ObjectId();
const inventoryDocuments = [
    {
        _id: createdId,
        circleType: "circle",
        visibility: "public",
        publishStatus: "published",
        createdBy: "did:owner",
    },
    { _id: joinedId, circleType: "circle", visibility: "public", publishStatus: "published" },
    {
        _id: overlappingId,
        circleType: "circle",
        visibility: "public",
        publishStatus: "published",
        createdBy: "did:owner",
        parentCircleId: inventoryRootId,
        affiliatedCircleIds: [inventoryRootId],
    },
    {
        _id: publicChildId,
        circleType: "circle",
        visibility: "public",
        publishStatus: "published",
        parentCircleId: inventoryRootId,
    },
    {
        _id: draftCreatorId,
        circleType: "circle",
        visibility: "public",
        publishStatus: "draft",
        createdBy: "did:owner",
    },
    {
        _id: draftMemberId,
        circleType: "circle",
        visibility: "public",
        publishStatus: "draft",
    },
    {
        _id: personalProfileId,
        circleType: "user",
        visibility: "public",
        publishStatus: "published",
        createdBy: "did:owner",
    },
] as Circle[];
const inventoryQuery = buildCommunityRelatedCirclesQuery(
    inventoryRootId,
    buildViewerCircleDiscoveryQuery("did:owner"),
    [],
    "did:owner",
    [joinedId, overlappingId, draftMemberId, personalProfileId],
);
const inventoryMatches = inventoryDocuments.filter((circle) => matches(circle as Record<string, any>, inventoryQuery));
assert.deepEqual(
    inventoryMatches.map((circle) => String(circle._id)),
    [
        createdId.toString(),
        joinedId.toString(),
        overlappingId.toString(),
        publicChildId.toString(),
        draftCreatorId.toString(),
        draftMemberId.toString(),
    ],
    "the scoped union includes relationship and inventory candidates once while excluding personal profiles",
);
assert.equal(getCircleRelationshipToCurrentCircle(inventoryDocuments[0], inventoryRootId), undefined);
assert.equal(getCircleRelationshipToCurrentCircle(inventoryDocuments[2], inventoryRootId), "child");

const publishedRelationshipOnlyQuery = buildCommunityRelatedCirclesQuery(
    inventoryRootId,
    buildViewerCircleDiscoveryQuery("did:owner"),
);
assert.deepEqual(
    inventoryDocuments
        .filter((circle) => matches(circle as Record<string, any>, publishedRelationshipOnlyQuery))
        .map((circle) => String(circle._id)),
    [overlappingId.toString(), publicChildId.toString()],
    "without personal inventory scopes only published relationships are visible",
);

const suspendedInventoryId = new ObjectId();
const secretCreatedId = new ObjectId();
const protectedInventoryDocuments = [
    {
        _id: suspendedInventoryId,
        circleType: "circle",
        visibility: "public",
        moderationStatus: "suspended",
        publishStatus: "published",
        createdBy: "did:owner",
    },
    {
        _id: secretCreatedId,
        circleType: "circle",
        visibility: "secret",
        moderationStatus: "active",
        publishStatus: "published",
        createdBy: "did:owner",
    },
] as Circle[];
const protectedInventoryQuery = buildCommunityRelatedCirclesQuery(
    inventoryRootId,
    buildViewerCircleDiscoveryQuery("did:owner"),
    [],
    "did:owner",
);
assert.deepEqual(
    protectedInventoryDocuments.filter((circle) => matches(circle as Record<string, any>, protectedInventoryQuery)),
    [],
    "created scope does not bypass lifecycle or canonical secret membership",
);
const secretMemberInventoryQuery = buildCommunityRelatedCirclesQuery(
    inventoryRootId,
    buildViewerCircleDiscoveryQuery("did:owner", [secretCreatedId.toString()]),
    [],
    "did:owner",
    [secretCreatedId],
);
assert.deepEqual(
    protectedInventoryDocuments
        .filter((circle) => matches(circle as Record<string, any>, secretMemberInventoryQuery))
        .map((circle) => String(circle._id)),
    [secretCreatedId.toString()],
    "canonical membership permits an otherwise eligible secret inventory circle",
);

assert.equal(
    documents.filter((circle) => matches(circle as Record<string, any>, getPublicCircleCountQuery())).length,
    2,
    "secret circles do not affect anonymous public circle/project totals",
);
assert.deepEqual(visibleIds("did:superadmin"), visibleIds("did:outsider"), "superadmin has no discovery bypass");

const mapQuery = buildSwipeCircleQuery(anonymousDiscoveryQuery);
assert.deepEqual(
    documents.filter((circle) => matches(circle as Record<string, any>, mapQuery)).map((circle) => String(circle._id)),
    [publicId.toString(), legacyId.toString(), userId.toString()],
    "map candidates are filtered before marker/card construction",
);
const memberMapQuery = buildSwipeCircleQuery(
    buildViewerCircleDiscoveryQuery("did:member", [secretId.toString(), pausedSecretId.toString()]),
);
assert.equal(
    documents
        .filter((circle) => matches(circle as Record<string, any>, memberMapQuery))
        .some((circle) => circle._id === secretId),
    true,
);

const requestedIds = [publicId, secretId, suspendedSecretId];
const outsiderIdQuery = buildDiscoverableCircleIdsQuery(requestedIds, anonymousDiscoveryQuery);
assert.deepEqual(
    documents
        .filter((circle) => matches(circle as Record<string, any>, outsiderIdQuery))
        .map((circle) => String(circle._id)),
    [publicId.toString()],
    "bookmark/pin ID resolution omits inaccessible and unavailable targets",
);
const memberIdQuery = buildDiscoverableCircleIdsQuery(
    requestedIds,
    buildViewerCircleDiscoveryQuery("did:member", [secretId.toString(), suspendedSecretId.toString()]),
);
assert.deepEqual(
    documents
        .filter((circle) => matches(circle as Record<string, any>, memberIdQuery))
        .map((circle) => String(circle._id)),
    [publicId.toString(), secretId.toString()],
);

const searchCandidates = [documents[2], documents[0], documents[1]];
const outsiderSearchQuery = composeSearchCandidateQuery({ name: /match/i }, anonymousDiscoveryQuery);
assert.deepEqual(
    searchCandidates
        .filter((circle) => matches(circle as Record<string, any>, outsiderSearchQuery))
        .slice(0, 2)
        .map((circle) => circle.name),
    ["Public match", "Legacy match"],
    "hidden high-score candidates are removed by Mongo filtering before the candidate limit",
);
const memberSearchQuery = composeSearchCandidateQuery(
    { name: /perfect secret match/i },
    buildViewerCircleDiscoveryQuery("did:member", [secretId.toString()]),
);
assert.deepEqual(
    searchCandidates
        .filter((circle) => matches(circle as Record<string, any>, memberSearchQuery))
        .map((circle) => circle.name),
    ["Perfect secret match"],
);

console.log("direct discovery query tests passed");
