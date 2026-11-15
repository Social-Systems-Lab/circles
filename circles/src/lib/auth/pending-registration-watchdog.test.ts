import assert from "node:assert/strict";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import type { PendingRegistrationOperationsStatus } from "@/lib/auth/pending-registration-monitoring";
import { EMPTY_WATCHDOG_STATE, type WatchdogState } from "@/lib/auth/pending-registration-watchdog-policy";
import {
    processPendingRegistrationMonitoringFailure,
    processPendingRegistrationWatchdog,
    type WatchdogPauseResult,
} from "@/lib/auth/pending-registration-watchdog";
import { pausePendingRegistrationForWatchdog } from "@/lib/auth/pending-registration-watchdog-control";
import type { RegistrationRoutingCollection, RegistrationRoutingRecord } from "@/lib/auth/registration-routing";

const NOW = new Date("2026-11-15T12:00:00.000Z");
const DEPLOYMENT_ID = "production-onboarding-20261115-54e5156b-01";

function status(
    mode: RegistrationRoutingRecord["mode"] = "pending",
    overrides: { critical?: boolean; warning?: boolean; deploymentId?: string | null } = {},
): PendingRegistrationOperationsStatus {
    const manualReview = overrides.critical ? 1 : 0;
    return {
        routing: {
            _id: "registration-routing",
            mode,
            deploymentId: mode === "pending" ? (overrides.deploymentId ?? DEPLOYMENT_ID) : null,
            updatedAt: NOW,
            updatedBy: "test",
        },
        configuredDeploymentId: DEPLOYMENT_ID,
        deploymentIdMatches: true,
        pendingRegistrations: overrides.warning ? 11 : 0,
        reconciliationRequired: 0,
        activeProvisioningLocks: 0,
        activeFinalizationLocks: 0,
        observedAt: NOW.toISOString(),
        pendingStatusMetrics: {
            available: true,
            counts: {
                pending_email: overrides.warning ? 11 : 0,
                email_verified: 0,
                provisioning: 0,
                provisioning_claimed: 0,
                unknown: 0,
            },
            oldestAgeSeconds: null,
            oldestStatus: null,
            oldestAgeSecondsByStatus: {
                pending_email: null,
                email_verified: null,
                provisioning: null,
                provisioning_claimed: null,
                unknown: null,
            },
            oldestUpdatedAgeSeconds: null,
            oldestUpdatedStatus: null,
            oldestUpdatedAgeSecondsByStatus: {
                pending_email: null,
                email_verified: null,
                provisioning: null,
                provisioning_claimed: null,
                unknown: null,
            },
            scanLimit: 1_000,
            documentLimit: 5_000,
        },
        lockMetrics: {
            provisioning: {
                available: true,
                active: 0,
                fingerprint: null,
                oldestRemainingSeconds: null,
                oldestAgeSeconds: null,
                ageAvailable: false,
                ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
            },
            finalization: {
                available: true,
                active: 0,
                fingerprint: null,
                oldestRemainingSeconds: null,
                oldestAgeSeconds: null,
                ageAvailable: false,
                ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
            },
        },
        manualReviewMetrics: {
            available: true,
            recordsExamined: manualReview,
            byClassification: manualReview ? { manual_review_account_mismatch: manualReview } : {},
            manualReview,
            recoverableFinalize: 0,
            recordLimit: 100,
            pendingDocumentLimit: 500,
            reservationDocumentLimit: 500,
        },
        auditEvents: {
            available: true,
            emailSent: { last15Minutes: 0, last60Minutes: 0 },
            emailFailed: { last15Minutes: 0, last60Minutes: 0 },
            provisioningInterrupted: { last15Minutes: 0, last60Minutes: 0 },
            documentLimit: 20_000,
        },
        runtime: {
            available: true,
            running: true,
            pendingRegistrationEnabled: mode !== "legacy",
            pendingRegistrationJourneyReady: mode !== "legacy",
            pendingRegistrationHmacPresent: mode !== "legacy",
            registrationDeploymentId: mode === "legacy" ? null : DEPLOYMENT_ID,
            altchaConfigured: true,
            postmarkConfigured: true,
            emailTransport: "postmark",
        },
        runtimeRoutingConsistency: {
            available: true,
            consistent: true,
            status: "consistent",
            issues: [],
        },
        monitoringLimits: {
            pendingStatusRecords: 1_000,
            pendingStatusDocuments: 5_000,
            manualReviewRecords: 100,
            manualReviewDocuments: 500,
            identityReservationDocuments: 500,
            auditDocuments: 20_000,
        },
    } as unknown as PendingRegistrationOperationsStatus;
}

