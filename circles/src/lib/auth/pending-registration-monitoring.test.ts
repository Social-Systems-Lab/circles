import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import {
    WATCHDOG_HEARTBEAT_STALE_SECONDS,
    summarizeWatchdogHeartbeat,
    summarizeManualReviewResults,
} from "@/lib/auth/pending-registration-monitoring";
import type { PendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";
import type { RegistrationRoutingRecord } from "@/lib/auth/registration-routing";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const DEPLOYMENT_ID = "production-onboarding-20261115-54e5156b-01";
const routing = (mode: RegistrationRoutingRecord["mode"] = "pending"): RegistrationRoutingRecord => ({
    _id: "registration-routing",
    mode,
    deploymentId: mode === "pending" ? DEPLOYMENT_ID : null,
    updatedAt: NOW,
    updatedBy: "test",
});

const currentState = {
    schemaVersion: 2,
    deploymentId: DEPLOYMENT_ID,
    lastAttemptAt: new Date(NOW.getTime() - 60_000),
    lastSuccessfulRunAt: new Date(NOW.getTime() - 60_000),
    lastFailureAt: null,
    lastLevel: "healthy",
    alertPending: null,
};

test("legacy and paused routing are explicitly not applicable to watchdog heartbeat checks", () => {
    for (const mode of ["legacy", "paused"] as const) {
        const heartbeat = summarizeWatchdogHeartbeat(routing(mode), currentState, NOW);
        assert.equal(heartbeat.status, "not_applicable");
        assert.equal(heartbeat.reason, `routing_${mode}`);
    }
});

test("paused routing still exposes whether an alert retry is pending", () => {
    const heartbeat = summarizeWatchdogHeartbeat(
        routing("paused"),
        {
            ...currentState,
            alertPending: { fingerprint: "sanitized", reasons: ["manual_review_required"] },
        },
        NOW,
    );
    assert.equal(heartbeat.status, "not_applicable");
    assert.equal(heartbeat.alertRetryPending, true);
    assert.doesNotMatch(JSON.stringify(heartbeat), /manual_review_required|sanitized/);
});

test("missing, unversioned and other-deployment state are reported as missing", () => {
    for (const state of [
        null,
        { ...currentState, schemaVersion: 1 },
        { ...currentState, deploymentId: "deployment-a" },
    ]) {
        const heartbeat = summarizeWatchdogHeartbeat(routing(), state, NOW);
        assert.equal(heartbeat.status, "missing");
        assert.equal(heartbeat.deploymentStateMatches, false);
    }
});

test("a completed healthy watchdog run is current", () => {
    const heartbeat = summarizeWatchdogHeartbeat(routing(), currentState, NOW);
    assert.equal(heartbeat.status, "current");
    assert.equal(heartbeat.level, "healthy");
    assert.equal(heartbeat.heartbeatAgeSeconds, 60);
    assert.equal(heartbeat.alertRetryPending, false);
});

test("a newer failed attempt is distinguished from the last successful run", () => {
    const heartbeat = summarizeWatchdogHeartbeat(
        routing(),
        {
            ...currentState,
            lastAttemptAt: new Date(NOW.getTime() - 10_000),
            lastFailureAt: new Date(NOW.getTime() - 10_000),
            lastLevel: "monitoring_unavailable",
        },
        NOW,
    );
    assert.equal(heartbeat.status, "monitoring_failed");
    assert.equal(heartbeat.level, "monitoring_unavailable");
});

test("a current-deployment state with failure but no successful heartbeat is monitoring_failed", () => {
    const heartbeat = summarizeWatchdogHeartbeat(
        routing(),
        {
            schemaVersion: 2,
            deploymentId: DEPLOYMENT_ID,
            lastAttemptAt: new Date(NOW.getTime() - 10_000),
            lastSuccessfulRunAt: null,
            lastFailureAt: new Date(NOW.getTime() - 10_000),
            lastLevel: "monitoring_unavailable",
            alertPending: null,
        },
        NOW,
    );
    assert.equal(heartbeat.status, "monitoring_failed");
    assert.equal(heartbeat.reason, "no_successful_heartbeat_after_failure");
    assert.equal(heartbeat.deploymentStateMatches, true);
});

test("an old successful run is stale and reports only sanitized heartbeat metadata", () => {
    const heartbeat = summarizeWatchdogHeartbeat(
        routing(),
        {
            ...currentState,
            lastAttemptAt: new Date(NOW.getTime() - (WATCHDOG_HEARTBEAT_STALE_SECONDS + 60) * 1000),
            lastSuccessfulRunAt: new Date(NOW.getTime() - (WATCHDOG_HEARTBEAT_STALE_SECONDS + 60) * 1000),
            alertPending: { fingerprint: "sanitized", reasons: ["manual_review_required"] },
        },
        NOW,
    );
    assert.equal(heartbeat.status, "stale");
    assert.equal(heartbeat.heartbeatAgeSeconds, WATCHDOG_HEARTBEAT_STALE_SECONDS + 60);
    assert.equal(heartbeat.alertRetryPending, true);
    assert.doesNotMatch(JSON.stringify(heartbeat), /manual_review_required|sanitized|deployment-a/);
});

const manualReviewResult = (
    pendingRegistrationId: string,
    overrides: Partial<PendingRegistrationReconciliation> = {},
): PendingRegistrationReconciliation =>
    ({
        pendingRegistrationId,
        status: "provisioning_claimed",
        correlatedAccountId: null,
        classification: "manual_review_missing_credentials",
        ...overrides,
    }) as PendingRegistrationReconciliation;

test("fresh active provisioning for the same record is not treated as confirmed manual review", () => {
    const summary = summarizeManualReviewResults([manualReviewResult("pending-a")], {
        activeProvisioningPendingIds: new Set(["pending-a"]),
        activeFinalizationAccountIds: new Set(),
        pendingUpdatedAtById: new Map([["pending-a", new Date(NOW.getTime() - 30_000)]]),
        now: NOW,
    });
    assert.equal(summary.manualReview, 0);
    assert.equal(summary.transientActiveProvisioning, 1);
});

test("an unrelated fresh lock does not suppress a manual-review incident", () => {
    const summary = summarizeManualReviewResults([manualReviewResult("pending-a")], {
        activeProvisioningPendingIds: new Set(["pending-b"]),
        activeFinalizationAccountIds: new Set(),
        pendingUpdatedAtById: new Map([
            ["pending-a", new Date(NOW.getTime() - 30_000)],
            ["pending-b", new Date(NOW.getTime() - 30_000)],
        ]),
        now: NOW,
    });
    assert.equal(summary.manualReview, 1);
    assert.equal(summary.transientActiveProvisioning, 0);
});

test("correlated transient artifacts do not suppress a different confirmed manual-review record", () => {
    const summary = summarizeManualReviewResults([manualReviewResult("pending-a"), manualReviewResult("pending-b")], {
        activeProvisioningPendingIds: new Set(["pending-a"]),
        activeFinalizationAccountIds: new Set(),
        pendingUpdatedAtById: new Map([
            ["pending-a", new Date(NOW.getTime() - 30_000)],
            ["pending-b", new Date(NOW.getTime() - 30_000)],
        ]),
        now: NOW,
    });
    assert.equal(summary.manualReview, 1);
    assert.equal(summary.transientActiveProvisioning, 1);
});

test("an expired active lock or genuinely stuck provisioning remains confirmed manual review", () => {
    const summary = summarizeManualReviewResults([manualReviewResult("pending-a")], {
        activeProvisioningPendingIds: new Set(["pending-a"]),
        activeFinalizationAccountIds: new Set(),
        pendingUpdatedAtById: new Map([["pending-a", new Date(NOW.getTime() - 601_000)]]),
        now: NOW,
    });
    assert.equal(summary.manualReview, 1);
    assert.equal(summary.transientActiveProvisioning, 0);
});

test("a fresh finalization lock correlated to the inspected account is transient", () => {
    const summary = summarizeManualReviewResults(
        [
            manualReviewResult("pending-a", {
                correlatedAccountId: "account-a",
            }),
        ],
        {
            activeProvisioningPendingIds: new Set(),
            activeFinalizationAccountIds: new Set(["account-a"]),
            pendingUpdatedAtById: new Map([["pending-a", new Date(NOW.getTime() - 15_000)]]),
            now: NOW,
        },
    );
    assert.equal(summary.manualReview, 0);
    assert.equal(summary.transientActiveProvisioning, 1);
});

test("the complete transient manual-review allowlist is exact-record and freshness scoped", () => {
    for (const classification of [
        "manual_review_missing_credentials",
        "manual_review_orphan_credentials",
        "manual_review_claim_without_did",
    ] as const) {
        const summary = summarizeManualReviewResults([manualReviewResult("pending-a", { classification })], {
            activeProvisioningPendingIds: new Set(["pending-a"]),
            activeFinalizationAccountIds: new Set(),
            pendingUpdatedAtById: new Map([["pending-a", new Date(NOW.getTime() - 60_000)]]),
            now: NOW,
        });
        assert.equal(summary.manualReview, 0, classification);
        assert.equal(summary.transientActiveProvisioning, 1, classification);
    }
});

test("non-transient identity-integrity classifications remain confirmed under a fresh matching lock", () => {
    for (const classification of [
        "manual_review_account_mismatch",
        "manual_review_duplicate_accounts",
        "manual_review_invalid_public_key",
    ] as const) {
        const summary = summarizeManualReviewResults(
            [
                manualReviewResult("pending-a", {
                    classification,
                    correlatedAccountId: "account-a",
                }),
            ],
            {
                activeProvisioningPendingIds: new Set(["pending-a"]),
                activeFinalizationAccountIds: new Set(["account-a"]),
                pendingUpdatedAtById: new Map([["pending-a", new Date(NOW.getTime() - 60_000)]]),
                now: NOW,
            },
        );
        assert.equal(summary.manualReview, 1, classification);
        assert.equal(summary.transientActiveProvisioning, 0, classification);
    }
});
