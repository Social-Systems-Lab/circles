import {
    WATCHDOG_STATE_SCHEMA_VERSION,
    WATCHDOG_STUCK_PROVISIONING_SECONDS,
    type PendingRegistrationOperationsStatus,
} from "@/lib/auth/pending-registration-monitoring";

export { WATCHDOG_STATE_SCHEMA_VERSION, WATCHDOG_STUCK_PROVISIONING_SECONDS };

export const WATCHDOG_WARNING_PENDING_REGISTRATIONS = 10;
export const WATCHDOG_CRITICAL_PENDING_REGISTRATIONS = 25;
export const WATCHDOG_ALERT_DEDUPE_MS = 30 * 60 * 1000;
export const WATCHDOG_ALERT_RETRY_WINDOW_MS = 30 * 60 * 1000;
export const WATCHDOG_ALERT_RETRY_MAX_ATTEMPTS = 6;
const LOCK_REPEAT_WINDOW_MS = 15 * 60 * 1000;
const OLD_CONTINUATION_WARNING_SECONDS = 25 * 60;

export type WatchdogLevel = "healthy" | "warning" | "critical" | "monitoring_unavailable";
export type WatchdogPauseResult = "not_requested" | "paused" | "already_paused" | "not_pending" | "failed";
export type WatchdogAlertDeliveryStatus = "delivered" | "failed" | null;

export type WatchdogPendingAlert = {
    fingerprint: string;
    level: Exclude<WatchdogLevel, "healthy">;
    reasons: string[];
    pauseResult: WatchdogPauseResult;
    firstFailedAt: Date;
    lastAttemptAt: Date;
    attempts: number;
    expiresAt: Date;
};

export type WatchdogState = {
    _id: "onboarding-watchdog";
    schemaVersion: number;
    deploymentId: string | null;
    consecutiveMonitoringUnavailable: number;
    lockFingerprint: string | null;
    lockObservedAt: Date | null;
    lastAlertFingerprint: string | null;
    lastAlertAt: Date | null;
    lastAlertDeliveryStatus: WatchdogAlertDeliveryStatus;
    alertPending: WatchdogPendingAlert | null;
    lastAttemptAt: Date | null;
    lastSuccessfulRunAt: Date | null;
    lastFailureAt: Date | null;
    lastLevel: WatchdogLevel | null;
    updatedAt: Date | null;
};

export type WatchdogEvaluation = {
    level: WatchdogLevel;
    reasons: string[];
    shouldPause: boolean;
    shouldAlert: boolean;
    alertFingerprint: string;
    nextState: WatchdogState;
};

export const EMPTY_WATCHDOG_STATE: WatchdogState = {
    _id: "onboarding-watchdog",
    schemaVersion: WATCHDOG_STATE_SCHEMA_VERSION,
    deploymentId: null,
    consecutiveMonitoringUnavailable: 0,
    lockFingerprint: null,
    lockObservedAt: null,
    lastAlertFingerprint: null,
    lastAlertAt: null,
    lastAlertDeliveryStatus: null,
    alertPending: null,
    lastAttemptAt: null,
    lastSuccessfulRunAt: null,
    lastFailureAt: null,
    lastLevel: null,
    updatedAt: null,
};

export function normalizeWatchdogState(
    state: Partial<WatchdogState> | null,
    deploymentId: string | null,
): WatchdogState {
    if (!state || state.schemaVersion !== WATCHDOG_STATE_SCHEMA_VERSION || state.deploymentId !== deploymentId) {
        return {
            ...EMPTY_WATCHDOG_STATE,
            deploymentId,
        };
    }
    return {
        ...EMPTY_WATCHDOG_STATE,
        ...state,
        schemaVersion: WATCHDOG_STATE_SCHEMA_VERSION,
        deploymentId,
    };
}

const currentLockFingerprint = (status: PendingRegistrationOperationsStatus): string | null => {
    const provisioning = status.lockMetrics.provisioning;
    const finalization = status.lockMetrics.finalization;
    const values = [
        typeof provisioning.active === "number" && provisioning.active > 0 ? provisioning.fingerprint : null,
        typeof finalization.active === "number" && finalization.active > 0 ? finalization.fingerprint : null,
    ].filter((value): value is string => Boolean(value));
    return values.length ? values.join(":") : null;
};

const currentActiveLockCount = (status: PendingRegistrationOperationsStatus): number => {
    const provisioning = status.lockMetrics.provisioning.active;
    const finalization = status.lockMetrics.finalization.active;
    return (
        (typeof provisioning === "number" ? provisioning : 0) + (typeof finalization === "number" ? finalization : 0)
    );
};

const provisioningAge = (status: PendingRegistrationOperationsStatus): number | null => {
    if (!status.pendingStatusMetrics.available) return null;
    const ages = status.pendingStatusMetrics.oldestUpdatedAgeSecondsByStatus;
    if (!ages) return null;
    const values = [ages.provisioning, ages.provisioning_claimed].filter((value): value is number => value !== null);
    return values.length ? Math.max(...values) : null;
};

const alertFingerprint = (level: WatchdogLevel, reasons: string[]): string =>
    `${level}:${[...new Set(reasons)].sort().join(",")}`;

