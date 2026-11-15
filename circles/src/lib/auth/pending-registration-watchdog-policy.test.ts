import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import type { PendingRegistrationOperationsStatus } from "@/lib/auth/pending-registration-monitoring";
import {
    EMPTY_WATCHDOG_STATE,
    WATCHDOG_STATE_SCHEMA_VERSION,
    WATCHDOG_ALERT_DEDUPE_MS,
    evaluateOnboardingWatchdog,
    normalizeWatchdogState,
    type WatchdogState,
} from "@/lib/auth/pending-registration-watchdog-policy";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const DEPLOYMENT_ID = "production-onboarding-20261115-54e5156b-01";

function status(
    overrides: {
        pendingRegistrations?: number;
        reconciliationRequired?: number;
        deploymentIdMatches?: boolean;
        runtimeConsistent?: boolean;
        provisioningAge?: number | null;
        provisioningClaimedAge?: number | null;
        manualReviewAvailable?: boolean;
        manualReview?: number;
        emailFailed15?: number;
        emailSent15?: number;
        provisioningInterrupted15?: number;
        activeProvisioningLocks?: number;
        activeFinalizationLocks?: number;
        provisioningLockFingerprint?: string | null;
        finalizationLockFingerprint?: string | null;
        monitoringAvailable?: boolean;
        deploymentId?: string;
    } = {},
): PendingRegistrationOperationsStatus {
    const monitoringAvailable = overrides.monitoringAvailable !== false;
    const pendingRegistrations = overrides.pendingRegistrations ?? 0;
    const deploymentId = overrides.deploymentId ?? DEPLOYMENT_ID;
    return {
        routing: {
            _id: "registration-routing",
            mode: "pending",
            deploymentId,
            updatedAt: NOW,
            updatedBy: "test",
        },
        configuredDeploymentId: deploymentId,
        deploymentIdMatches: overrides.deploymentIdMatches ?? true,
        pendingRegistrations,
        reconciliationRequired: overrides.reconciliationRequired ?? 0,
        activeProvisioningLocks: overrides.activeProvisioningLocks ?? 0,
        activeFinalizationLocks: overrides.activeFinalizationLocks ?? 0,
        observedAt: NOW.toISOString(),
        pendingStatusMetrics: {
            available: monitoringAvailable,
            ...(monitoringAvailable
                ? {
                      counts: {
                          pending_email: pendingRegistrations,
                          email_verified: 0,
                          provisioning: overrides.provisioningAge == null ? 0 : 1,
                          provisioning_claimed: overrides.provisioningClaimedAge == null ? 0 : 1,
                          unknown: 0,
                      },
                      oldestAgeSeconds: null,
                      oldestStatus: null,
                      oldestAgeSecondsByStatus: {
                          pending_email: null,
                          email_verified: null,
                          provisioning: overrides.provisioningAge ?? null,
                          provisioning_claimed: overrides.provisioningClaimedAge ?? null,
                          unknown: null,
                      },
                      oldestUpdatedAgeSeconds: null,
                      oldestUpdatedStatus: null,
                      oldestUpdatedAgeSecondsByStatus: {
                          pending_email: null,
                          email_verified: null,
                          provisioning: overrides.provisioningAge ?? null,
                          provisioning_claimed: overrides.provisioningClaimedAge ?? null,
                          unknown: null,
                      },
                  }
                : { reason: "bounded_scan_unavailable" }),
            scanLimit: 1_000,
            documentLimit: 5_000,
        },
        lockMetrics: {
            provisioning: {
                available: monitoringAvailable,
                ...(monitoringAvailable
                    ? {
                          active: overrides.activeProvisioningLocks ?? 0,
                          fingerprint: overrides.provisioningLockFingerprint ?? null,
                          oldestRemainingSeconds: null,
                          oldestAgeSeconds: null,
                          ageAvailable: false,
                          ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
                      }
                    : { reason: "bounded_scan_unavailable" }),
            },
            finalization: {
                available: monitoringAvailable,
                ...(monitoringAvailable
                    ? {
                          active: overrides.activeFinalizationLocks ?? 0,
                          fingerprint: overrides.finalizationLockFingerprint ?? null,
                          oldestRemainingSeconds: null,
                          oldestAgeSeconds: null,
                          ageAvailable: false,
                          ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
                      }
                    : { reason: "bounded_scan_unavailable" }),
            },
        },
        manualReviewMetrics: {
            available: overrides.manualReviewAvailable ?? monitoringAvailable,
            ...(overrides.manualReviewAvailable === false
                ? { reason: "manual_review_unavailable", counts: null }
                : {
                      recordsExamined: 0,
                      byClassification: {},
                      manualReview: overrides.manualReview ?? 0,
                      recoverableFinalize: 0,
                  }),
            recordLimit: 100,
            pendingDocumentLimit: 500,
            reservationDocumentLimit: 500,
        },
        auditEvents: {
            available: monitoringAvailable,
            ...(monitoringAvailable
                ? {
                      emailSent: { last15Minutes: overrides.emailSent15 ?? 0, last60Minutes: 0 },
                      emailFailed: { last15Minutes: overrides.emailFailed15 ?? 0, last60Minutes: 0 },
                      provisioningInterrupted: {
                          last15Minutes: overrides.provisioningInterrupted15 ?? 0,
                          last60Minutes: 0,
                      },
                  }
                : { reason: "bounded_scan_unavailable" }),
            documentLimit: 20_000,
        },
        runtime: {
            available: true,
            running: true,
            pendingRegistrationEnabled: true,
            pendingRegistrationJourneyReady: true,
            pendingRegistrationHmacPresent: true,
            registrationDeploymentId: deploymentId,
            altchaConfigured: true,
            postmarkConfigured: true,
            emailTransport: "postmark",
        },
        runtimeRoutingConsistency: {
            available: true,
            consistent: overrides.runtimeConsistent ?? true,
            status: overrides.runtimeConsistent === false ? "inconsistent" : "consistent",
            issues: overrides.runtimeConsistent === false ? ["pending_runtime_gates_incomplete"] : [],
        },
        monitoringLimits: {
            pendingStatusRecords: 1_000,
            pendingStatusDocuments: 5_000,
            manualReviewRecords: 100,
            manualReviewDocuments: 500,
            identityReservationDocuments: 500,
            auditDocuments: 20_000,
        },
    } as PendingRegistrationOperationsStatus;
}

