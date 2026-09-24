import assert from "node:assert/strict";
// @ts-expect-error Bun provides module mocking at runtime; this repository does not install Bun type declarations.
import { mock } from "bun:test";
import type { Circle } from "@/models/models";
import { buildSearchableTypeClauses, isSearchEligibleCircle } from "@/lib/data/search-visibility";
import { isMapVisibleCircle } from "@/lib/map-visibility";
import {
    buildPublicSearchLocation,
    buildPublicSearchResult,
    PUBLIC_SEARCH_CIRCLE_PROJECTION,
} from "@/lib/data/public-search-result";

let mockCircleRecords: Circle[] = [];
const findCalls: Array<{ query: unknown; options: unknown; limit?: number }> = [];
const mockCircles = {
    find(query: unknown, options: unknown) {
        const call: (typeof findCalls)[number] = { query, options };
        findCalls.push(call);
        return {
            limit(limit: number) {
                call.limit = limit;
                return this;
            },
            async toArray() {
                return mockCircleRecords.map((circle) => structuredClone(circle));
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
    Members: {},
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
    getDb: async () => ({}),
    ensureRequiredChatIndexes: async () => undefined,
}));

const userProfile = (overrides: Partial<Circle> = {}): Circle =>
    ({
        _id: "user-1",
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
        _id: "circle-1",
        circleType: "circle",
        name: "Normal Circle",
        handle: "normal-circle",
        publishStatus: "published",
        ...overrides,
    }) as Circle;

assert.equal(
    isSearchEligibleCircle(userProfile()),
    true,
    "incomplete unverified non-member personal profiles are search-eligible",
);
assert.equal(
    isSearchEligibleCircle(userProfile({ accountStatus: "rejected" })),
    false,
    "rejected user profiles are not search-eligible",
);
assert.equal(
    isSearchEligibleCircle(userProfile({ isVerified: true, isMember: true })),
    true,
    "complete or verified personal profiles remain search-eligible",
);
assert.equal(isSearchEligibleCircle(normalCircle()), true, "normal circle search eligibility is unchanged");
assert.equal(
    isSearchEligibleCircle(normalCircle({ circleType: undefined })),
    false,
    "circles still need a valid circle type",
);

const userTypeClauses = buildSearchableTypeClauses(["user"]);
assert.deepEqual(
    userTypeClauses,
    [{ circleType: "user" }],
    "user search query includes user profiles by type only, without verified or member requirements",
);
assert.deepEqual(
    buildSearchableTypeClauses(["circle", "project"]),
    [{ circleType: { $in: ["circle", "project"] } }],
    "normal circle/project search type clauses remain unchanged",
);
assert.equal(
    isMapVisibleCircle(userProfile()),
    false,
    "incomplete search-eligible user profiles remain map-ineligible without server map eligibility",
);

const publicResult = buildPublicSearchResult(
    userProfile({
        email: "private@example.invalid",
        officialEmail: "official@example.invalid",
        location: {
            precision: 2,
            country: "Public country",
            region: "Public region",
            city: "Public city",
            street: "Private street",
            lngLat: { lng: 12.3456, lat: 65.4321 },
        },
        bookmarkedCircles: ["private-bookmark"],
        pinnedCircles: ["private-pin"],
        hiddenCancelledEventIds: ["private-event"],
        metadata: { private: true },
        accessRules: { module: { private: ["owner"] } },
    }),
    1,
);

assert.equal("email" in publicResult, false, "public search omits private email");
assert.equal("officialEmail" in publicResult, false, "public search omits official email without a public contract");
assert.equal("bookmarkedCircles" in publicResult, false, "public search omits bookmarks");
assert.equal("pinnedCircles" in publicResult, false, "public search omits pins");
assert.equal("hiddenCancelledEventIds" in publicResult, false, "public search omits cancellation preferences");
assert.equal("metadata" in publicResult, false, "public search omits owner metadata");
assert.equal("accessRules" in publicResult, false, "public search omits access rules");
assert.deepEqual(
    publicResult.location,
    {
        precision: 2,
        country: "Public country",
        region: "Public region",
        city: "Public city",
    },
    "public search respects city-level location precision",
);

const completeLocation = {
    precision: 4,
    country: "Public country",
    region: "Public region",
    city: "Public city",
    street: "Public street",
    lngLat: { lng: 12.3456, lat: 65.4321, internalGrid: "private" },
    address: "Historical private address",
    postalCode: "Private postal code",
    coordinates: [12.3456, 65.4321],
    metadata: { private: true },
};

const locationCases = [
    {
        label: "country",
        value: { ...completeLocation, precision: 0 },
        expected: { precision: 0, country: "Public country" },
    },
    {
        label: "region",
        value: { ...completeLocation, precision: 1 },
        expected: { precision: 1, country: "Public country", region: "Public region" },
    },
    {
        label: "city",
        value: { ...completeLocation, precision: 2 },
        expected: {
            precision: 2,
            country: "Public country",
            region: "Public region",
            city: "Public city",
        },
    },
    {
        label: "street",
        value: { ...completeLocation, precision: 3 },
        expected: {
            precision: 3,
            country: "Public country",
            region: "Public region",
            city: "Public city",
            street: "Public street",
        },
    },
    {
        label: "exact",
        value: completeLocation,
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

for (const { label, value, expected } of locationCases) {
    assert.deepEqual(buildPublicSearchLocation(value), expected, `${label} precision exposes only authorized fields`);
}

for (const { label, value } of [
    { label: "missing precision", value: { ...completeLocation, precision: undefined } },
    { label: "null precision", value: { ...completeLocation, precision: null } },
    { label: "NaN precision", value: { ...completeLocation, precision: Number.NaN } },
    { label: "string precision", value: { ...completeLocation, precision: "4" } },
    { label: "negative precision", value: { ...completeLocation, precision: -1 } },
    { label: "too-large precision", value: { ...completeLocation, precision: 5 } },
    { label: "fractional precision", value: { ...completeLocation, precision: 2.5 } },
    { label: "infinite precision", value: { ...completeLocation, precision: Number.POSITIVE_INFINITY } },
    { label: "null location", value: null },
]) {
    assert.equal(buildPublicSearchLocation(value), undefined, `${label} fails closed`);
}

assert.deepEqual(
    buildPublicSearchLocation({ ...completeLocation, precision: 2 }),
    { precision: 2, country: "Public country", region: "Public region", city: "Public city" },
    "precise source data with city-only disclosure omits street, coordinates, and historical keys",
);

const { searchDiscoverableCircles } = await import("@/lib/data/search");

const searchablePublicUser = userProfile({
    _id: "public-user",
    name: "Rarefind Person",
    handle: "rarefind-person",
    accountStatus: "active",
    email: "private@example.invalid",
    officialEmail: "official@example.invalid",
    location: { ...completeLocation, precision: 2 } as Circle["location"],
    picture: {
        url: "https://example.invalid/avatar.png",
        fileName: "avatar.png",
        privateMetadata: "must-not-survive",
    } as Circle["picture"],
    images: [
        {
            name: "Public image",
            type: "image/png",
            fileInfo: { url: "https://example.invalid/image.png", internalPath: "/private" },
            privateMetadata: "must-not-survive",
        },
    ] as unknown as Circle["images"],
    socialLinks: [
        { platform: "website", url: "https://example.invalid", privateMetadata: "must-not-survive" },
    ] as unknown as Circle["socialLinks"],
    offers: {
        text: "rarefind public offer",
        skills: ["rarefind"],
        visibility: "public",
        privateMetadata: "must-not-survive",
    } as Circle["offers"],
    engagements: {
        text: "Public engagement",
        interests: ["Community"],
        visibility: "public",
        inviteEnabled: true,
    },
    needs: { text: "Public need", tags: ["Help"], visibility: "public", offerHelpEnabled: true },
    bookmarkedCircles: ["private-bookmark"],
    pinnedCircles: ["private-pin"],
    hiddenCancelledEventIds: ["private-event"],
});

const privateNestedOnlyUser = userProfile({
    _id: "private-nested-user",
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
    needs: { text: "rarefind legacy need", tags: ["rarefind"] } as Circle["needs"],
});

const rejectedUser = userProfile({
    _id: "rejected-user",
    name: "Rarefind Rejected",
    handle: "rarefind-rejected",
    accountStatus: "rejected",
    offers: { text: "rarefind public rejected offer", skills: ["rarefind"], visibility: "public" },
});

const unknownVisibilityUser = userProfile({
    _id: "unknown-visibility-user",
    name: "Another Unrelated Person",
    handle: "another-unrelated-person",
    accountStatus: "active",
    needs: { text: "rarefind unknown need", tags: ["rarefind"], visibility: "unknown" } as unknown as Circle["needs"],
});

mockCircleRecords = [privateNestedOnlyUser, unknownVisibilityUser, rejectedUser, searchablePublicUser];
findCalls.length = 0;
const realSearchResults = await searchDiscoverableCircles({ query: "rarefind", limit: 10 });

assert.deepEqual(
    realSearchResults.map((result) => result._id),
    ["public-user"],
    "real search excludes private-only nested matches and rejected users",
);
assert.equal(findCalls.length, 1, "real search performs one MongoDB candidate query");
assert.deepEqual(
    (findCalls[0].options as { projection: unknown }).projection,
    PUBLIC_SEARCH_CIRCLE_PROJECTION,
    "real search uses the public search projection",
);
assert.equal(findCalls[0].limit, 120, "real search applies the candidate limit");

const serializedQuery = JSON.stringify(findCalls[0].query);
for (const nestedVisibilityField of ["offers.visibility", "engagements.visibility", "needs.visibility"]) {
    assert.ok(
        serializedQuery.includes(`"${nestedVisibilityField}":"public"`),
        `MongoDB candidate matching requires ${nestedVisibilityField}=public`,
    );
}
assert.ok(
    serializedQuery.includes('"accountStatus":{"$ne":"rejected"}'),
    "MongoDB candidate selection excludes rejected user accounts",
);
assert.ok(
    serializedQuery.includes('"location.precision":{"$in":[2,3,4]}'),
    "MongoDB city matching requires city-or-more-public location precision",
);

const [realPublicResult] = realSearchResults;
assert.equal(realPublicResult.name, "Rarefind Person", "public name survives real search serialization");
assert.deepEqual(
    realPublicResult.offers,
    { text: "rarefind public offer", skills: ["rarefind"], visibility: "public" },
    "public offer survives with only schema-authorized fields",
);
assert.deepEqual(
    realPublicResult.engagements,
    { text: "Public engagement", interests: ["Community"], visibility: "public", inviteEnabled: true },
    "public engagement survives with only schema-authorized fields",
);
assert.deepEqual(
    realPublicResult.needs,
    { text: "Public need", tags: ["Help"], visibility: "public", offerHelpEnabled: true },
    "public need survives with only schema-authorized fields",
);
assert.equal(realPublicResult.location?.city, "Public city", "authorized city survives");
assert.equal("street" in (realPublicResult.location || {}), false, "city precision omits street");
assert.equal("lngLat" in (realPublicResult.location || {}), false, "city precision omits exact coordinates");
for (const privateField of [
    "email",
    "officialEmail",
    "bookmarkedCircles",
    "pinnedCircles",
    "hiddenCancelledEventIds",
]) {
    assert.equal(privateField in realPublicResult, false, `real search omits ${privateField}`);
}
assert.deepEqual(
    realPublicResult.picture,
    { url: "https://example.invalid/avatar.png", fileName: "avatar.png" },
    "picture serialization strips unknown nested keys",
);
assert.deepEqual(
    realPublicResult.images,
    [{ name: "Public image", type: "image/png", fileInfo: { url: "https://example.invalid/image.png" } }],
    "media serialization strips unknown nested keys",
);
assert.deepEqual(
    realPublicResult.socialLinks,
    [{ platform: "website", url: "https://example.invalid" }],
    "social-link serialization strips unknown nested keys",
);

mockCircleRecords = [privateNestedOnlyUser, unknownVisibilityUser];
const privateOnlyResults = await searchDiscoverableCircles({ query: "rarefind", limit: 10 });
assert.deepEqual(privateOnlyResults, [], "private nested text cannot influence matching, ranking, or result counts");

mockCircleRecords = [
    userProfile({
        _id: "hidden-city-user",
        name: "Location Private Person",
        handle: "location-private-person",
        accountStatus: "active",
        location: {
            precision: 0,
            country: "Public country",
            city: "Hidden Rarefind City",
            lngLat: { lng: 12.3456, lat: 65.4321 },
        },
    }),
];
const hiddenLocationResults = await searchDiscoverableCircles({ query: "rarefind", limit: 10 });
assert.deepEqual(hiddenLocationResults, [], "location fields above public precision cannot influence discovery");

mockCircleRecords = [
    searchablePublicUser,
    userProfile({
        _id: "lower-ranked-public-user",
        name: "Another Person",
        handle: "another-person",
        accountStatus: "active",
        offers: { text: "We mention rarefind in a longer public offer", visibility: "public" },
    }),
];
const rankedResults = await searchDiscoverableCircles({ query: "rarefind", limit: 10 });
assert.deepEqual(
    rankedResults.map((result) => result._id),
    ["public-user", "lower-ranked-public-user"],
    "real search scoring ranks the exact public name match above a nested contains match",
);

console.log("search visibility tests passed");
