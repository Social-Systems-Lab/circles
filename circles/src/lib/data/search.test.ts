import assert from "node:assert/strict";
// @ts-expect-error Bun provides module mocking at runtime; this repository does not install Bun type declarations.
import { mock } from "bun:test";
import { ObjectId } from "mongodb";
import type { Circle } from "@/models/models";
import { buildSearchableTypeClauses, isSearchEligibleCircle } from "@/lib/data/search-visibility";
import { isMapVisibleCircle } from "@/lib/map-visibility";
import {
    buildPublicSearchLocation,
    buildPublicSearchResult,
    PUBLIC_SEARCH_CIRCLE_PROJECTION,
} from "@/lib/data/public-search-result";

const getValue = (document: Record<string, any>, path: string) =>
    path.split(".").reduce((value, key) => value?.[key], document);

const valuesEqual = (left: unknown, right: unknown) => String(left) === String(right);

const matches = (document: Record<string, any>, query: Record<string, any>): boolean =>
    Object.entries(query).every(([key, expected]) => {
        if (key === "$and") return expected.every((clause: Record<string, any>) => matches(document, clause));
        if (key === "$or") return expected.some((clause: Record<string, any>) => matches(document, clause));

        const actual = getValue(document, key);
        if (expected instanceof RegExp) {
            const values = Array.isArray(actual) ? actual : [actual];
            return values.some((value) => expected.test(String(value ?? "")));
        }
        if (expected && typeof expected === "object" && !(expected instanceof ObjectId)) {
            if ("$exists" in expected && (actual !== undefined) !== expected.$exists) return false;
            if ("$in" in expected && !expected.$in.some((candidate: unknown) => valuesEqual(candidate, actual))) {
                return false;
            }
            if ("$ne" in expected && valuesEqual(actual, expected.$ne)) return false;
            return true;
        }
        if (Array.isArray(actual)) return actual.some((value) => valuesEqual(value, expected));
        return valuesEqual(actual, expected);
    });

let mockCircleRecords: Circle[] = [];
const memberCircleIds = new Map<string, string[]>();
const findCalls: Array<{ query: Record<string, any>; options: unknown; limit?: number }> = [];
const mockCircles = {
    find(query: Record<string, any>, options: unknown) {
        const call: (typeof findCalls)[number] = { query, options };
        findCalls.push(call);
        return {
            limit(limit: number) {
                call.limit = limit;
                return this;
            },
            async toArray() {
                return mockCircleRecords
                    .filter((circle) => matches(circle as Record<string, any>, query))
                    .slice(0, call.limit)
                    .map((circle) => structuredClone(circle));
            },
        };
    },
};
const mockMembers = {
    find({ userDid }: { userDid: string }) {
        return {
            async toArray() {
                return (memberCircleIds.get(userDid) || []).map((circleId) => ({ circleId }));
            },
        };
    },
};
const unusedCollection = { createIndex: async () => "mock-index" };

mock.module("./db", () => ({
    client: {},
    db: {},
    Circles: mockCircles,
    ServerSettingsCollection: {},
    Members: mockMembers,
    MembershipRequests: {},
    Feeds: {},
    Posts: {},
    Comments: {},
    Reactions: {},
    Skills: {},
    Sdgs: {},
    ChatRooms: {},
    ChatMessages: {},
    ChatRoomMembers: unusedCollection,
    Challenges: {},
    Proposals: {},
    Issues: {},
    Tasks: {},
    FundingAsks: {},
    Goals: {},
    Events: {},
    EventRsvps: {},
    EventInvitations: {},
    EventOccurrences: {},
    EventOccurrenceRsvps: {},
    EventOccurrenceInvitations: {},
    GoalMembers: {},
    RankedLists: {},
    AggregateRanks: unusedCollection,
    UserNotificationSettings: {},
    DefaultNotificationSettings: {},
    Notifications: unusedCollection,
    ChatConversations: unusedCollection,
    ChatMessageDocs: unusedCollection,
    ChatReadStates: unusedCollection,
    ChatTopicReadStates: {},
    MessageEmailReminders: unusedCollection,
    ExternalNotificationChannels: unusedCollection,
    PlatformBroadcastMessages: {},
    StripeWebhookEvents: {},
    UserRelationships: unusedCollection,
    HumanityVerifications: unusedCollection,
    PlatformSettingsCollection: {},
    PlatformAuditEvents: {},
    PrivateMediaCollection: {},
    getDb: async () => ({}),
    ensureRequiredChatIndexes: async () => undefined,
}));