const evaluate = (
    snapshot: PendingRegistrationOperationsStatus,
    previousState: WatchdogState = EMPTY_WATCHDOG_STATE,
    alertConfigured = true,
) =>
    evaluateOnboardingWatchdog({
        status: snapshot,
        previousState,
        now: NOW,
        alertConfigured,
    });

test("healthy onboarding state has no alert or pause", () => {
    const result = evaluate(status());
    assert.equal(result.level, "healthy");
    assert.deepEqual(result.reasons, []);
    assert.equal(result.shouldPause, false);
    assert.equal(result.shouldAlert, false);
});

test("warnings do not pause registration", () => {
    const result = evaluate(
        status({
            pendingRegistrations: 11,
            reconciliationRequired: 1,
            emailFailed15: 1,
        }),
    );
    assert.equal(result.level, "warning");
    assert.equal(result.shouldPause, false);
    assert.equal(result.shouldAlert, true);
    assert.ok(result.reasons.includes("elevated_unfinished_registrations"));
    assert.ok(result.reasons.includes("isolated_email_failure"));
});

test("confirmed integrity and capacity incidents are critical", () => {
    for (const [snapshot, reason] of [
        [status({ manualReview: 1 }), "manual_review_required"],
        [status({ provisioningAge: 601 }), "stuck_provisioning"],
        [status({ emailFailed15: 3 }), "email_failure_burst"],
        [status({ pendingRegistrations: 26 }), "excessive_unfinished_registrations"],
        [status({ runtimeConsistent: false }), "runtime_pending_runtime_gates_incomplete"],
        [status({ deploymentIdMatches: false }), "deployment_id_mismatch"],
        [status({ provisioningInterrupted15: 3 }), "provisioning_interruption_burst"],
    ] as const) {
        const result = evaluate(snapshot);
        assert.equal(result.level, "critical", reason);
        assert.equal(result.shouldPause, true, reason);
        assert.ok(result.reasons.includes(reason), reason);
    }
});

test("email failure rate over ten percent is critical even below three failures", () => {
    const result = evaluate(status({ emailFailed15: 2, emailSent15: 10 }));
    assert.equal(result.level, "critical");
    assert.ok(result.reasons.includes("email_failure_burst"));
});

test("a lock must persist across two durable samples before automatic pause", () => {
    const first = evaluate(
        status({
            activeProvisioningLocks: 1,
            provisioningLockFingerprint: "stable-lock-fingerprint",
        }),
    );
    assert.equal(first.level, "warning");
    assert.equal(first.shouldPause, false);

    const second = evaluate(
        status({
            activeProvisioningLocks: 1,
            provisioningLockFingerprint: "stable-lock-fingerprint",
        }),
        first.nextState,
    );
    assert.equal(second.level, "critical");
    assert.equal(second.shouldPause, true);
    assert.ok(second.reasons.includes("persistent_active_lock"));

    const changedLock = evaluate(
        status({
            activeProvisioningLocks: 1,
            provisioningLockFingerprint: "different-lock-fingerprint",
        }),
        first.nextState,
    );
    assert.equal(changedLock.level, "warning");
    assert.equal(changedLock.shouldPause, false);
});