export function evaluateOnboardingWatchdog(input: {
    status: PendingRegistrationOperationsStatus;
    previousState: WatchdogState;
    now: Date;
    alertConfigured: boolean;
}): WatchdogEvaluation {
    const { status, now, alertConfigured } = input;
    const deploymentId = status.routing.deploymentId;
    const previousState = normalizeWatchdogState(input.previousState, deploymentId);
    const critical: string[] = [];
    const warnings: string[] = [];
    const unavailable: string[] = [];

    const runtime = status.runtimeRoutingConsistency;
    if (!runtime.available) {
        unavailable.push("runtime_routing_unavailable");
    } else if (!runtime.consistent) {
        critical.push(...runtime.issues.map((issue) => `runtime_${issue}`));
    }
    if (!status.deploymentIdMatches) critical.push("deployment_id_mismatch");

    if (!status.manualReviewMetrics.available) {
        unavailable.push("manual_review_unavailable");
    } else if ((status.manualReviewMetrics.manualReview ?? 0) > 0) {
        critical.push("manual_review_required");
    }

    if (
        !status.pendingStatusMetrics.available ||
        !status.auditEvents.available ||
        !status.lockMetrics.provisioning.available ||
        !status.lockMetrics.finalization.available
    ) {
        unavailable.push("bounded_monitoring_unavailable");
    }
    if (!alertConfigured) unavailable.push("alert_recipient_unavailable");

    const activeLocks = currentActiveLockCount(status);
    const lockFingerprint = currentLockFingerprint(status);
    if (activeLocks > 0) {
        const repeated =
            Boolean(lockFingerprint) &&
            lockFingerprint === previousState.lockFingerprint &&
            previousState.lockObservedAt instanceof Date &&
            now.getTime() - previousState.lockObservedAt.getTime() <= LOCK_REPEAT_WINDOW_MS;
        if (repeated) critical.push("persistent_active_lock");
        else warnings.push("active_lock_in_flight");
    }

    const oldestProvisioningAge = provisioningAge(status);
    if (oldestProvisioningAge !== null && oldestProvisioningAge > WATCHDOG_STUCK_PROVISIONING_SECONDS) {
        critical.push("stuck_provisioning");
    }
    if (status.reconciliationRequired > 0) warnings.push("reconciliation_in_progress");

    if (status.pendingStatusMetrics.available) {
        const oldestAges = status.pendingStatusMetrics.oldestAgeSecondsByStatus;
        if (oldestAges && (oldestAges.pending_email ?? 0) > OLD_CONTINUATION_WARNING_SECONDS) {
            warnings.push("old_pending_email");
        }
        if (oldestAges && (oldestAges.email_verified ?? 0) > OLD_CONTINUATION_WARNING_SECONDS) {
            warnings.push("old_verified_continuation");
        }
    }

    if (status.auditEvents.available) {
        const emailFailed = status.auditEvents.emailFailed?.last15Minutes ?? 0;
        const emailSent = status.auditEvents.emailSent?.last15Minutes ?? 0;
        const emailTotal = emailFailed + emailSent;
        if (emailFailed >= 3 || (emailTotal >= 10 && emailFailed / emailTotal > 0.1)) {
            critical.push("email_failure_burst");
        } else if (emailFailed > 0) {
            warnings.push("isolated_email_failure");
        }
        const interrupted = status.auditEvents.provisioningInterrupted?.last15Minutes ?? 0;
        if (interrupted >= 3) critical.push("provisioning_interruption_burst");
        else if (interrupted > 0) warnings.push("provisioning_interrupted_recently");
    }

    if (status.pendingRegistrations > WATCHDOG_CRITICAL_PENDING_REGISTRATIONS) {
        critical.push("excessive_unfinished_registrations");
    } else if (status.pendingRegistrations > WATCHDOG_WARNING_PENDING_REGISTRATIONS) {
        warnings.push("elevated_unfinished_registrations");
    }

    const consecutiveMonitoringUnavailable = unavailable.length
        ? previousState.consecutiveMonitoringUnavailable + 1
        : 0;
    let level: WatchdogLevel;
    let reasons: string[];
    if (critical.length) {
        level = "critical";
        reasons = [...new Set([...critical, ...unavailable])];
    } else if (unavailable.length) {
        reasons = ["monitoring_unavailable", ...unavailable];
        if (consecutiveMonitoringUnavailable >= 2) {
            level = "critical";
            reasons.push("monitoring_unavailable_persistent");
        } else {
            level = "monitoring_unavailable";
        }
    } else if (warnings.length) {
        level = "warning";
        reasons = warnings;
    } else {
        level = "healthy";
        reasons = [];
    }

    const fingerprint = alertFingerprint(level, reasons);
    const recentlyAlerted =
        previousState.lastAlertFingerprint === fingerprint &&
        previousState.lastAlertAt instanceof Date &&
        now.getTime() - previousState.lastAlertAt.getTime() < WATCHDOG_ALERT_DEDUPE_MS;
    const shouldAlert = level !== "healthy" && !recentlyAlerted;

    return {
        level,
        reasons: [...new Set(reasons)].sort(),
        shouldPause: level === "critical",
        shouldAlert,
        alertFingerprint: alertFingerprint(level, reasons),
        nextState: {
            ...previousState,
            schemaVersion: WATCHDOG_STATE_SCHEMA_VERSION,
            deploymentId,
            consecutiveMonitoringUnavailable,
            lockFingerprint,
            lockObservedAt: activeLocks > 0 ? now : null,
            lastAttemptAt: now,
            lastSuccessfulRunAt: now,
            lastLevel: level,
            updatedAt: now,
        },
    };
}
