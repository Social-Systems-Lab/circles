import assert from "node:assert/strict";
import type { Circle } from "@/models/models";
import {
    canParticipate,
    hasProfileAboutText,
    hasRealProfileImage,
    hasRealProfileImageUrl,
    isProfileComplete,
} from "@/lib/profile-completion";
import { getProfileCompletionChecklistState } from "@/lib/profile-completion-checklist";
import { isMapVisibleCircle, isServerDerivedMapVisibleCircle, markMapEligiblePersonalProfile } from "@/lib/map-visibility";
import { COMMUNITY_GUIDELINE_RULE_IDS, createEmptyCommunityGuidelineAgreementState } from "@/lib/community-guidelines";

const completedGuidelines = () => {
    const state = createEmptyCommunityGuidelineAgreementState();
    const acceptedAt = new Date("2026-01-01T00:00:00.000Z");

    for (const ruleId of COMMUNITY_GUIDELINE_RULE_IDS) {
        state[ruleId] = { accepted: true, acceptedAt };
    }

    return state;
};

const baseUser = (overrides: Partial<Circle> = {}): Partial<Circle> => ({
    circleType: "user",
    picture: { url: "/storage/users/profile.png" },
    description: "About me",
    communityGuidelinesAcceptance: completedGuidelines(),
    ...overrides,
});

assert.equal(hasRealProfileImage({}), false, "missing image fails");
assert.equal(hasRealProfileImageUrl("   "), false, "blank image URL fails");
assert.equal(hasRealProfileImageUrl("/images/default-user-picture.png"), false, "relative default user image fails");
assert.equal(hasRealProfileImageUrl("/images/default-picture.png"), false, "relative generic default image fails");
assert.equal(
    hasRealProfileImageUrl("https://kamooni.org/images/default-user-picture.png"),
    false,
    "absolute default user image fails",
);
assert.equal(
    hasRealProfileImageUrl("https://kamooni.org/images/default-picture.png"),
    false,
    "absolute generic default image fails",
);
assert.equal(hasRealProfileImageUrl("/storage/users/profile.png"), true, "custom image succeeds");

assert.equal(hasProfileAboutText({ description: "About me" }), true, "description satisfies About");
assert.equal(hasProfileAboutText({ content: "Long about me" }), true, "content satisfies About");
assert.equal(hasProfileAboutText({ description: "  ", content: "\n" }), false, "blank About fields fail");

const checklistState = (profile: Partial<Circle>) => getProfileCompletionChecklistState(profile);
const checklistCompletionById = (profile: Partial<Circle>) =>
    Object.fromEntries(checklistState(profile).items.map((item) => [item.id, item.complete]));

assert.deepEqual(
    checklistCompletionById(
        baseUser({
            picture: undefined,
            description: "",
            content: "",
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    { "profile-image": false, about: false, rules: false },
    "checklist handles no requirements complete",
);
assert.deepEqual(
    checklistCompletionById(
        baseUser({
            description: "",
            content: "",
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    { "profile-image": true, about: false, rules: false },
    "checklist handles image complete only",
);
assert.deepEqual(
    checklistCompletionById(
        baseUser({
            picture: undefined,
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    { "profile-image": false, about: true, rules: false },
    "checklist handles About complete only",
);
assert.deepEqual(
    checklistCompletionById(baseUser({ picture: undefined, description: "", content: "" })),
    { "profile-image": false, about: false, rules: true },
    "checklist handles rules complete only",
);
assert.deepEqual(
    checklistCompletionById(baseUser({ content: "", communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() })),
    { "profile-image": true, about: true, rules: false },
    "checklist handles mixed completion",
);
assert.equal(checklistState(baseUser()).complete, true, "checklist complete state follows profileComplete");

assert.equal(
    isProfileComplete(baseUser({ communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() })),
    false,
    "incomplete guidelines fail",
);
assert.equal(isProfileComplete(baseUser()), true, "completed guidelines succeed when all requirements are met");
assert.equal(isProfileComplete(baseUser()), true, "all three requirements produce profileComplete");
assert.equal(isProfileComplete(baseUser({ circleType: "circle" })), false, "non-user circles do not count");
assert.equal(
    isServerDerivedMapVisibleCircle(
        baseUser({ communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() }),
    ),
    false,
    "incomplete user profiles are excluded from map visibility",
);
assert.equal(isServerDerivedMapVisibleCircle(baseUser()), true, "complete user profiles are included in map visibility");
assert.equal(
    isMapVisibleCircle(baseUser()),
    false,
    "client-facing user map visibility requires server eligibility",
);
assert.equal(
    isMapVisibleCircle(markMapEligiblePersonalProfile(baseUser() as Circle)),
    true,
    "server-marked complete user profiles remain visible to the client",
);
assert.equal(
    isMapVisibleCircle({ circleType: "circle", picture: { url: "/images/default-picture.png" } }),
    true,
    "non-user circles keep existing map visibility behavior",
);
assert.equal(
    canParticipate(
        baseUser({
            isHuman: true,
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    false,
    "incomplete users fail participation readiness even when isHuman is true",
);
assert.equal(canParticipate(baseUser()), true, "complete users pass participation readiness");
assert.equal(
    canParticipate(baseUser({ isAdmin: true, communityGuidelinesAcceptance: undefined })),
    true,
    "admin bypass preserves existing restricted-action behavior",
);
assert.equal(canParticipate(undefined), false, "missing users do not pass participation readiness");

console.log("profile-completion tests passed");
