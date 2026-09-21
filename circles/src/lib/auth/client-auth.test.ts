import { describe, expect, test } from "bun:test";
import type { Circle, MemberDisplay, UserPrivate } from "@/models/models";
import { featureFixture, participatingUser } from "@/test/fixtures";
import { features, maxAccessLevel } from "../data/constants";
import {
    getEnabledModules,
    getMemberAccessLevel,
    hasHigherAccess,
    isAuthorized,
    isModuleEnabled,
} from "./client-auth";

const circle = (overrides: Record<string, unknown> = {}) =>
    ({
        _id: "circle-1",
        createdBy: "did:owner",
        userGroups: [
            { handle: "admins", accessLevel: 1 },
            { handle: "moderators", accessLevel: 2 },
            { handle: "members", accessLevel: 3 },
        ],
        ...overrides,
    }) as unknown as Circle;

const member = (userGroups?: string[]) => ({ userGroups }) as unknown as MemberDisplay;

// A user that passes canParticipate(), belonging to `circle-1` with the given groups.
const user = (userGroups: string[] | undefined, overrides: Record<string, unknown> = {}) =>
    ({
        ...participatingUser("did:user"),
        _id: "user-1",
        memberships: userGroups ? [{ circleId: "circle-1", userGroups }] : [],
        ...overrides,
    }) as unknown as UserPrivate;

describe("getMemberAccessLevel", () => {
    test("is the maximum level when there is no user", () => {
        expect(getMemberAccessLevel(undefined, circle())).toBe(maxAccessLevel);
    });

    test("reads groups from the user's membership of the circle", () => {
        expect(getMemberAccessLevel(user(["moderators"]), circle())).toBe(2);
    });

    test("ignores memberships of other circles", () => {
        const stranger = user(undefined, { memberships: [{ circleId: "other", userGroups: ["admins"] }] });

        expect(getMemberAccessLevel(stranger, circle())).toBe(maxAccessLevel);
    });

    test("reads groups directly from a member display object", () => {
        expect(getMemberAccessLevel(member(["admins", "members"]), circle())).toBe(1);
    });

    test("is the maximum level without groups", () => {
        expect(getMemberAccessLevel(member([]), circle())).toBe(maxAccessLevel);
        expect(getMemberAccessLevel(member(undefined), circle())).toBe(maxAccessLevel);
        expect(getMemberAccessLevel(user(undefined, { memberships: undefined }), circle())).toBe(maxAccessLevel);
    });

    test("uses the lowest (most powerful) level among several groups", () => {
        expect(getMemberAccessLevel(member(["members", "moderators"]), circle())).toBe(2);
    });

    test("treats groups unknown to the circle as the maximum level", () => {
        expect(getMemberAccessLevel(member(["ghost"]), circle())).toBe(maxAccessLevel);
        expect(getMemberAccessLevel(member(["ghost", "members"]), circle())).toBe(3);
        expect(getMemberAccessLevel(member(["admins"]), circle({ userGroups: undefined }))).toBe(maxAccessLevel);
    });
});

describe("hasHigherAccess", () => {
    test("is false when there is no member to compare against", () => {
        expect(hasHigherAccess(user(["admins"]), null, circle(), true)).toBe(false);
    });

    test("is true when the user's level is strictly lower (more powerful)", () => {
        expect(hasHigherAccess(user(["admins"]), member(["members"]), circle(), false)).toBe(true);
    });

    test("is false when the user's level is higher (less powerful)", () => {
        expect(hasHigherAccess(user(["members"]), member(["admins"]), circle(), false)).toBe(false);
        expect(hasHigherAccess(user(["members"]), member(["admins"]), circle(), true)).toBe(false);
    });

    test("equal levels only count when same-level access is accepted", () => {
        expect(hasHigherAccess(user(["moderators"]), member(["moderators"]), circle(), false)).toBe(false);
        expect(hasHigherAccess(user(["moderators"]), member(["moderators"]), circle(), true)).toBe(true);
    });

    test("treats a missing user as the least powerful", () => {
        expect(hasHigherAccess(undefined, member(["members"]), circle(), false)).toBe(false);
        expect(hasHigherAccess(undefined, member([]), circle(), true)).toBe(true);
    });
});

