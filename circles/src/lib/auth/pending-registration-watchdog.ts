import type { PendingRegistrationOperationsStatus } from "@/lib/auth/pending-registration-monitoring";
import {
    EMPTY_WATCHDOG_STATE,
    WATCHDOG_ALERT_DEDUPE_MS,
    WATCHDOG_ALERT_RETRY_MAX_ATTEMPTS,
    WATCHDOG_ALERT_RETRY_WINDOW_MS,
    WATCHDOG_STATE_SCHEMA_VERSION,
    evaluateOnboardingWatchdog,
    normalizeWatchdogState,
    type WatchdogLevel,
    type WatchdogPauseResult,
    type WatchdogPendingAlert,
    type WatchdogState,
} from "@/lib/auth/pending-registration-watchdog-policy";
import type { RegistrationRoutingRecord } from "@/lib/auth/registration-routing";

export type { WatchdogPauseResult } from "@/lib/auth/pending-registration-watchdog-policy";

export type WatchdogRunResult = {
    success: boolean;
    status: "skipped" | WatchdogLevel;
    reasons: string[];
    pauseResult: WatchdogPauseResult;
    alertAttempted: boolean;
    alertDelivered: boolean | null;
};

export type PendingRegistrationWatchdogDependencies = {
    getStatus: () => Promise<PendingRegistrationOperationsStatus>;
    getState: () => Promise<WatchdogState>;
    saveState: (state: WatchdogState) => Promise<void>;
    pausePendingRegistration: (deploymentId: string) => Promise<Exclude<WatchdogPauseResult, "not_requested">>;
    sendAlert: (alert: {
        fingerprint: string;
        level: Exclude<WatchdogLevel, "healthy">;
        reasons: string[];
        pauseResult: WatchdogPauseResult;
    }) => Promise<void>;
    alertConfigured: boolean;
    now: () => Date;
};

type AlertDependencies = Pick<PendingRegistrationWatchdogDependencies, "sendAlert" | "alertConfigured">;

export type MonitoringFailureWatchdogDependencies = {
    getRouting: () => Promise<Pick<RegistrationRoutingRecord, "mode" | "deploymentId">>;
    deploymentId: string | null;
    getState: () => Promise<WatchdogState>;
    saveState: (state: WatchdogState) => Promise<void>;
    pausePendingRegistration: (deploymentId: string) => Promise<Exclude<WatchdogPauseResult, "not_requested">>;
    sendAlert: PendingRegistrationWatchdogDependencies["sendAlert"];
    alertConfigured: boolean;
    now: () => Date;
};

function alertRetryable(alert: WatchdogPendingAlert | null, now: Date): alert is WatchdogPendingAlert {
    return Boolean(
        alert &&
            alert.attempts < WATCHDOG_ALERT_RETRY_MAX_ATTEMPTS &&
            alert.expiresAt instanceof Date &&
            alert.expiresAt > now,
    );
}

function failedAlertState(
    previous: WatchdogPendingAlert | null,
    alert: {
        fingerprint: string;
        level: Exclude<WatchdogLevel, "healthy">;
        reasons: string[];
        pauseResult: WatchdogPauseResult;
    },
    now: Date,
): WatchdogPendingAlert {
    const previousReasons = previous ? [...new Set(previous.reasons)].sort() : null;
    const nextReasons = [...new Set(alert.reasons)].sort();
    const sameAlert =
        previousReasons &&
        previousReasons.length === nextReasons.length &&
        previousReasons.every((reason, index) => reason === nextReasons[index])
            ? previous
            : null;
    const firstFailedAt = sameAlert?.firstFailedAt ?? now;
    return {
        fingerprint: alert.fingerprint,
        level: alert.level,
        reasons: alert.reasons,
        pauseResult: alert.pauseResult,
        firstFailedAt,
        lastAttemptAt: now,
        attempts: (sameAlert?.attempts ?? 0) + 1,
        expiresAt: new Date(firstFailedAt.getTime() + WATCHDOG_ALERT_RETRY_WINDOW_MS),
    };
}

async function tryAlert(
    state: WatchdogState,
    alert: {
        fingerprint: string;
        level: Exclude<WatchdogLevel, "healthy">;
        reasons: string[];
        pauseResult: WatchdogPauseResult;
    },
    dependencies: AlertDependencies,
    now: Date,
): Promise<{ state: WatchdogState; attempted: boolean; delivered: boolean }> {
    if (!dependencies.alertConfigured) {
        return {
            state: {
                ...state,
                alertPending: failedAlertState(state.alertPending, alert, now),
                lastAlertDeliveryStatus: "failed",
            },
            attempted: false,
            delivered: false,
        };
    }
    try {
        await dependencies.sendAlert(alert);
        return {
            state: {
                ...state,
                lastAlertFingerprint: alert.fingerprint,
                lastAlertAt: now,
                lastAlertDeliveryStatus: "delivered",
                alertPending: null,
            },
            attempted: true,
            delivered: true,
        };
    } catch {
        return {
            state: {
                ...state,
                lastAlertDeliveryStatus: "failed",
                alertPending: failedAlertState(state.alertPending, alert, now),
            },
            attempted: true,
            delivered: false,
        };
    }
}

