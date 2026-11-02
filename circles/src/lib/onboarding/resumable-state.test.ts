import assert from "node:assert/strict";
import type { Circle } from "@/models/models";
import { createEmptyCommunityGuidelineAgreementState, COMMUNITY_GUIDELINE_RULE_IDS } from "@/lib/community-guidelines";
import { canParticipate } from "@/lib/profile-completion";
import {
    createInitialOnboardingState,
    getNextIncompleteOnboardingCard,
    getNextOnboardingCard,
    getOnboardingCardStatuses,
    getOnboardingNavigationTarget,
    getNextOnboardingCardInSequence,
    getPreviousOnboardingCard,
    isOnboardingCardId,
    ONBOARDING_CARDS,
} from "@/lib/onboarding/resumable-state";

const guidelines = createEmptyCommunityGuidelineAgreementState();
for (const rule of COMMUNITY_GUIDELINE_RULE_IDS) {
    guidelines[rule] = { accepted: true, acceptedAt: new Date("2026-01-01T00:00:00.000Z") };
}

const profile = (overrides: Partial<Circle> = {}): Partial<Circle> => ({
    circleType: "user",
    isEmailVerified: true,
    description: "Hello, I'm here to meet the community.",
    communityGuidelinesAcceptance: guidelines,
    completedOnboardingSteps: ["welcome", "terms", "member", "final"],
    ...overrides,
});

const initialTime = new Date("2026-05-10T12:00:00.000Z");
const emptyProfile = profile({ isEmailVerified: false, description: "", communityGuidelinesAcceptance: undefined });
const initial = createInitialOnboardingState(emptyProfile, initialTime);
assert.equal(initial.version, 1);
assert.equal(initial.currentCard, "email-verification");
assert.equal(initial.startedAt, initialTime);
assert.equal(initial.lastSeenAt, initialTime);
assert.deepEqual(initial.skippedCards, []);
assert.equal(initial.completionAcknowledgedAt, null);
assert.equal("participationReady" in initial, false, "navigation state does not duplicate readiness truth");

const fullProfile = profile({
    picture: { url: "/storage/members/photo.png" },
    location: { precision: 2, city: "Cape Town", lngLat: { lng: 18.4, lat: -33.9 } },
});
const completeStatuses = getOnboardingCardStatuses(fullProfile, true);
assert.equal(
    completeStatuses.every((step) => step.complete),
    true,
);
assert.equal(canParticipate(fullProfile), true, "participation policy remains based on canonical profile fields");

const participationMissing = profile({ picture: undefined, location: undefined });
const statuses = getOnboardingCardStatuses(participationMissing);
assert.deepEqual(
    statuses.filter((step) => step.kind === "participation").map((step) => [step.id, step.complete]),
    [
        ["email-verification", true],
        ["introduction", true],
        ["community-guidelines", true],
    ],
);
assert.deepEqual(
    statuses.filter((step) => step.kind === "optional").map((step) => [step.id, step.complete]),
    [
        ["location", false],
        ["profile-photo", false],
        ["proof-of-humanity", false],
    ],
);
assert.equal(canParticipate(participationMissing), true, "photo and location remain optional for participation");

const incompleteProfile = profile({ description: "", picture: undefined, location: undefined });
assert.equal(getNextIncompleteOnboardingCard(incompleteProfile), "introduction");
assert.equal(
    getNextIncompleteOnboardingCard(incompleteProfile, ["introduction"]),
    "location",
    "skipping advances to the next unskipped incomplete card",
);
assert.equal(
    getNextOnboardingCard("introduction", incompleteProfile, ["introduction"]),
    "location",
    "forward navigation advances through incomplete cards",
);
assert.equal(
    getPreviousOnboardingCard("proof-of-humanity"),
    "profile-photo",
    "back from the final card reaches the previous card even when it is complete",
);
assert.equal(getPreviousOnboardingCard("email-verification"), null, "first card has no previous card");
assert.equal(getNextOnboardingCardInSequence("introduction"), "community-guidelines");
assert.equal(getNextOnboardingCardInSequence("proof-of-humanity"), null);

const resumedState = { ...initial, currentCard: "location" as const, skippedCards: ["introduction" as const] };
const stateReadByAnotherDevice = structuredClone(resumedState);
assert.equal(
    getOnboardingNavigationTarget(undefined, incompleteProfile, stateReadByAnotherDevice),
    "location",
    "a second device resumes from the persisted current card and skips",
);
assert.equal(
    getOnboardingNavigationTarget("location", incompleteProfile, resumedState),
    "location",
    "direct links can open an incomplete step",
);
assert.equal(
    getOnboardingNavigationTarget("introduction", incompleteProfile, resumedState),
    "introduction",
    "direct links can revisit a previously skipped incomplete step",
);
assert.equal(
    getOnboardingNavigationTarget("introduction", fullProfile, resumedState),
    "introduction",
    "direct links can reopen a completed step for review or editing",
);
assert.equal(
    getOnboardingNavigationTarget("profile-photo", fullProfile, resumedState),
    "profile-photo",
    "navigation from the final card can return to a completed optional step",
);
assert.equal(
    getOnboardingCardStatuses(incompleteProfile).find((step) => step.id === "introduction")?.complete,
    false,
    "skipping required cards does not mark canonical requirements complete",
);
assert.equal(isOnboardingCardId("location"), true);
assert.equal(isOnboardingCardId("not-a-card"), false);
assert.equal(ONBOARDING_CARDS.length, 6);

assert.deepEqual(
    fullProfile.completedOnboardingSteps,
    ["welcome", "terms", "member", "final"],
    "historical onboarding markers remain untouched",
);

console.log("resumable onboarding state tests passed");