test("monitoring unavailable is explicit and becomes critical only on the second sample", () => {
    const first = evaluate(status({ monitoringAvailable: false }));
    assert.equal(first.level, "monitoring_unavailable");
    assert.equal(first.shouldPause, false);
    assert.ok(first.reasons.includes("monitoring_unavailable"));

    const second = evaluate(status({ monitoringAvailable: false }), first.nextState);
    assert.equal(second.level, "critical");
    assert.equal(second.shouldPause, true);
    assert.ok(second.reasons.includes("monitoring_unavailable_persistent"));
});

test("alerts are deduplicated by durable state", () => {
    const first = evaluate(status({ emailFailed15: 1 }));
    assert.equal(first.shouldAlert, true);
    const alertedState: WatchdogState = {
        ...first.nextState,
        lastAlertFingerprint: first.alertFingerprint,
        lastAlertAt: NOW,
    };
    const duplicate = evaluate(status({ emailFailed15: 1 }), alertedState);
    assert.equal(duplicate.shouldAlert, false);

    const later = evaluateOnboardingWatchdog({
        status: status({ emailFailed15: 1 }),
        previousState: alertedState,
        now: new Date(NOW.getTime() + WATCHDOG_ALERT_DEDUPE_MS),
        alertConfigured: true,
    });
    assert.equal(later.shouldAlert, true);
});

test("missing alert recipient is never reported as healthy", () => {
    const result = evaluate(status(), EMPTY_WATCHDOG_STATE, false);
    assert.equal(result.level, "monitoring_unavailable");
    assert.ok(result.reasons.includes("alert_recipient_unavailable"));
    assert.equal(result.shouldPause, false);

    const repeated = evaluate(status(), result.nextState, false);
    assert.equal(repeated.level, "critical");
    assert.equal(repeated.shouldPause, true);
});

test("legacy and unversioned watchdog state migrates to the current deployment without carrying failures", () => {
    const legacyState = {
        _id: "onboarding-watchdog",
        consecutiveMonitoringUnavailable: 1,
        lockFingerprint: "old-lock",
        lockObservedAt: NOW,
        lastAlertFingerprint: "critical:monitoring_unavailable",
        lastAlertAt: NOW,
        lastLevel: "critical",
        updatedAt: NOW,
    } as WatchdogState;
    const migrated = normalizeWatchdogState(legacyState, DEPLOYMENT_ID);
    assert.equal(migrated.schemaVersion, WATCHDOG_STATE_SCHEMA_VERSION);
    assert.equal(migrated.deploymentId, DEPLOYMENT_ID);
    assert.equal(migrated.consecutiveMonitoringUnavailable, 0);
    assert.equal(migrated.lockFingerprint, null);
    assert.equal(migrated.lastAlertFingerprint, null);
    assert.equal(migrated.alertPending, null);
    assert.equal(migrated.lastSuccessfulRunAt, null);
});

test("state from another deployment cannot pause or suppress the first alert of a new deployment", () => {
    const previousState: WatchdogState = {
        ...EMPTY_WATCHDOG_STATE,
        schemaVersion: WATCHDOG_STATE_SCHEMA_VERSION,
        deploymentId: "deployment-a",
        consecutiveMonitoringUnavailable: 1,
        lockFingerprint: "old-lock",
        lockObservedAt: NOW,
        lastAlertFingerprint: "critical:monitoring_unavailable,monitoring_unavailable_persistent",
        lastAlertAt: NOW,
        alertPending: {
            fingerprint: "critical:monitoring_unavailable,monitoring_unavailable_persistent",
            level: "critical",
            reasons: ["monitoring_unavailable", "monitoring_unavailable_persistent"],
            pauseResult: "not_requested",
            firstFailedAt: NOW,
            lastAttemptAt: NOW,
            attempts: 1,
            expiresAt: new Date(NOW.getTime() + WATCHDOG_ALERT_DEDUPE_MS),
        },
    };
    const result = evaluate(
        status({
            deploymentId: "deployment-b",
            monitoringAvailable: false,
        }),
        previousState,
    );
    assert.equal(result.level, "monitoring_unavailable");
    assert.equal(result.shouldPause, false);
    assert.equal(result.shouldAlert, true);
    assert.equal(result.nextState.schemaVersion, WATCHDOG_STATE_SCHEMA_VERSION);
    assert.equal(result.nextState.deploymentId, "deployment-b");
    assert.equal(result.nextState.consecutiveMonitoringUnavailable, 1);
    assert.equal(result.nextState.alertPending, null);
    assert.equal(result.nextState.lockFingerprint, null);
});