async function retryPausedAlert(
    state: WatchdogState,
    dependencies: Pick<MonitoringFailureWatchdogDependencies, "saveState" | "sendAlert" | "alertConfigured">,
    now: Date,
): Promise<WatchdogRunResult> {
    if (state.alertPending && alertRetryable(state.alertPending, now)) {
        const pending = state.alertPending;
        const retry = await tryAlert(
            state,
            {
                fingerprint: pending.fingerprint,
                level: pending.level,
                reasons: pending.reasons,
                pauseResult: pending.pauseResult,
            },
            dependencies,
            now,
        );
        await dependencies.saveState({
            ...retry.state,
            updatedAt: now,
        });
        return {
            success: retry.delivered,
            status: "skipped",
            reasons: ["routing_paused", retry.delivered ? "alert_retry_delivered" : "alert_retry_pending"],
            pauseResult: "not_requested",
            alertAttempted: retry.attempted,
            alertDelivered: retry.delivered,
        };
    }
    if (state.alertPending) {
        await dependencies.saveState({
            ...state,
            alertPending: null,
            lastAlertDeliveryStatus: "failed",
            updatedAt: now,
        });
        return {
            success: false,
            status: "skipped",
            reasons: ["routing_paused", "alert_retry_exhausted"],
            pauseResult: "not_requested",
            alertAttempted: false,
            alertDelivered: false,
        };
    }
    return {
        success: true,
        status: "skipped",
        reasons: ["routing_not_pending"],
        pauseResult: "not_requested",
        alertAttempted: false,
        alertDelivered: null,
    };
}

export async function processPendingRegistrationMonitoringFailure(
    dependencies: MonitoringFailureWatchdogDependencies,
): Promise<WatchdogRunResult> {
    const now = dependencies.now();
    const routing = await dependencies.getRouting();
    if (routing.mode === "legacy") {
        return {
            success: true,
            status: "skipped",
            reasons: ["routing_not_pending"],
            pauseResult: "not_requested",
            alertAttempted: false,
            alertDelivered: null,
        };
    }

    const previousState = normalizeWatchdogState(
        (await dependencies.getState()) || EMPTY_WATCHDOG_STATE,
        dependencies.deploymentId,
    );
    if (routing.mode === "paused") {
        return retryPausedAlert(previousState, dependencies, now);
    }

    const consecutiveMonitoringUnavailable = previousState.consecutiveMonitoringUnavailable + 1;
    const level: WatchdogLevel = consecutiveMonitoringUnavailable >= 2 ? "critical" : "monitoring_unavailable";
    let pauseResult: WatchdogPauseResult = "not_requested";
    if (
        consecutiveMonitoringUnavailable >= 2 &&
        dependencies.deploymentId &&
        routing.deploymentId === dependencies.deploymentId
    ) {
        try {
            pauseResult = await dependencies.pausePendingRegistration(dependencies.deploymentId);
        } catch {
            pauseResult = "failed";
        }
    }

    const reasons = ["monitoring_query_failed"];
    const alertFingerprint = `${level}:${reasons.join(",")}`;
    let nextState: WatchdogState = {
        ...previousState,
        schemaVersion: WATCHDOG_STATE_SCHEMA_VERSION,
        deploymentId: dependencies.deploymentId,
        consecutiveMonitoringUnavailable,
        lastAttemptAt: now,
        lastFailureAt: now,
        lastLevel: level,
        updatedAt: now,
    };
    const pendingAlert = nextState.alertPending
        ? {
              fingerprint: nextState.alertPending.fingerprint,
              level: nextState.alertPending.level,
              reasons: nextState.alertPending.reasons,
              pauseResult: nextState.alertPending.pauseResult,
          }
        : null;
    const recentlyAlerted =
        previousState.lastAlertFingerprint === alertFingerprint &&
        previousState.lastAlertAt instanceof Date &&
        now.getTime() - previousState.lastAlertAt.getTime() < WATCHDOG_ALERT_DEDUPE_MS;
    const alert =
        pendingAlert && pendingAlert.fingerprint === alertFingerprint && alertRetryable(nextState.alertPending, now)
            ? pendingAlert
            : recentlyAlerted
              ? null
              : {
                    fingerprint: alertFingerprint,
                    level,
                    reasons,
                    pauseResult,
                };
    let alertAttempted = false;
    let alertDelivered: boolean | null = null;
    if (alert) {
        const attempt = await tryAlert(nextState, alert, dependencies, now);
        nextState = attempt.state;
        alertAttempted = attempt.attempted;
        alertDelivered = attempt.delivered;
    }

    try {
        await dependencies.saveState(nextState);
    } catch {
        reasons.push("watchdog_state_save_failed");
    }
    return {
        success: false,
        status: level,
        reasons,
        pauseResult,
        alertAttempted,
        alertDelivered,
    };
}

