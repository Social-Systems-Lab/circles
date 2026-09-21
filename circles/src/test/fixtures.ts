// Shared fixtures for tests that need realistic users, features and authorization inputs.

import { ObjectId } from "mongodb";
import type { Feature } from "@/models/models";

export const COMMUNITY_GUIDELINE_IDS = ["truth", "constructive", "respect", "privacy", "responsibility"] as const;

/** Community guidelines that were all accepted, as stored on a profile that has completed onboarding. */
export const acceptedGuidelines = (acceptedAt = new Date("2026-01-01T00:00:00.000Z")) =>
    Object.fromEntries(COMMUNITY_GUIDELINE_IDS.map((id) => [id, { accepted: true, acceptedAt }]));

/**
 * A personal profile that passes `canParticipate()`: verified email, a real picture, about text and accepted
 * guidelines. Override fields to make it fail one requirement at a time.
 */
export const participatingUser = (did: string, overrides: Record<string, unknown> = {}) => ({
    _id: new ObjectId(),
    did,
    circleType: "user",
    isEmailVerified: true,
    picture: { url: "/storage/users/pic.png" },
    description: "About me",
    communityGuidelinesAcceptance: acceptedGuidelines(),
    ...overrides,
});

/** A feature definition as used by the authorization checks. */
export const featureFixture = (overrides: Partial<Feature> = {}): Feature =>
    ({
        name: "Test feature",
        handle: "post",
        description: "",
        defaultUserGroups: ["members"],
        module: "feed",
        ...overrides,
    }) as Feature;