async function run(
    snapshot: PendingRegistrationOperationsStatus,
    options: {
        previousState?: WatchdogState;
        pauseResult?: Exclude<WatchdogPauseResult, "not_requested">;
        alertFailure?: boolean;
        alertConfigured?: boolean;
    } = {},
) {
    const calls = {
        pauses: 0,
        alerts: [] as Array<{
            fingerprint: string;
            level: string;
            reasons: string[];
            pauseResult: WatchdogPauseResult;
        }>,
        saved: undefined as WatchdogState | undefined,
        stateReads: 0,
    };
    const result = await processPendingRegistrationWatchdog({
        getStatus: async () => snapshot,
        getState: async () => {
            calls.stateReads += 1;
            return options.previousState ?? EMPTY_WATCHDOG_STATE;
        },
        saveState: async (nextState) => {
            calls.saved = nextState;
        },
        pausePendingRegistration: async () => {
            calls.pauses += 1;
            return options.pauseResult ?? "paused";
        },
        sendAlert: async (evaluation) => {
            calls.alerts.push(evaluation);
            if (options.alertFailure) throw new Error("synthetic alert failure");
        },
        alertConfigured: options.alertConfigured ?? true,
        now: () => NOW,
    });
    return { result, calls };
}

test("legacy mode is a safe no-op without state access or routing changes", async () => {
    const { result, calls } = await run(status("legacy"));
    assert.equal(result.status, "skipped");
    assert.equal(calls.stateReads, 0);
    assert.equal(calls.pauses, 0);
    assert.deepEqual(calls.alerts, []);
    assert.equal(calls.saved, undefined);
});

test("paused mode without a pending alert is a safe no-op", async () => {
    const { result, calls } = await run(status("paused"));
    assert.equal(result.status, "skipped");
    assert.equal(calls.stateReads, 1);
    assert.equal(calls.pauses, 0);
    assert.deepEqual(calls.alerts, []);
    assert.equal(calls.saved, undefined);
});

test("healthy pending state saves a heartbeat without alert or pause", async () => {
    const { result, calls } = await run(status());
    assert.equal(result.status, "healthy");
    assert.equal(calls.pauses, 0);
    assert.deepEqual(calls.alerts, []);
    assert.equal(calls.saved?.lastLevel, "healthy");
    assert.equal(calls.saved?.lastAttemptAt?.toISOString(), NOW.toISOString());
    assert.equal(calls.saved?.lastSuccessfulRunAt?.toISOString(), NOW.toISOString());
});

test("warning sends a sanitized alert without pausing", async () => {
    const { result, calls } = await run(status("pending", { warning: true }));
    assert.equal(result.status, "warning");
    assert.equal(calls.pauses, 0);
    assert.equal(calls.alerts.length, 1);
    assert.equal(result.alertDelivered, true);
});

test("critical state pauses before alerting", async () => {
    const order: string[] = [];
    const result = await processPendingRegistrationWatchdog({
        getStatus: async () => status("pending", { critical: true }),
        getState: async () => EMPTY_WATCHDOG_STATE,
        saveState: async () => {
            order.push("state");
        },
        pausePendingRegistration: async () => {
            order.push("pause");
            return "paused";
        },
        sendAlert: async () => {
            order.push("alert");
        },
        alertConfigured: true,
        now: () => NOW,
    });
    assert.equal(result.pauseResult, "paused");
    assert.deepEqual(order, ["pause", "alert", "state"]);
});

test("alert failure cannot prevent containment and returns an unhealthy result", async () => {
    const { result, calls } = await run(status("pending", { critical: true }), {
        alertFailure: true,
    });
    assert.equal(calls.pauses, 1);
    assert.equal(result.pauseResult, "paused");
    assert.equal(result.alertDelivered, false);
    assert.equal(result.success, false);
    assert.equal(calls.saved?.alertPending?.level, "critical");
    assert.equal(calls.saved?.alertPending?.attempts, 1);
    assert.equal(calls.saved?.lastAlertDeliveryStatus, "failed");
});