export async function processPendingRegistrationWatchdog(
    dependencies: PendingRegistrationWatchdogDependencies,
): Promise<WatchdogRunResult> {
    const now = dependencies.now();
    const status = await dependencies.getStatus();
    if (status.routing.mode === "legacy") {
        return {
            success: true,
            status: "skipped",
            reasons: ["routing_not_pending"],
            pauseResult: "not_requested",
            alertAttempted: false,
            alertDelivered: null,
        };
    }
    const deploymentId = status.runtime.registrationDeploymentId ?? status.routing.deploymentId;
    const previousState = normalizeWatchdogState((await dependencies.getState()) || EMPTY_WATCHDOG_STATE, deploymentId);

    if (status.routing.mode !== "pending") {
        if (
            status.routing.mode === "paused" &&
            previousState.alertPending &&
            alertRetryable(previousState.alertPending, now)
        ) {
            const pending = previousState.alertPending;
            const retry = await tryAlert(
                previousState,
                {
                    fingerprint: pending.fingerprint,
                    level: pending.level,
                    reasons: pending.reasons,
                    pauseResult: pending.pauseResult,
                },
                dependencies,
                now,
            );
            await dependencies.saveState({
                ...retry.state,
                updatedAt: now,
            });
            return {
                success: retry.delivered,
                status: "skipped",
                reasons: ["routing_paused", retry.delivered ? "alert_retry_delivered" : "alert_retry_pending"],
                pauseResult: "not_requested",
                alertAttempted: retry.attempted,
                alertDelivered: retry.delivered,
            };
        }
        if (status.routing.mode === "paused" && previousState.alertPending) {
            await dependencies.saveState({
                ...previousState,
                alertPending: null,
                lastAlertDeliveryStatus: "failed",
                updatedAt: now,
            });
            return {
                success: false,
                status: "skipped",
                reasons: ["routing_paused", "alert_retry_exhausted"],
                pauseResult: "not_requested",
                alertAttempted: false,
                alertDelivered: false,
            };
        }
        return {
            success: true,
            status: "skipped",
            reasons: ["routing_not_pending"],
            pauseResult: "not_requested",
            alertAttempted: false,
            alertDelivered: null,
        };
    }

    const evaluation = evaluateOnboardingWatchdog({
        status,
        previousState,
        now,
        alertConfigured: dependencies.alertConfigured,
    });

    let pauseResult: WatchdogPauseResult = "not_requested";
    const deploymentScoped =
        status.routing.mode === "pending" &&
        Boolean(status.routing.deploymentId) &&
        status.runtime.registrationDeploymentId === status.routing.deploymentId;
    if (evaluation.shouldPause && deploymentScoped) {
        try {
            pauseResult = await dependencies.pausePendingRegistration(status.routing.deploymentId!);
        } catch {
            pauseResult = "failed";
        }
    }

    let nextState = evaluation.nextState;
    if (nextState.alertPending && !alertRetryable(nextState.alertPending, now) && !evaluation.shouldAlert) {
        nextState = {
            ...nextState,
            alertPending: null,
            lastAlertDeliveryStatus: "failed",
        };
    }
    let alertAttempted = false;
    let alertDelivered: boolean | null = null;
    let currentAlert =
        evaluation.shouldAlert && evaluation.level !== "healthy"
            ? {
                  fingerprint: evaluation.alertFingerprint,
                  level: evaluation.level,
                  reasons: evaluation.reasons,
                  pauseResult,
              }
            : null;
    const expiredCurrentAlert =
        Boolean(currentAlert) &&
        nextState.alertPending?.fingerprint === currentAlert?.fingerprint &&
        !alertRetryable(nextState.alertPending, now);
    if (
        expiredCurrentAlert ||
        (!currentAlert && nextState.alertPending && !alertRetryable(nextState.alertPending, now))
    ) {
        nextState = {
            ...nextState,
            alertPending: null,
            lastAlertDeliveryStatus: "failed",
        };
        currentAlert = null;
    }
    const retryAlert =
        !currentAlert && nextState.alertPending && alertRetryable(nextState.alertPending, now)
            ? {
                  fingerprint: nextState.alertPending.fingerprint,
                  level: nextState.alertPending.level,
                  reasons: nextState.alertPending.reasons,
                  pauseResult: nextState.alertPending.pauseResult,
              }
            : null;
    const alert = currentAlert ?? retryAlert;
    if (alert) {
        const attempt = await tryAlert(nextState, alert, dependencies, now);
        nextState = {
            ...attempt.state,
            updatedAt: now,
        };
        alertAttempted = attempt.attempted;
        alertDelivered = attempt.delivered;
    } else {
        nextState = {
            ...nextState,
            updatedAt: now,
        };
    }

    let stateSaved = true;
    try {
        await dependencies.saveState(nextState);
    } catch {
        stateSaved = false;
    }

    return {
        success:
            stateSaved &&
            pauseResult !== "failed" &&
            (evaluation.level === "healthy" || dependencies.alertConfigured) &&
            (!alert || alertDelivered === true) &&
            !nextState.alertPending,
        status: evaluation.level,
        reasons: evaluation.reasons,
        pauseResult,
        alertAttempted,
        alertDelivered,
    };
}
