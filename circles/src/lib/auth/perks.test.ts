import { describe, expect, test } from "bun:test";
import { canInteract, canSeeFoundingBadge, hasContributorPerks } from "./perks";

describe("hasContributorPerks", () => {
    test("is false for a missing user", () => {
        expect(hasContributorPerks(null)).toBe(false);
        expect(hasContributorPerks(undefined)).toBe(false);
    });

    test("is false for an empty user", () => {
        expect(hasContributorPerks({})).toBe(false);
    });

    test("is true for a paid member with an active account", () => {
        expect(hasContributorPerks({ accountStatus: "active", isMember: true })).toBe(true);
    });

    test("is true for a founding member with an active account", () => {
        expect(hasContributorPerks({ accountStatus: "active", isFoundingMember: true })).toBe(true);
    });

    test("is false for an active account that is neither member nor founding member", () => {
        expect(hasContributorPerks({ accountStatus: "active", isMember: false, isFoundingMember: false })).toBe(false);
    });

    test.each(["pending_verification", "rejected", undefined] as const)(
        "withholds paid and founding perks when the account status is %s",
        (accountStatus) => {
            expect(hasContributorPerks({ accountStatus, isMember: true })).toBe(false);
            expect(hasContributorPerks({ accountStatus, isFoundingMember: true })).toBe(false);
        },
    );

    test("lets manualMember bypass the account status guard", () => {
        expect(hasContributorPerks({ manualMember: true })).toBe(true);
        expect(hasContributorPerks({ manualMember: true, accountStatus: "rejected" })).toBe(true);
    });

    test("requires manualMember to be exactly true", () => {
        expect(hasContributorPerks({ manualMember: false, accountStatus: "rejected" })).toBe(false);
        expect(hasContributorPerks({ manualMember: "yes" as unknown as boolean })).toBe(false);
    });

    test("requires isMember and isFoundingMember to be exactly true", () => {
        expect(hasContributorPerks({ accountStatus: "active", isMember: 1 as unknown as boolean })).toBe(false);
    });

    test("does not treat admins as having contributor perks", () => {
        expect(hasContributorPerks({ accountStatus: "active", isAdmin: true })).toBe(false);
    });
});

describe("canInteract", () => {
    test("is false for a missing user", () => {
        expect(canInteract(null)).toBe(false);
        expect(canInteract(undefined)).toBe(false);
        expect(canInteract({})).toBe(false);
    });

    test("is true for an active account", () => {
        expect(canInteract({ accountStatus: "active" })).toBe(true);
    });

    test.each(["pending_verification", "rejected"] as const)("is false for a %s account", (accountStatus) => {
        expect(canInteract({ accountStatus })).toBe(false);
    });

    test("is always true for admins regardless of account status", () => {
        expect(canInteract({ isAdmin: true })).toBe(true);
        expect(canInteract({ isAdmin: true, accountStatus: "rejected" })).toBe(true);
    });

    test("requires isAdmin to be exactly true", () => {
        expect(canInteract({ isAdmin: false, accountStatus: "rejected" })).toBe(false);
    });

    test("does not consider membership", () => {
        expect(canInteract({ isMember: true, manualMember: true, isFoundingMember: true })).toBe(false);
    });
});

describe("canSeeFoundingBadge", () => {
    test("is true only for a founding member viewing their own profile", () => {
        expect(canSeeFoundingBadge("did:me", { did: "did:me", isFoundingMember: true })).toBe(true);
    });

    test("is false when viewing someone else's profile", () => {
        expect(canSeeFoundingBadge("did:me", { did: "did:other", isFoundingMember: true })).toBe(false);
    });

    test("is false for a non-founding member viewing their own profile", () => {
        expect(canSeeFoundingBadge("did:me", { did: "did:me", isFoundingMember: false })).toBe(false);
        expect(canSeeFoundingBadge("did:me", { did: "did:me" })).toBe(false);
    });

    test("is false when the viewer is not signed in", () => {
        for (const viewer of [null, undefined, ""]) {
            expect(canSeeFoundingBadge(viewer, { did: "did:me", isFoundingMember: true })).toBe(false);
        }
    });

    test("is false when the target is missing or has no did", () => {
        expect(canSeeFoundingBadge("did:me", null)).toBe(false);
        expect(canSeeFoundingBadge("did:me", undefined)).toBe(false);
        expect(canSeeFoundingBadge("did:me", { isFoundingMember: true } as never)).toBe(false);
        expect(canSeeFoundingBadge("did:me", { did: "", isFoundingMember: true })).toBe(false);
    });

    test("does not equate an anonymous viewer with a target lacking a did", () => {
        expect(canSeeFoundingBadge(undefined, { did: undefined, isFoundingMember: true } as never)).toBe(false);
    });
});