const userProfile = (overrides: Partial<Circle> = {}): Circle =>
    ({
        _id: new ObjectId(),
        circleType: "user",
        name: "Incomplete Person",
        handle: "incomplete-person",
        isVerified: false,
        verificationStatus: "unverified",
        isMember: false,
        publishStatus: "published",
        ...overrides,
    }) as Circle;

const normalCircle = (overrides: Partial<Circle> = {}): Circle =>
    ({
        _id: new ObjectId(),
        circleType: "circle",
        name: "Normal Circle",
        handle: "normal-circle",
        publishStatus: "published",
        moderationStatus: "active",
        ...overrides,
    }) as Circle;

assert.equal(isSearchEligibleCircle(userProfile()), true);
assert.equal(isSearchEligibleCircle(userProfile({ accountStatus: "rejected" })), false);
assert.equal(isSearchEligibleCircle(normalCircle()), true);
assert.equal(isSearchEligibleCircle(normalCircle({ circleType: undefined })), false);
assert.deepEqual(buildSearchableTypeClauses(["user"]), [{ circleType: "user" }]);
assert.deepEqual(buildSearchableTypeClauses(["circle", "project"]), [{ circleType: { $in: ["circle", "project"] } }]);
assert.equal(isMapVisibleCircle(userProfile()), false);

const completeLocation = {
    precision: 4,
    country: "Public country",
    region: "Public region",
    city: "Public city",
    street: "Public street",
    lngLat: { lng: 12.3456, lat: 65.4321, internalGrid: "private" },
    address: "Historical private address",
    postalCode: "Private postal code",
    metadata: { private: true },
};
const locationCases = [
    { precision: 0, expected: { precision: 0, country: "Public country" } },
    { precision: 1, expected: { precision: 1, country: "Public country", region: "Public region" } },
    {
        precision: 2,
        expected: { precision: 2, country: "Public country", region: "Public region", city: "Public city" },
    },
    {
        precision: 3,
        expected: {
            precision: 3,
            country: "Public country",
            region: "Public region",
            city: "Public city",
            street: "Public street",
        },
    },
    {
        precision: 4,
        expected: {
            precision: 4,
            country: "Public country",
            region: "Public region",
            city: "Public city",
            street: "Public street",
            lngLat: { lng: 12.3456, lat: 65.4321 },
        },
    },
] as const;
for (const { precision, expected } of locationCases) {
    assert.deepEqual(buildPublicSearchLocation({ ...completeLocation, precision }), expected);
}
for (const precision of [undefined, null, Number.NaN, "4", -1, 5, 2.5, Number.POSITIVE_INFINITY]) {
    assert.equal(buildPublicSearchLocation({ ...completeLocation, precision }), undefined);
}
assert.equal(buildPublicSearchLocation(null), undefined);

const serialized = buildPublicSearchResult(
    userProfile({
        email: "private@example.invalid",
        officialEmail: "official@example.invalid",
        bookmarkedCircles: ["private-bookmark"],
        pinnedCircles: ["private-pin"],
        hiddenCancelledEventIds: ["private-event"],
        metadata: { private: true },
        accessRules: { module: { private: ["owner"] } },
        location: { ...completeLocation, precision: 2 } as Circle["location"],
    }),
    1,
);
for (const field of [
    "email",
    "officialEmail",
    "bookmarkedCircles",
    "pinnedCircles",
    "hiddenCancelledEventIds",
    "metadata",
    "accessRules",
]) {
    assert.equal(field in serialized, false, `${field} is omitted`);
}
assert.deepEqual(serialized.location, locationCases[2].expected);

