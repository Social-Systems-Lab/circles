import assert from "node:assert/strict";
import type { Circle } from "@/models/models";
import {
    canParticipate,
    getOptionalProfileImprovements,
    getParticipationBlockReason,
    getParticipationReadiness,
    getParticipationRequiredMessage,
    hasProfileAboutText,
    hasRealProfileImage,
    hasRealProfileImageUrl,
    hasSelectedProfileLocation,
    isProfileComplete,
} from "@/lib/profile-completion";
import { getProfileCompletionChecklistState } from "@/lib/profile-completion-checklist";
import {
    isMapVisibleCircle,
    isPersonalProfileMapEligible,
    isServerDerivedMapVisibleCircle,
    markMapEligiblePersonalProfile,
} from "@/lib/map-visibility";
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
    isEmailVerified: true,
    picture: { url: "/storage/users/profile.png" },
    location: { precision: 2, city: "Cape Town", lngLat: { lng: 18.4241, lat: -33.9249 } },
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
assert.equal(hasSelectedProfileLocation(baseUser()), true, "finite selected coordinates satisfy location improvement");
assert.equal(hasSelectedProfileLocation(baseUser({ location: undefined })), false, "missing location fails");
assert.equal(
    hasSelectedProfileLocation(baseUser({ location: { precision: 2, lngLat: { lng: 181, lat: 0 } } })),
    false,
    "out-of-range longitude fails",
);
assert.equal(
    hasSelectedProfileLocation(baseUser({ location: { precision: 2, lngLat: { lng: 0, lat: Number.NaN } } })),
    false,
    "non-finite coordinates fail",
);

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
    checklistCompletionById(
        baseUser({ content: "", communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() }),
    ),
    { "profile-image": true, about: true, rules: false },
    "checklist handles mixed completion",
);
assert.equal(checklistState(baseUser()).complete, true, "checklist complete state follows profileComplete");
assert.equal(
    checklistState(baseUser({ picture: undefined })).participationReady,
    true,
    "checklist recognizes participation-ready users without a profile image",
);
assert.deepEqual(
    Object.fromEntries(checklistState(baseUser()).items.map((item) => [item.id, item.requiredForParticipation])),
    { "profile-image": false, about: true, rules: true },
    "checklist labels the profile image as an optional improvement",
);