describe("isAuthorized", () => {
    test("denies when the circle has no access rules at all", () => {
        expect(isAuthorized(user(["members"]), circle(), featureFixture())).toBe(false);
    });

    test("denies anonymous users when everyone is not allowed", () => {
        expect(isAuthorized(undefined, circle({ accessRules: { feed: { post: ["members"] } } }), featureFixture())).toBe(false);
    });

    test("allows everyone when the circle rule lists everyone", () => {
        const rules = circle({ accessRules: { feed: { post: ["everyone"] } } });

        expect(isAuthorized(undefined, rules, featureFixture())).toBe(true);
        expect(isAuthorized(user(undefined), rules, featureFixture())).toBe(true);
    });

    test("allows members in one of the rule's groups", () => {
        const rules = circle({ accessRules: { feed: { post: ["admins", "members"] } } });

        expect(isAuthorized(user(["members"]), rules, featureFixture())).toBe(true);
    });

    test("denies members outside the rule's groups", () => {
        const rules = circle({ accessRules: { feed: { post: ["admins"] } } });

        expect(isAuthorized(user(["members"]), rules, featureFixture())).toBe(false);
    });

    test("denies users who are not members of the circle", () => {
        const rules = circle({ accessRules: { feed: { post: ["members"] } } });

        expect(isAuthorized(user(undefined), rules, featureFixture())).toBe(false);
    });

    test("an empty rule denies everyone", () => {
        expect(isAuthorized(user(["admins"]), circle({ accessRules: { feed: { post: [] } } }), featureFixture())).toBe(false);
    });

    describe("when the circle has no rule for the module or feature", () => {
        test("falls back to the built-in default groups of the feature", () => {
            const view = features.feed.view;
            const withoutModule = circle({ accessRules: { tasks: {} } });
            const withoutFeature = circle({ accessRules: { feed: {} } });

            expect(isAuthorized(undefined, withoutModule, view)).toBe(true);
            expect(isAuthorized(undefined, withoutFeature, view)).toBe(true);
        });

        test("checks membership against the built-in default groups", () => {
            const rules = circle({ accessRules: {} });
            const adminsOnly = features.general.edit_lower_user_groups;
            const admin = user(["admins"]);
            const memberOnly = user(["members"]);

            expect(adminsOnly.defaultUserGroups).toEqual(["admins", "moderators"]);
            expect(isAuthorized(admin, rules, adminsOnly)).toBe(true);
            expect(isAuthorized(memberOnly, rules, adminsOnly)).toBe(false);
            expect(isAuthorized(user(undefined), rules, adminsOnly)).toBe(false);
        });

        test("denies when the feature is not part of the built-in feature table", () => {
            const rules = circle({ accessRules: {} });

            expect(isAuthorized(user(["admins"]), rules, featureFixture({ module: "nonexistent", handle: "x" }))).toBe(false);
            expect(isAuthorized(user(["admins"]), rules, featureFixture({ module: "feed", handle: "nonexistent" }))).toBe(false);
        });

        test("ignores the group list carried on the feature object itself", () => {
            const rules = circle({ accessRules: {} });

            expect(isAuthorized(user(["members"]), rules, featureFixture({ module: "nonexistent", defaultUserGroups: ["members"] }))).toBe(false);
        });
    });

    describe("features that require participation", () => {
        const guarded = featureFixture({ needsToBeVerified: true });
        const rules = circle({ accessRules: { feed: { post: ["members"] } } });

        test("denies members who cannot participate", () => {
            expect(isAuthorized(user(["members"], { isEmailVerified: false }), rules, guarded)).toBe(false);
        });

        test("denies anonymous visitors even when the rule would allow everyone", () => {
            const open = circle({ accessRules: { feed: { post: ["everyone"] } } });

            expect(isAuthorized(undefined, open, guarded)).toBe(false);
        });

        test("allows participating members", () => {
            expect(isAuthorized(user(["members"]), rules, guarded)).toBe(true);
        });

        test("lets admins skip the participation requirement", () => {
            expect(isAuthorized(user(["members"], { isAdmin: true, isEmailVerified: false }), rules, guarded)).toBe(true);
        });

        test("lets someone edit their own settings before completing their profile", () => {
            const own = circle({ _id: "user-1", accessRules: { settings: { edit: ["members"] } } });
            const settings = featureFixture({ module: "settings", handle: "edit", needsToBeVerified: true });
            const incomplete = user(undefined, {
                isEmailVerified: false,
                memberships: [{ circleId: "user-1", userGroups: ["members"] }],
            });

            expect(isAuthorized(incomplete, own, settings)).toBe(true);
        });

        test("lets the creator of a circle edit its settings before completing their profile", () => {
            const created = circle({ createdBy: "did:user", accessRules: { settings: { edit: ["members"] } } });
            const settings = featureFixture({ module: "settings", handle: "edit", needsToBeVerified: true });

            expect(isAuthorized(user(["members"], { isEmailVerified: false }), created, settings)).toBe(true);
        });

        test("does not extend the settings exemption to other modules", () => {
            const created = circle({ createdBy: "did:user", accessRules: { feed: { post: ["members"] } } });

            expect(isAuthorized(user(["members"], { isEmailVerified: false }), created, guarded)).toBe(false);
        });

        test("does not apply the exemption to anonymous users of a circle with a creator", () => {
            const created = circle({ createdBy: "did:owner", accessRules: { settings: { edit: ["everyone"] } } });
            const settings = featureFixture({ module: "settings", handle: "edit", needsToBeVerified: true });

            expect(isAuthorized(undefined, created, settings)).toBe(false);
        });

        // `user?.did === circle.createdBy` is `undefined === undefined` for an anonymous viewer of a
        // circle that has no createdBy, so the exemption currently applies to them. Pinned as-is.
        test("currently applies the exemption to anonymous users when the circle has no creator", () => {
            const noCreator = circle({ createdBy: undefined, accessRules: { settings: { edit: ["everyone"] } } });
            const settings = featureFixture({ module: "settings", handle: "edit", needsToBeVerified: true });

            expect(isAuthorized(undefined, noCreator, settings)).toBe(true);
        });
    });
});

describe("isModuleEnabled", () => {
    test("is true for a module listed in enabledModules", () => {
        expect(isModuleEnabled(circle({ enabledModules: ["home", "feed"] }), "feed")).toBe(true);
    });

    test("is false for a module that is not listed", () => {
        expect(isModuleEnabled(circle({ enabledModules: ["home"] }), "feed")).toBe(false);
    });

    test("is false when no modules are enabled or the list is missing", () => {
        expect(isModuleEnabled(circle({ enabledModules: [] }), "home")).toBe(false);
        expect(isModuleEnabled(circle({ enabledModules: undefined }), "home")).toBe(false);
    });

    test("matches module handles exactly", () => {
        expect(isModuleEnabled(circle({ enabledModules: ["homepage"] }), "home")).toBe(false);
    });
});

describe("getEnabledModules", () => {
    test("returns the enabled modules", () => {
        const enabledModules = ["home", "feed"];

        expect(getEnabledModules(circle({ enabledModules }))).toBe(enabledModules);
    });

    test("returns an empty array when none are enabled or the list is missing", () => {
        expect(getEnabledModules(circle({ enabledModules: [] }))).toEqual([]);
        expect(getEnabledModules(circle({ enabledModules: undefined }))).toEqual([]);
    });
});