test("a failed critical alert is retried while routing is paused without resuming", async () => {
    const first = await run(status("pending", { critical: true }), {
        alertFailure: true,
    });
    assert.equal(first.calls.saved?.alertPending?.attempts, 1);

    const retried = await run(status("paused"), {
        previousState: first.calls.saved,
    });
    assert.equal(retried.result.status, "skipped");
    assert.equal(retried.result.pauseResult, "not_requested");
    assert.equal(retried.result.alertDelivered, true);
    assert.equal(retried.calls.pauses, 0);
    assert.equal(retried.calls.alerts.length, 1);
    assert.equal(retried.calls.saved?.alertPending, null);
    assert.equal(retried.calls.saved?.lastAlertDeliveryStatus, "delivered");
});

test("paused alert retries stop after the bounded retry window", async () => {
    const exhaustedState: WatchdogState = {
        ...EMPTY_WATCHDOG_STATE,
        schemaVersion: 2,
        deploymentId: DEPLOYMENT_ID,
        alertPending: {
            fingerprint: "critical:manual_review_required",
            level: "critical",
            reasons: ["manual_review_required"],
            pauseResult: "paused",
            firstFailedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
            lastAttemptAt: new Date(NOW.getTime() - 5 * 60 * 1000),
            attempts: 6,
            expiresAt: new Date(NOW.getTime() - 30 * 60 * 1000),
        },
    };
    const { result, calls } = await run(status("paused"), {
        previousState: exhaustedState,
    });
    assert.equal(result.success, false);
    assert.equal(result.reasons.includes("alert_retry_exhausted"), true);
    assert.equal(calls.alerts.length, 0);
    assert.equal(calls.saved?.alertPending, null);
    assert.equal(calls.saved?.lastAlertDeliveryStatus, "failed");
});

test("failed alerts remain bounded even if routing pause also fails", async () => {
    let previousState: WatchdogState | undefined;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        const current = await run(status("pending", { critical: true }), {
            previousState,
            pauseResult: "failed",
            alertFailure: true,
        });
        assert.equal(current.calls.alerts.length, 1);
        assert.equal(current.calls.saved?.alertPending?.attempts, attempt);
        previousState = current.calls.saved;
    }
    const exhausted = await run(status("pending", { critical: true }), {
        previousState,
        pauseResult: "failed",
        alertFailure: true,
    });
    assert.equal(exhausted.calls.alerts.length, 0);
    assert.equal(exhausted.calls.saved?.alertPending, null);
    assert.equal(exhausted.calls.saved?.lastAlertDeliveryStatus, "failed");
});

test("CAS failure is reported and still attempts the operator alert", async () => {
    const { result, calls } = await run(status("pending", { critical: true }), {
        pauseResult: "failed",
    });
    assert.equal(result.pauseResult, "failed");
    assert.equal(result.alertDelivered, true);
    assert.equal(calls.alerts.length, 1);
    assert.equal(result.success, false);
});

test("missing alert configuration still contains critical state but remains unhealthy", async () => {
    const { result, calls } = await run(status("pending", { critical: true }), {
        alertConfigured: false,
    });
    assert.equal(result.pauseResult, "paused");
    assert.equal(result.alertAttempted, false);
    assert.equal(calls.pauses, 1);
    assert.equal(result.success, false);
});

test("deployment-scoped critical failures never pause another deployment", async () => {
    const { result, calls } = await run(
        status("pending", {
            critical: true,
            deploymentId: "production-onboarding-20261115-other-01",
        }),
    );
    assert.equal(result.status, "critical");
    assert.equal(result.pauseResult, "not_requested");
    assert.equal(calls.pauses, 0);
});

test("alert deduplication survives across independent watchdog invocations", async () => {
    const first = await run(status("pending", { warning: true }));
    assert.equal(first.calls.alerts.length, 1);
    const second = await run(status("pending", { warning: true }), {
        previousState: first.calls.saved,
    });
    assert.equal(second.calls.alerts.length, 0);
});

