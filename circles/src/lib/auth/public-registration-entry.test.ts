import assert from "node:assert/strict";
import {
    resolvePublicRegistrationEntryState,
    resolvePublicRegistrationEntryView,
} from "@/lib/auth/public-registration-entry";
import { isRegistrationRoutingAllowed } from "@/lib/auth/registration-routing";

const legacy = { mode: "legacy" as const, deploymentId: null };
const paused = { mode: "paused" as const, deploymentId: null };
const pending = { mode: "pending" as const, deploymentId: "release-123" };

assert.equal(
    resolvePublicRegistrationEntryState(legacy, { pendingJourneyEnabled: true }),
    "legacy",
    "explicit legacy routing continues to render legacy signup even when pending flags are set",
);
assert.deepEqual(resolvePublicRegistrationEntryView("legacy", "/signup/pilot"), {
    kind: "form",
    form: "legacy",
});

assert.equal(
    resolvePublicRegistrationEntryState(pending, {
        pendingJourneyEnabled: true,
        currentDeploymentId: "release-123",
    }),
    "pending",
);
assert.deepEqual(resolvePublicRegistrationEntryView("pending", "/signup"), {
    kind: "form",
    form: "pending",
});
assert.deepEqual(
    resolvePublicRegistrationEntryView("pending", "/signup/pilot"),
    { kind: "redirect", destination: "/signup" },
    "direct navigation to the legacy pilot URL redirects once to the pending entry point",
);
assert.notEqual(
    resolvePublicRegistrationEntryView("pending", "/signup").kind,
    "redirect",
    "/signup does not redirect in pending mode, preventing a redirect loop",
);

assert.equal(resolvePublicRegistrationEntryState(paused, { pendingJourneyEnabled: true }), "paused");
assert.deepEqual(resolvePublicRegistrationEntryView("paused", "/signup"), {
    kind: "unavailable",
    reason: "paused",
});
assert.deepEqual(
    resolvePublicRegistrationEntryView("paused", "/signup/pilot"),
    { kind: "unavailable", reason: "paused" },
    "direct navigation to the legacy pilot URL also shows the paused state",
);

assert.equal(
    resolvePublicRegistrationEntryState(pending, {
        pendingJourneyEnabled: false,
        currentDeploymentId: "release-123",
    }),
    "unavailable",
    "pending routing without the independent pending-journey flags never exposes the legacy form",
);
assert.equal(
    resolvePublicRegistrationEntryState(pending, {
        pendingJourneyEnabled: true,
        currentDeploymentId: "another-release",
    }),
    "unavailable",
    "a deployment-id mismatch fails closed",
);
assert.equal(
    isRegistrationRoutingAllowed({ mode: "legacy", deploymentId: "release-123" }, "legacy", "another-release"),
    false,
    "legacy routing still honors deployment-id consistency when one is configured",
);

console.log("public-registration-entry tests passed");