const { searchDiscoverableCircles } = await import("@/lib/data/search");
const publicCircle = normalCircle({ name: "Rarefind Public", handle: "rarefind-public", visibility: "public" });
const legacyCircle = normalCircle({ name: "Rarefind Legacy", handle: "rarefind-legacy", visibility: undefined });
const activeSecret = normalCircle({ name: "Rarefind Active Secret", visibility: "secret" });
const pausedSecret = normalCircle({ name: "Rarefind Paused Secret", visibility: "secret", moderationStatus: "paused" });
const suspendedSecret = normalCircle({
    name: "Rarefind Suspended Secret",
    visibility: "secret",
    moderationStatus: "suspended",
});
const removedSecret = normalCircle({
    name: "Rarefind Removed Secret",
    visibility: "secret",
    moderationStatus: "removed",
});
mockCircleRecords = [activeSecret, pausedSecret, suspendedSecret, removedSecret, publicCircle, legacyCircle];
memberCircleIds.set(
    "did:member",
    [activeSecret, pausedSecret, suspendedSecret, removedSecret].map((circle) => String(circle._id)),
);

const anonymousResults = await searchDiscoverableCircles({ query: "rarefind" });
assert.deepEqual(
    new Set(anonymousResults.map((circle) => circle.name)),
    new Set(["Rarefind Public", "Rarefind Legacy"]),
    "anonymous discovery excludes every secret circle",
);
const outsiderResults = await searchDiscoverableCircles({ query: "rarefind", viewerDid: "did:outsider" });
assert.deepEqual(
    new Set(outsiderResults.map((circle) => circle.name)),
    new Set(["Rarefind Public", "Rarefind Legacy"]),
    "outsider discovery excludes every secret circle",
);
const memberResults = await searchDiscoverableCircles({ query: "rarefind", viewerDid: "did:member" });
assert.deepEqual(
    new Set(memberResults.map((circle) => circle.name)),
    new Set(["Rarefind Public", "Rarefind Legacy", "Rarefind Active Secret", "Rarefind Paused Secret"]),
    "canonical members discover active and paused secret circles only",
);
assert.equal(memberResults.find((circle) => circle.visibility === "secret")?.visibility, "secret");

const hiddenSecrets = Array.from({ length: 120 }, (_, index) =>
    normalCircle({ name: `Needle Secret ${index}`, visibility: "secret" }),
);
mockCircleRecords = [...hiddenSecrets, normalCircle({ name: "Needle Public", visibility: "public" })];
const limited = await searchDiscoverableCircles({ query: "needle", limit: 1 });
assert.deepEqual(
    limited.map((circle) => circle.name),
    ["Needle Public"],
    "authorization precedes candidate limiting",
);