function routingCollection(
    initial: RegistrationRoutingRecord["mode"],
    options: { changeSucceeds?: boolean; finalMode?: RegistrationRoutingRecord["mode"] } = {},
) {
    let mode = initial;
    const updates: Array<{ filter: unknown; update: unknown }> = [];
    const collection = {
        createIndex: async () => "index",
        findOne: async () =>
            ({
                _id: "registration-routing",
                mode,
                deploymentId: mode === "pending" ? DEPLOYMENT_ID : null,
                updatedAt: NOW,
                updatedBy: "test",
            }) as RegistrationRoutingRecord,
        findOneAndUpdate: async (filter: any, update: any) => {
            updates.push({ filter, update });
            if (filter.mode !== mode) return null;
            if (options.changeSucceeds === false) {
                mode = options.finalMode ?? mode;
                return null;
            }
            mode = update.$set.mode;
            return {
                _id: "registration-routing",
                mode,
                deploymentId: update.$set.deploymentId,
                updatedAt: NOW,
                updatedBy: update.$set.updatedBy,
            } as RegistrationRoutingRecord;
        },
    } as unknown as RegistrationRoutingCollection;
    return { collection, updates };
}

test("watchdog control permits only the deployment-scoped pending-to-paused CAS shape", async () => {
    const { collection, updates } = routingCollection("pending");
    assert.equal(await pausePendingRegistrationForWatchdog(collection, DEPLOYMENT_ID), "paused");
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].filter, {
        _id: "registration-routing",
        mode: "pending",
        deploymentId: DEPLOYMENT_ID,
    });
    const update = (updates[0].update as any).$set;
    assert.equal(update.mode, "paused");
    assert.equal(update.deploymentId, null);
    assert.equal(update.updatedBy, "onboarding-watchdog");
    assert.ok(update.updatedAt instanceof Date);
});

test("watchdog control never mutates legacy or already paused routing", async () => {
    for (const mode of ["legacy", "paused"] as const) {
        const { collection, updates } = routingCollection(mode);
        const result = await pausePendingRegistrationForWatchdog(collection, DEPLOYMENT_ID);
        assert.equal(result, mode === "paused" ? "already_paused" : "not_pending");
        assert.equal(updates.length, 0);
    }
});

test("watchdog control handles a CAS race without reversing another transition", async () => {
    const pausedRace = routingCollection("pending", { changeSucceeds: false, finalMode: "paused" });
    assert.equal(await pausePendingRegistrationForWatchdog(pausedRace.collection, DEPLOYMENT_ID), "already_paused");

    const legacyRace = routingCollection("pending", { changeSucceeds: false, finalMode: "legacy" });
    assert.equal(await pausePendingRegistrationForWatchdog(legacyRace.collection, DEPLOYMENT_ID), "not_pending");
});

async function runMonitoringException(
    options: {
        routingMode?: RegistrationRoutingRecord["mode"];
        deploymentId?: string;
        previousState?: WatchdogState;
        alertFailure?: boolean;
    } = {},
) {
    let routingMode = options.routingMode ?? "pending";
    let saved = options.previousState;
    let pauses = 0;
    let alerts = 0;
    const order: string[] = [];
    const result = await processPendingRegistrationMonitoringFailure({
        getRouting: async () => ({
            mode: routingMode,
            deploymentId: routingMode === "pending" ? (options.deploymentId ?? DEPLOYMENT_ID) : null,
        }),
        deploymentId: options.deploymentId ?? DEPLOYMENT_ID,
        getState: async () => saved ?? EMPTY_WATCHDOG_STATE,
        saveState: async (state) => {
            saved = state;
        },
        pausePendingRegistration: async (deploymentId) => {
            order.push("pause");
            assert.equal(deploymentId, options.deploymentId ?? DEPLOYMENT_ID);
            pauses += 1;
            routingMode = "paused";
            return "paused";
        },
        sendAlert: async () => {
            order.push("alert");
            alerts += 1;
            if (options.alertFailure) throw new Error("synthetic alert failure");
        },
        alertConfigured: true,
        now: () => NOW,
    });
    return { result, saved, pauses, alerts, order };
}

