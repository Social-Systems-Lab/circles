import assert from "node:assert/strict";
import type { Circle } from "@/models/models";
import {
    canParticipate,
    hasProfileAboutText,
    hasRealProfileImage,
    hasRealProfileImageUrl,
    isProfileComplete,
} from "@/lib/profile-completion";
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

assert.equal(
    isProfileComplete(baseUser({ communityGuidelinesAcceptance: createEmptyCommunityGuidelineAgreementState() })),
    false,
    "incomplete guidelines fail",
);
assert.equal(isProfileComplete(baseUser()), true, "completed guidelines succeed when all requirements are met");
assert.equal(isProfileComplete(baseUser()), true, "all three requirements produce profileComplete");
assert.equal(isProfileComplete(baseUser({ circleType: "circle" })), false, "non-user circles do not count");
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