assert.equal(
    isProfileComplete(baseUser({ communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() })),
    false,
    "incomplete guidelines fail",
);
assert.equal(isProfileComplete(baseUser()), true, "completed guidelines succeed when all requirements are met");
assert.equal(isProfileComplete(baseUser()), true, "all three requirements produce profileComplete");
assert.equal(
    isProfileComplete(baseUser({ isEmailVerified: false })),
    true,
    "profileComplete remains independent from email verification",
);
assert.equal(isProfileComplete(baseUser({ circleType: "circle" })), false, "non-user circles do not count");
assert.equal(
    isServerDerivedMapVisibleCircle(
        baseUser({ communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() }),
    ),
    true,
    "guideline acceptance is not independently required for map visibility",
);
assert.equal(
    isServerDerivedMapVisibleCircle(baseUser()),
    true,
    "complete user profiles are included in map visibility",
);
assert.equal(
    isServerDerivedMapVisibleCircle(baseUser({ location: undefined })),
    false,
    "personal map eligibility requires a selected location",
);
assert.equal(
    isServerDerivedMapVisibleCircle(
        baseUser({ location: { precision: 2, city: "Cape Town", lngLat: { lng: 18.4241, lat: -33.9249 } } }),
    ),
    true,
    "a location does not change an otherwise complete profile's map eligibility",
);
assert.equal(
    isServerDerivedMapVisibleCircle(baseUser({ picture: { url: "/images/default-user-picture.png" } })),
    false,
    "default personal profile images are excluded from map eligibility",
);
const completePendingProfile = baseUser({
    isEmailVerified: true,
    isVerified: false,
    isMember: false,
    accountStatus: "pending_verification",
});
assert.equal(
    isServerDerivedMapVisibleCircle(completePendingProfile),
    true,
    "complete pending user profiles are eligible for Explore without verification or membership",
);
assert.equal(
    isServerDerivedMapVisibleCircle({ ...completePendingProfile, accountStatus: "rejected" }),
    false,
    "rejected user profiles are excluded from Explore even when complete",
);
assert.equal(isMapVisibleCircle(baseUser()), false, "client-facing user map visibility requires server eligibility");
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
            isEmailVerified: true,
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    false,
    "incomplete users fail participation readiness even when isHuman is true",
);
assert.equal(
    canParticipate(baseUser({ picture: undefined })),
    true,
    "a genuine profile image is not required for Phase 1 participation",
);
assert.equal(
    canParticipate(baseUser({ isEmailVerified: false })),
    false,
    "complete profiles with unverified email fail participation readiness",
);
assert.equal(
    canParticipate(
        baseUser({
            isEmailVerified: true,
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    false,
    "verified email with incomplete profile fails participation readiness",
);
assert.equal(
    canParticipate(baseUser({ isEmailVerified: true })),
    true,
    "verified email with complete profile passes participation readiness",
);
assert.equal(
    canParticipate(baseUser({ isAdmin: true, isEmailVerified: false, communityGuidelinesAcceptance: undefined })),
    true,
    "admin bypass preserves existing restricted-action behavior",
);
assert.equal(
    getParticipationReadiness(
        baseUser({ isAdmin: true, isEmailVerified: false, description: "", communityGuidelinesAcceptance: undefined }),
    ).ready,
    true,
    "administrator bypass is reflected by the reusable readiness helper",
);
assert.equal(canParticipate(undefined), false, "missing users do not pass participation readiness");
assert.equal(
    canParticipate(
        baseUser({
            completedOnboardingSteps: ["welcome", "terms", "member", "profile", "final"],
        }),
    ),
    true,
    "legacy onboarding markers do not replace or invalidate derived readiness",
);
assert.equal(
    canParticipate(
        baseUser({
            isEmailVerified: true,
            description: undefined,
            content: "Legacy long-form introduction",
        }),
    ),
    true,
    "legacy content satisfies the current introduction requirement",
);
assert.equal(getParticipationBlockReason(baseUser()), null, "fully ready users have no participation block reason");
assert.equal(
    getParticipationBlockReason(
        baseUser({ isAdmin: true, isEmailVerified: false, communityGuidelinesAcceptance: undefined }),
    ),
    null,
    "admin bypass has no participation block reason",
);
assert.equal(
    getParticipationBlockReason(baseUser({ isEmailVerified: false })),
    "email_unverified",
    "unverified email is identified specifically",
);
assert.equal(
    getParticipationBlockReason(baseUser({ picture: undefined })),
    null,
    "missing profile image does not block participation",
);
assert.equal(
    getParticipationBlockReason(baseUser({ description: "", content: "" })),
    "profile_incomplete",
    "missing About text maps to profile completion",
);
assert.equal(
    getParticipationBlockReason(
        baseUser({ communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() }),
    ),
    "guidelines_incomplete",
    "incomplete guidelines are identified specifically",
);
assert.deepEqual(
    getParticipationReadiness(baseUser({ picture: undefined, location: undefined })),
    {
        ready: true,
        requirements: {
            "verified-email": true,
            introduction: true,
            "community-guidelines": true,
        },
        missingRequirements: [],
    },
    "participation readiness excludes optional photo and location improvements",
);
assert.deepEqual(
    getParticipationReadiness(
        baseUser({
            isEmailVerified: false,
            description: "",
            content: "",
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ).missingRequirements,
    ["verified-email", "introduction", "community-guidelines"],
    "readiness reports every independently missing Phase 1 requirement",
);
assert.deepEqual(
    getOptionalProfileImprovements(baseUser({ picture: undefined, location: undefined }), {
        hasProofOfHumanity: true,
    }),
    {
        completed: { "profile-image": false, location: false, "proof-of-humanity": true },
        missing: ["profile-image", "location"],
    },
    "optional improvements remain separate from participation readiness",
);
assert.equal(
    isPersonalProfileMapEligible(
        baseUser({
            description: "",
            content: "",
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    true,
    "map eligibility does not require an introduction or guidelines acceptance",
);
assert.equal(
    isPersonalProfileMapEligible(baseUser({ isEmailVerified: false })),
    false,
    "unverified accounts cannot qualify for personal-profile map visibility",
);
assert.equal(
    getParticipationBlockReason(
        baseUser({
            isEmailVerified: false,
            picture: undefined,
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    "email_unverified",
    "email verification takes precedence when multiple participation checks fail",
);
assert.equal(
    getParticipationBlockReason(
        baseUser({
            picture: undefined,
            communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState(),
        }),
    ),
    "guidelines_incomplete",
    "optional profile image does not mask a missing guidelines requirement",
);
assert.equal(
    getParticipationRequiredMessage("create posts", baseUser({ isEmailVerified: false })),
    "Verify your email before you can create posts.",
    "participation message points unverified users to email verification",
);
assert.equal(
    getParticipationRequiredMessage("create posts", baseUser({ description: "", content: "" })),
    "Complete your profile before you can create posts.",
    "participation message points users without an introduction to profile completion",
);
assert.equal(
    getParticipationRequiredMessage(
        "create posts",
        baseUser({ communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() }),
    ),
    "Accept the Community Guidelines before you can create posts.",
    "participation message points guideline-incomplete users to Community Guidelines",
);

console.log("profile-completion tests passed");
