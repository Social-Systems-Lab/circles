import { describe, expect, test } from "bun:test";
import {
    buildUnverifiedUserUpdate,
    buildVerifiedUserSet,
    canBypassVerificationRestrictions,
    canInteract,
    canPerformRestrictedAction,
    getInteractionRequiredMessage,
    getRestrictedActionMessage,
    isVerifiedUser,
} from "./verification";

describe("isVerifiedUser", () => {
    test("is false for missing or empty users", () => {
        expect(isVerifiedUser(null)).toBe(false);
        expect(isVerifiedUser(undefined)).toBe(false);
        expect(isVerifiedUser({})).toBe(false);
    });

    test("is true when the verification status is verified", () => {
        expect(isVerifiedUser({ verificationStatus: "verified" })).toBe(true);
    });

    test("is true when the legacy isVerified flag is set", () => {
        expect(isVerifiedUser({ isVerified: true })).toBe(true);
    });

    test.each(["unverified", "pending"] as const)("is false for a %s status without the legacy flag", (status) => {
        expect(isVerifiedUser({ verificationStatus: status })).toBe(false);
        expect(isVerifiedUser({ verificationStatus: status, isVerified: false })).toBe(false);
    });

    test("prefers either signal, so a pending status with the legacy flag counts as verified", () => {
        expect(isVerifiedUser({ verificationStatus: "pending", isVerified: true })).toBe(true);
    });

    test("does not treat admins or humans as verified", () => {
        expect(isVerifiedUser({ isAdmin: true, isHuman: true })).toBe(false);
    });
});

describe("canBypassVerificationRestrictions", () => {
    test("is true only for admins", () => {
        expect(canBypassVerificationRestrictions({ isAdmin: true })).toBe(true);
        expect(canBypassVerificationRestrictions({ isAdmin: false })).toBe(false);
        expect(canBypassVerificationRestrictions({ isVerified: true, isHuman: true })).toBe(false);
        expect(canBypassVerificationRestrictions(null)).toBe(false);
        expect(canBypassVerificationRestrictions(undefined)).toBe(false);
    });
});

describe("canPerformRestrictedAction", () => {
    test("is true for admins and verified users", () => {
        expect(canPerformRestrictedAction({ isAdmin: true })).toBe(true);
        expect(canPerformRestrictedAction({ verificationStatus: "verified" })).toBe(true);
        expect(canPerformRestrictedAction({ isVerified: true })).toBe(true);
    });

    test("is false for humans who are not verified", () => {
        expect(canPerformRestrictedAction({ isHuman: true })).toBe(false);
        expect(canPerformRestrictedAction({ verificationStatus: "pending" })).toBe(false);
    });

    test("is false for missing users", () => {
        expect(canPerformRestrictedAction(null)).toBe(false);
        expect(canPerformRestrictedAction(undefined)).toBe(false);
        expect(canPerformRestrictedAction({})).toBe(false);
    });
});

describe("canInteract", () => {
    test("is true for human-verified users", () => {
        expect(canInteract({ isHuman: true })).toBe(true);
    });

    test("is true for admins and admin-verified users", () => {
        expect(canInteract({ isAdmin: true })).toBe(true);
        expect(canInteract({ verificationStatus: "verified" })).toBe(true);
        expect(canInteract({ isVerified: true })).toBe(true);
    });

    test("is false for pending or unverified users who are not human-verified", () => {
        expect(canInteract({ verificationStatus: "pending" })).toBe(false);
        expect(canInteract({ verificationStatus: "unverified", isHuman: false })).toBe(false);
    });

    test("is false for missing users", () => {
        expect(canInteract(null)).toBe(false);
        expect(canInteract(undefined)).toBe(false);
        expect(canInteract({})).toBe(false);
    });
});

describe("messages", () => {
    test("getRestrictedActionMessage names the verification requirement", () => {
        expect(getRestrictedActionMessage("post")).toBe("You need to verify your account before you can post.");
    });

    test("getInteractionRequiredMessage names the human verification requirement", () => {
        expect(getInteractionRequiredMessage("comment")).toBe(
            "You need to complete human verification before you can comment.",
        );
    });

    test("interpolate the action verbatim, including an empty action", () => {
        expect(getRestrictedActionMessage("")).toBe("You need to verify your account before you can .");
        expect(getInteractionRequiredMessage("do <b>x</b>")).toBe(
            "You need to complete human verification before you can do <b>x</b>.",
        );
    });
});

describe("buildVerifiedUserSet", () => {
    test("marks the user as verified by the given verifier at the given time", () => {
        const now = new Date("2026-01-01T00:00:00.000Z");
        expect(buildVerifiedUserSet("did:admin", now)).toEqual({
            isVerified: true,
            verificationStatus: "verified",
            verifiedAt: now,
            verifiedBy: "did:admin",
        });
    });

    test("defaults the verification time to now", () => {
        const before = Date.now();
        const { verifiedAt } = buildVerifiedUserSet("did:admin");
        const after = Date.now();

        expect(verifiedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(verifiedAt.getTime()).toBeLessThanOrEqual(after);
    });

    test("uses the provided date instance directly", () => {
        const now = new Date();
        expect(buildVerifiedUserSet("did:admin", now).verifiedAt).toBe(now);
    });

    test("produces a set that isVerifiedUser recognizes", () => {
        expect(isVerifiedUser(buildVerifiedUserSet("did:admin"))).toBe(true);
    });
});

describe("buildUnverifiedUserUpdate", () => {
    test("resets verification and clears the audit fields", () => {
        expect(buildUnverifiedUserUpdate()).toEqual({
            $set: { isVerified: false, verificationStatus: "unverified" },
            $unset: { verifiedAt: "", verifiedBy: "" },
        });
    });

    test("returns a fresh object on every call", () => {
        expect(buildUnverifiedUserUpdate()).not.toBe(buildUnverifiedUserUpdate());
        expect(buildUnverifiedUserUpdate().$set).not.toBe(buildUnverifiedUserUpdate().$set);
    });

    test("produces a set that isVerifiedUser no longer recognizes", () => {
        expect(isVerifiedUser(buildUnverifiedUserUpdate().$set)).toBe(false);
    });
});
