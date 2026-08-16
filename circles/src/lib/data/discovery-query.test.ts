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
