import assert from "node:assert/strict";
import {
    getCommunityReadinessHref,
    getCommunityComposerState,
    shouldGuardCommunityInteractions,
} from "@/lib/community-participation";

assert.equal(
    getCommunityComposerState({
        hasPostPermission: false,
        canParticipate: false,
        participationBlockReason: "email_unverified",
    }),
    "hidden",
    "no post permission hides the composer",
);

assert.equal(
    getCommunityComposerState({
        hasPostPermission: true,
        canParticipate: false,
        participationBlockReason: "email_unverified",
    }),
    "guarded",
    "post permission with blocked participation shows a guarded composer",
);

assert.equal(
    getCommunityComposerState({
        hasPostPermission: true,
        canParticipate: true,
        participationBlockReason: null,
    }),
    "enabled",
    "post permission with participation readiness shows the real composer",
);

assert.equal(
    shouldGuardCommunityInteractions({
        hasPostPermission: true,
        canParticipate: false,
        participationBlockReason: "profile_incomplete",
    }),
    true,
    "guarded interactions are enabled only for permissioned users blocked by readiness",
);

assert.equal(
    shouldGuardCommunityInteractions({
        hasPostPermission: false,
        canParticipate: false,
        participationBlockReason: "profile_incomplete",
    }),
    false,
    "users without post permission do not see guarded interactions",
);

assert.equal(
    getCommunityReadinessHref("email_unverified", "test-user"),
    "/circles/test-user/settings/subscription#email-verification",
    "email-unverified Community prompt links to Account Settings verification anchor",
);

assert.equal(
    getCommunityReadinessHref("profile_incomplete", "test-user"),
    "/circles/test-user/home",
    "profile-incomplete Community prompt stays on profile home",
);

assert.equal(
    getCommunityReadinessHref("guidelines_incomplete", "test-user"),
    "/circles/test-user/home",
    "guidelines-incomplete Community prompt stays on profile home",
);

console.log("community-participation tests passed");