test("two monitoring exceptions trigger exactly one deployment-scoped pending-to-paused transition", async () => {
    const first = await runMonitoringException();
    assert.equal(first.result.status, "monitoring_unavailable");
    assert.equal(first.pauses, 0);
    assert.equal(first.saved?.consecutiveMonitoringUnavailable, 1);

    const second = await runMonitoringException({ previousState: first.saved });
    assert.equal(second.result.status, "critical");
    assert.equal(second.pauses, 1);
    assert.equal(second.saved?.consecutiveMonitoringUnavailable, 2);
    assert.deepEqual(second.order, ["pause", "alert"]);

    const alreadyPaused = await runMonitoringException({
        routingMode: "paused",
        previousState: second.saved,
    });
    assert.equal(alreadyPaused.pauses, 0);
});

test("a successful monitoring sample resets exception repetition", async () => {
    const first = await runMonitoringException();
    let resetState: WatchdogState | undefined;
    const healthy = await processPendingRegistrationWatchdog({
        getStatus: async () => status(),
        getState: async () => first.saved ?? EMPTY_WATCHDOG_STATE,
        saveState: async (state) => {
            resetState = state;
        },
        pausePendingRegistration: async () => "paused",
        sendAlert: async () => undefined,
        alertConfigured: true,
        now: () => NOW,
    });
    assert.equal(healthy.status, "healthy");
    assert.equal(resetState?.consecutiveMonitoringUnavailable, 0);
});

test("monitoring exception state resets when the deployment changes", async () => {
    const failure = await runMonitoringException();
    const changedDeployment = await runMonitoringException({
        deploymentId: "production-onboarding-20261115-new-01",
        previousState: failure.saved,
    });
    assert.equal(changedDeployment.result.status, "monitoring_unavailable");
    assert.equal(changedDeployment.pauses, 0);
    assert.equal(changedDeployment.saved?.consecutiveMonitoringUnavailable, 1);
    assert.equal(changedDeployment.saved?.deploymentId, "production-onboarding-20261115-new-01");
});

test("monitoring exception alerts use the bounded paused retry queue", async () => {
    const first = await runMonitoringException({ alertFailure: true });
    assert.equal(first.saved?.alertPending?.attempts, 1);
    const second = await runMonitoringException({
        previousState: first.saved,
        alertFailure: true,
    });
    assert.equal(second.pauses, 1);
    assert.equal(second.saved?.alertPending?.attempts, 2);

    const retry = await runMonitoringException({
        routingMode: "paused",
        previousState: second.saved,
    });
    assert.equal(retry.result.status, "skipped");
    assert.equal(retry.result.alertDelivered, true);
    assert.equal(retry.saved?.alertPending, null);
});

test("monitoring exception alerts never exceed six attempts across severity escalation", async () => {
    let previousState: WatchdogState | undefined;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
        const current = await runMonitoringException({
            routingMode: attempt >= 3 ? "paused" : "pending",
            previousState,
            alertFailure: true,
        });
        assert.equal(current.alerts, 1);
        assert.equal(current.saved?.alertPending?.attempts, attempt);
        if (attempt === 2) assert.equal(current.pauses, 1);
        if (attempt >= 3) assert.equal(current.pauses, 0);
        previousState = current.saved;
    }

    const seventh = await runMonitoringException({
        routingMode: "paused",
        previousState,
        alertFailure: true,
    });
    assert.equal(seventh.alerts, 0);
    assert.equal(seventh.saved?.alertPending, null);
    assert.equal(seventh.result.reasons.includes("alert_retry_exhausted"), true);
});

test("monitoring exception alert retries exhaust after six attempts", async () => {
    const exhausted: WatchdogState = {
        ...EMPTY_WATCHDOG_STATE,
        schemaVersion: 2,
        deploymentId: DEPLOYMENT_ID,
        alertPending: {
            fingerprint: "critical:monitoring_query_failed",
            level: "critical",
            reasons: ["monitoring_query_failed"],
            pauseResult: "paused",
            firstFailedAt: new Date(NOW.getTime() - 30 * 60 * 1000),
            lastAttemptAt: new Date(NOW.getTime() - 5 * 60 * 1000),
            attempts: 6,
            expiresAt: new Date(NOW.getTime() - 60 * 1000),
        },
    };
    const result = await runMonitoringException({
        routingMode: "paused",
        previousState: exhausted,
    });
    assert.equal(result.result.success, false);
    assert.equal(result.result.reasons.includes("alert_retry_exhausted"), true);
    assert.equal(result.alerts, 0);
    assert.equal(result.saved?.alertPending, null);
});