const searchablePublicUser = userProfile({
    name: "Rarefind Person",
    handle: "rarefind-person",
    accountStatus: "active",
    email: "private@example.invalid",
    officialEmail: "official@example.invalid",
    bookmarkedCircles: ["private-bookmark"],
    pinnedCircles: ["private-pin"],
    hiddenCancelledEventIds: ["private-event"],
    metadata: { private: true },
    accessRules: { module: { private: ["owner"] } },
    location: { ...completeLocation, precision: 2 } as Circle["location"],
    picture: {
        url: "https://example.invalid/avatar.png",
        fileName: "avatar.png",
        privateMetadata: "private",
    } as Circle["picture"],
    offers: {
        text: "rarefind public offer",
        skills: ["rarefind"],
        visibility: "public",
        privateMetadata: "private",
    } as Circle["offers"],
    engagements: {
        text: "Public engagement",
        interests: ["Community"],
        visibility: "public",
        inviteEnabled: true,
        privateMetadata: "private",
    } as Circle["engagements"],
    needs: {
        text: "Public need",
        tags: ["Help"],
        visibility: "public",
        offerHelpEnabled: true,
        privateMetadata: "private",
    } as Circle["needs"],
});
const privateNestedOnly = userProfile({
    name: "Unrelated Person",
    handle: "unrelated-person",
    accountStatus: "active",
    offers: { text: "rarefind private offer", skills: ["rarefind"], visibility: "private" },
    engagements: {
        text: "rarefind member engagement",
        interests: ["rarefind"],
        visibility: "members",
        inviteEnabled: true,
    },
    needs: { text: "rarefind missing visibility", tags: ["rarefind"] } as Circle["needs"],
});
const malformedNested = userProfile({
    name: "Another Unrelated Person",
    handle: "another-unrelated-person",
    accountStatus: "active",
    needs: { text: "rarefind malformed visibility", visibility: "unknown" } as unknown as Circle["needs"],
});
const rejectedUser = userProfile({ name: "Rarefind Rejected", accountStatus: "rejected" });
const hiddenLocation = userProfile({
    name: "Location Private Person",
    accountStatus: "active",
    location: { precision: 0, country: "Public country", city: "Rarefind Hidden City" },
});
mockCircleRecords = [privateNestedOnly, malformedNested, rejectedUser, hiddenLocation, searchablePublicUser];
findCalls.length = 0;
const privacyResults = await searchDiscoverableCircles({ query: "rarefind" });
assert.deepEqual(
    privacyResults.map((circle) => circle.name),
    ["Rarefind Person"],
);
assert.deepEqual((findCalls[0].options as { projection: unknown }).projection, PUBLIC_SEARCH_CIRCLE_PROJECTION);
const serializedQuery = JSON.stringify(findCalls[0].query);
for (const field of ["offers.visibility", "engagements.visibility", "needs.visibility"]) {
    assert.ok(serializedQuery.includes(`"${field}":"public"`));
}
assert.ok(serializedQuery.includes('"accountStatus":{"$ne":"rejected"}'));
assert.ok(serializedQuery.includes('"location.precision":{"$in":[2,3,4]}'));
for (const field of [
    "email",
    "officialEmail",
    "bookmarkedCircles",
    "pinnedCircles",
    "hiddenCancelledEventIds",
    "metadata",
    "accessRules",
]) {
    assert.equal(field in privacyResults[0], false, `real search omits ${field}`);
}
assert.deepEqual(privacyResults[0].offers, {
    text: "rarefind public offer",
    skills: ["rarefind"],
    visibility: "public",
});
assert.deepEqual(privacyResults[0].engagements, {
    text: "Public engagement",
    interests: ["Community"],
    visibility: "public",
    inviteEnabled: true,
});
assert.deepEqual(privacyResults[0].needs, {
    text: "Public need",
    tags: ["Help"],
    visibility: "public",
    offerHelpEnabled: true,
});
assert.deepEqual(privacyResults[0].picture, {
    url: "https://example.invalid/avatar.png",
    fileName: "avatar.png",
});

mockCircleRecords = [privateNestedOnly, malformedNested, hiddenLocation];
assert.deepEqual(
    await searchDiscoverableCircles({ query: "rarefind" }),
    [],
    "private nested and over-precision location data cannot affect matching, ranking, or counts",
);

mockCircleRecords = [
    searchablePublicUser,
    userProfile({
        name: "Another Person",
        handle: "another-person",
        accountStatus: "active",
        offers: { text: "We mention rarefind in a longer public offer", visibility: "public" },
    }),
];
assert.deepEqual(
    (await searchDiscoverableCircles({ query: "rarefind" })).map((circle) => circle.name),
    ["Rarefind Person", "Another Person"],
    "public exact-name ranking remains above a public nested contains match",
);

console.log("search privacy and Secret Circle orchestration tests passed");
