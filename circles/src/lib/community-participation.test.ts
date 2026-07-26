import assert from "node:assert/strict";
import {
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

console.log("community-participation tests passed");
