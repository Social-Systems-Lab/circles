import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { canParticipate } from "@/lib/profile-completion";
import { COMMUNITY_GUIDELINE_IDS, acceptedGuidelines, featureFixture, participatingUser } from "./fixtures";

describe("acceptedGuidelines", () => {
    test("accepts every community guideline at the given time", () => {
        const acceptedAt = new Date("2026-03-04T00:00:00.000Z");

        const guidelines = acceptedGuidelines(acceptedAt);

        expect(Object.keys(guidelines)).toEqual([...COMMUNITY_GUIDELINE_IDS]);
        for (const entry of Object.values(guidelines)) expect(entry).toEqual({ accepted: true, acceptedAt });
    });

    test("uses a fixed default time so fixtures are deterministic", () => {
        expect(acceptedGuidelines().truth.acceptedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    });

    test("lists the same guidelines the app requires", async () => {
        const { COMMUNITY_GUIDELINE_RULE_IDS } = await import("@/lib/community-guidelines");

        expect([...COMMUNITY_GUIDELINE_IDS]).toEqual([...COMMUNITY_GUIDELINE_RULE_IDS]);
    });
});

describe("participatingUser", () => {
    test("is a profile that is allowed to participate", () => {
        expect(canParticipate(participatingUser("did:user") as never)).toBe(true);
    });

    test("carries the did and a fresh id", () => {
        const first = participatingUser("did:a");
        const second = participatingUser("did:a");

        expect(first.did).toBe("did:a");
        expect(first._id).toBeInstanceOf(ObjectId);
        expect(first._id.equals(second._id)).toBe(false);
    });

    test("fails one requirement at a time when overridden", () => {
        expect(canParticipate(participatingUser("did:u", { isEmailVerified: false }) as never)).toBe(false);
        expect(canParticipate(participatingUser("did:u", { description: "" }) as never)).toBe(false);
        expect(canParticipate(participatingUser("did:u", { picture: { url: "/images/default-user-picture.png" } }) as never)).toBe(false);
        expect(canParticipate(participatingUser("did:u", { communityGuidelinesAcceptance: {} }) as never)).toBe(false);
    });

    test("lets overrides add fields", () => {
        expect((participatingUser("did:u", { isAdmin: true }) as Record<string, unknown>).isAdmin).toBe(true);
    });
});

describe("featureFixture", () => {
    test("is a members-only feed feature by default", () => {
        expect(featureFixture()).toEqual({ name: "Test feature", handle: "post", description: "", defaultUserGroups: ["members"], module: "feed" });
    });

    test("applies overrides", () => {
        expect(featureFixture({ handle: "view", defaultUserGroups: ["everyone"], needsToBeVerified: true })).toMatchObject({
            handle: "view",
            defaultUserGroups: ["everyone"],
            needsToBeVerified: true,
        });
    });
});
