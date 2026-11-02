import assert from "node:assert/strict";
import { COMMUNITY_GUIDELINE_RULE_IDS, createEmptyCommunityGuidelineAgreementState } from "@/lib/community-guidelines";
import {
    acceptMissingCommunityGuidelines,
    normalizeOnboardingIntroduction,
    validateOnboardingLocation,
} from "@/lib/onboarding/card-policies";

assert.equal(normalizeOnboardingIntroduction("  Hello  "), "Hello");
assert.equal(normalizeOnboardingIntroduction("hi"), "hi", "introductions have no minimum word count");
assert.equal(normalizeOnboardingIntroduction(" \n\t "), null);
assert.equal(normalizeOnboardingIntroduction(42), null);

const validLocation = {
    precision: 2,
    city: "Cape Town",
    lngLat: { lng: 18.4, lat: -33.9 },
};
assert.deepEqual(validateOnboardingLocation(validLocation), validLocation);
assert.equal(validateOnboardingLocation({ ...validLocation, precision: 5 }), null);
assert.equal(validateOnboardingLocation({ ...validLocation, lngLat: { lng: 181, lat: 0 } }), null);
assert.equal(validateOnboardingLocation({ ...validLocation, lngLat: { lng: 0, lat: Number.NaN } }), null);
assert.equal(validateOnboardingLocation({ precision: 2, city: "Cape Town" }), null);

const acceptedAt = new Date("2025-03-01T12:00:00.000Z");
const completedAt = new Date("2025-04-01T12:00:00.000Z");
const existing = createEmptyCommunityGuidelineAgreementState();
existing.truth = { accepted: true, acceptedAt };
existing.privacy = { accepted: true, acceptedAt: completedAt };
const newlyAcceptedAt = new Date("2026-11-02T12:00:00.000Z");
const completed = acceptMissingCommunityGuidelines(existing, newlyAcceptedAt);
assert.equal(completed.truth.acceptedAt?.getTime(), acceptedAt.getTime(), "existing acceptance timestamp is preserved");
assert.equal(completed.privacy.acceptedAt?.getTime(), completedAt.getTime(), "each valid prior timestamp is preserved");
for (const ruleId of COMMUNITY_GUIDELINE_RULE_IDS) {
    assert.equal(completed[ruleId].accepted, true);
    assert.ok(completed[ruleId].acceptedAt instanceof Date);
    if (!existing[ruleId].accepted) assert.equal(completed[ruleId].acceptedAt?.getTime(), newlyAcceptedAt.getTime());
}

console.log("onboarding card policy tests passed");
