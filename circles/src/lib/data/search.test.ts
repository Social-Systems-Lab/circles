import assert from "node:assert/strict";
import type { Circle } from "@/models/models";
import { buildSearchableTypeClauses, isSearchEligibleCircle } from "@/lib/data/search-visibility";
import { isMapVisibleCircle } from "@/lib/map-visibility";

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

console.log("search visibility tests passed");
