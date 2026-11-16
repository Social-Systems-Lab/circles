import crypto from "crypto";
import { ObjectId, type Db } from "mongodb";
import { normalizeEmailForComparison, permanentSignupAccountExists } from "@/lib/auth/email-normalization";
import {
    inspectPendingRegistrationReconciliation,
    type PendingRegistrationReconciliation,
} from "@/lib/auth/pending-registration-reconciliation";
import { getRegistrationRouting } from "@/lib/auth/registration-routing";

export const PENDING_STATUSES = ["pending_email", "email_verified", "provisioning", "provisioning_claimed"] as const;
export const MONITORING_LIMITS = {
    pendingStatusRecords: 1_000,
    pendingStatusDocuments: 5_000,
    manualReviewRecords: 100,
    manualReviewDocuments: 500,
    identityReservationDocuments: 500,
    auditDocuments: 20_000,
};
const EMAIL_SENT_AUDIT_EVENTS = [
    "pending_registration.verification_sent",
    "pending_registration.recovery_verification_sent",
    "pending_registration.verification_resent",
    "pending_registration.email_corrected",
];
const SHORT_AUDIT_WINDOW_MS = 15 * 60 * 1000;
const LONG_AUDIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_LOCK_FINGERPRINT_DOCUMENTS = 1_000;
export const WATCHDOG_STATE_SCHEMA_VERSION = 2;
export const WATCHDOG_HEARTBEAT_STALE_SECONDS = 10 * 60;
export const WATCHDOG_STUCK_PROVISIONING_SECONDS = 10 * 60;
const TRANSIENT_MANUAL_REVIEW_CLASSIFICATIONS = new Set([
    "manual_review_missing_credentials",
    "manual_review_orphan_credentials",
    "manual_review_claim_without_did",
]);

export type RuntimeSummary = {
    available: boolean;
    reason?: string;
    running?: boolean;
    pendingRegistrationEnabled?: boolean;
    pendingRegistrationJourneyReady?: boolean;
    pendingRegistrationHmacPresent?: boolean;
    registrationDeploymentId?: string | null;
    altchaConfigured?: boolean;
    postmarkConfigured?: boolean;
    emailTransport?: string | null;
};

type StoredWatchdogState = {
    _id?: string;
    schemaVersion?: unknown;
    deploymentId?: unknown;
    lastAttemptAt?: unknown;
    lastSuccessfulRunAt?: unknown;
    lastFailureAt?: unknown;
    lastLevel?: unknown;
    alertPending?: unknown;
};

export function summarizeWatchdogHeartbeat(
    routing: Awaited<ReturnType<typeof getRegistrationRouting>>,
    state: StoredWatchdogState | null,
    now = new Date(),
) {
    const notApplicable = {
        available: true as const,
        status: "not_applicable" as const,
        reason: routing.mode === "legacy" ? "routing_legacy" : "routing_paused",
        deploymentStateMatches: null,
        lastAttemptAt: null,
        lastSuccessfulRunAt: null,
        heartbeatAgeSeconds: null,
        staleAfterSeconds: WATCHDOG_HEARTBEAT_STALE_SECONDS,
        level: null,
        alertRetryPending: Boolean(state?.alertPending),
    };
    if (routing.mode !== "pending") return notApplicable;

    const deploymentStateMatches =
        state?.schemaVersion === WATCHDOG_STATE_SCHEMA_VERSION && state.deploymentId === routing.deploymentId;
    const common = {
        available: true as const,
        deploymentStateMatches,
        lastAttemptAt: state?.lastAttemptAt instanceof Date ? state.lastAttemptAt.toISOString() : null,
        lastSuccessfulRunAt:
            state?.lastSuccessfulRunAt instanceof Date ? state.lastSuccessfulRunAt.toISOString() : null,
        staleAfterSeconds: WATCHDOG_HEARTBEAT_STALE_SECONDS,
        level:
            state?.lastLevel === "healthy" ||
            state?.lastLevel === "warning" ||
            state?.lastLevel === "critical" ||
            state?.lastLevel === "monitoring_unavailable"
                ? state.lastLevel
                : null,
        alertRetryPending: Boolean(state?.alertPending),
    };
    if (!deploymentStateMatches) {
        return {
            ...common,
            status: "missing" as const,
            reason: state ? "deployment_state_mismatch_or_unversioned" : "heartbeat_state_missing",
            heartbeatAgeSeconds: null,
        };
    }
    if (!(state?.lastSuccessfulRunAt instanceof Date)) {
        const attempted = state?.lastAttemptAt instanceof Date || state?.lastFailureAt instanceof Date;
        return {
            ...common,
            status: attempted ? ("monitoring_failed" as const) : ("missing" as const),
            reason: attempted ? "no_successful_heartbeat_after_failure" : "heartbeat_state_missing",
            heartbeatAgeSeconds: null,
        };
    }
    if (state.lastAttemptAt instanceof Date && state.lastAttemptAt > state.lastSuccessfulRunAt) {
        return {
            ...common,
            status: "monitoring_failed" as const,
            reason: "latest_attempt_did_not_complete",
            heartbeatAgeSeconds: safeAgeSeconds(state.lastSuccessfulRunAt, now),
        };
    }
    const heartbeatAgeSeconds = safeAgeSeconds(state.lastSuccessfulRunAt, now);
    if (heartbeatAgeSeconds === null) {
        return {
            ...common,
            status: "missing" as const,
            reason: "heartbeat_timestamp_invalid",
            heartbeatAgeSeconds: null,
        };
    }
    if (heartbeatAgeSeconds > WATCHDOG_HEARTBEAT_STALE_SECONDS) {
        return {
            ...common,
            status: "stale" as const,
            reason: "heartbeat_expired",
            heartbeatAgeSeconds,
        };
    }
    return {
        ...common,
        status: "current" as const,
        reason: null,
        heartbeatAgeSeconds,
    };
}

function safeAgeSeconds(value: unknown, now: Date): number | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1000));
}

export function summarizeManualReviewResults(
    results: PendingRegistrationReconciliation[],
    options: {
        activeProvisioningPendingIds: Set<string>;
        activeFinalizationAccountIds: Set<string>;
        pendingUpdatedAtById: Map<string, Date>;
        now: Date;
    },
) {
    const manualReviewResults = results.filter((result) => result.classification.startsWith("manual_review_"));
    const transientResults = manualReviewResults.filter((result) => {
        if (!TRANSIENT_MANUAL_REVIEW_CLASSIFICATIONS.has(result.classification)) return false;
        if (result.status !== "provisioning" && result.status !== "provisioning_claimed") return false;
        const updatedAt = options.pendingUpdatedAtById.get(result.pendingRegistrationId);
        const ageSeconds = safeAgeSeconds(updatedAt, options.now);
        if (ageSeconds === null || ageSeconds > WATCHDOG_STUCK_PROVISIONING_SECONDS) return false;
        return (
            options.activeProvisioningPendingIds.has(result.pendingRegistrationId) ||
            Boolean(result.correlatedAccountId && options.activeFinalizationAccountIds.has(result.correlatedAccountId))
        );
    });
    const transientIds = new Set(transientResults.map((result) => result.pendingRegistrationId));
    const confirmedResults = manualReviewResults.filter((result) => !transientIds.has(result.pendingRegistrationId));
    return {
        manualReview: confirmedResults.length,
        transientActiveProvisioning: transientResults.length,
        byClassification: Object.fromEntries(
            [...new Set(confirmedResults.map((result) => result.classification))]
                .sort()
                .map((classification) => [
                    classification,
                    confirmedResults.filter((result) => result.classification === classification).length,
                ]),
        ),
    };
}

export function parseRuntimeSummary(raw: string | undefined): RuntimeSummary {
    if (!raw) return { available: false, reason: "runtime-summary-not-provided" };
    try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== "object") {
            return { available: false, reason: "invalid-runtime-summary" };
        }
        const deploymentId =
            typeof value.registrationDeploymentId === "string" &&
            /^[A-Za-z0-9._:-]{1,128}$/.test(value.registrationDeploymentId)
                ? value.registrationDeploymentId
                : null;
        const emailTransport = ["postmark", "mailpit"].includes(value.emailTransport) ? value.emailTransport : null;
        return {
            available: value.available === true,
            reason:
                typeof value.reason === "string" && /^[a-z0-9_-]{1,64}$/.test(value.reason) ? value.reason : undefined,
            running: value.running === true,
            pendingRegistrationEnabled: value.pendingRegistrationEnabled === true,
            pendingRegistrationJourneyReady: value.pendingRegistrationJourneyReady === true,
            pendingRegistrationHmacPresent: value.pendingRegistrationHmacPresent === true,
            registrationDeploymentId: deploymentId,
            altchaConfigured: value.altchaConfigured === true,
            postmarkConfigured: value.postmarkConfigured === true,
            emailTransport,
        };
    } catch {
        return { available: false, reason: "invalid-runtime-summary" };
    }
}

export function runtimeSummaryFromEnvironment(
    env: Record<string, string | undefined>,
    options: { running?: boolean } = {},
): RuntimeSummary {
    const deploymentId =
        typeof env.REGISTRATION_DEPLOYMENT_ID === "string" &&
        /^[A-Za-z0-9._:-]{1,128}$/.test(env.REGISTRATION_DEPLOYMENT_ID)
            ? env.REGISTRATION_DEPLOYMENT_ID
            : null;
    return {
        available: true,
        running: options.running === true,
        pendingRegistrationEnabled: env.PENDING_REGISTRATION_ENABLED === "true",
        pendingRegistrationJourneyReady: env.PENDING_REGISTRATION_JOURNEY_READY === "true",
        pendingRegistrationHmacPresent: Boolean(env.PENDING_REGISTRATION_TOKEN_HMAC_KEY?.trim()),
        registrationDeploymentId: deploymentId,
        altchaConfigured: Boolean(env.ALTCHA_HMAC_KEY?.trim()),
        postmarkConfigured: Boolean(env.POSTMARK_API_TOKEN?.trim() && env.POSTMARK_SENDER_EMAIL?.trim()),
        emailTransport:
            env.EMAIL_TRANSPORT === "postmark" || env.EMAIL_TRANSPORT === "mailpit" ? env.EMAIL_TRANSPORT : null,
    };
}

export function runtimeRoutingConsistency(
    routing: Awaited<ReturnType<typeof getRegistrationRouting>>,
    runtime: RuntimeSummary,
) {
    if (!runtime.available) {
        return {
            available: false,
            consistent: null,
            status: "unavailable",
            issues: ["runtime_summary_unavailable"],
        };
    }
    const issues: string[] = [];
    if (!runtime.running) issues.push("application_not_running");
    if (runtime.emailTransport !== "postmark") issues.push("email_transport_not_postmark");
    if (!runtime.altchaConfigured) issues.push("altcha_not_configured");
    if (!runtime.postmarkConfigured) issues.push("postmark_not_configured");

    const enabled = runtime.pendingRegistrationEnabled === true;
    const ready = runtime.pendingRegistrationJourneyReady === true;
    const hmacPresent = runtime.pendingRegistrationHmacPresent === true;
    const deploymentId = runtime.registrationDeploymentId ?? null;
    if (routing.mode === "pending") {
        if (!enabled || !ready || !hmacPresent) issues.push("pending_runtime_gates_incomplete");
        if (!deploymentId || deploymentId !== routing.deploymentId) {
            issues.push("pending_runtime_deployment_id_mismatch");
        }
    } else if (routing.mode === "legacy") {
        if (enabled || ready || hmacPresent || deploymentId) issues.push("legacy_runtime_not_default_off");
    } else {
        const defaultOff = !enabled && !ready && !hmacPresent && !deploymentId;
        const activationReady = enabled && ready && hmacPresent && Boolean(deploymentId);
        if (!defaultOff && !activationReady) issues.push("paused_runtime_state_ambiguous");
    }

    return {
        available: true,
        consistent: issues.length === 0,
        status: issues.length === 0 ? "consistent" : "inconsistent",
        issues,
    };
}

async function getPendingStatusMetrics(db: Db, collectionNames: Set<string>, pendingRegistrations: number, now: Date) {
    const counts = Object.fromEntries([...PENDING_STATUSES, "unknown"].map((status) => [status, 0]));
    const oldestAgeSecondsByStatus = Object.fromEntries(
        [...PENDING_STATUSES, "unknown"].map((status) => [status, null as number | null]),
    );
    const oldestUpdatedAgeSecondsByStatus = Object.fromEntries(
        [...PENDING_STATUSES, "unknown"].map((status) => [status, null as number | null]),
    );
    if (!collectionNames.has("pendingRegistrations")) {
        return {
            available: true,
            counts,
            oldestAgeSeconds: null,
            oldestStatus: null,
            oldestAgeSecondsByStatus,
            oldestUpdatedAgeSeconds: null,
            oldestUpdatedStatus: null,
            oldestUpdatedAgeSecondsByStatus,
            scanLimit: MONITORING_LIMITS.pendingStatusRecords,
            documentLimit: MONITORING_LIMITS.pendingStatusDocuments,
        };
    }
    const pendingDocuments = await db.collection("pendingRegistrations").estimatedDocumentCount();
    if (
        pendingRegistrations > MONITORING_LIMITS.pendingStatusRecords ||
        pendingDocuments > MONITORING_LIMITS.pendingStatusDocuments
    ) {
        return {
            available: false,
            reason: "pending-collection-exceeds-safe-status-scan",
            counts: null,
            oldestAgeSeconds: null,
            oldestStatus: null,
            oldestAgeSecondsByStatus: null,
            oldestUpdatedAgeSeconds: null,
            oldestUpdatedStatus: null,
            oldestUpdatedAgeSecondsByStatus: null,
            scanLimit: MONITORING_LIMITS.pendingStatusRecords,
            documentLimit: MONITORING_LIMITS.pendingStatusDocuments,
        };
    }

    const rows = await db
        .collection("pendingRegistrations")
        .aggregate<{ _id?: string; count: number; oldestCreatedAt?: Date; oldestUpdatedAt?: Date }>([
            { $match: { status: { $ne: "provisioned" } } },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    oldestCreatedAt: { $min: "$createdAt" },
                    oldestUpdatedAt: { $min: "$updatedAt" },
                },
            },
        ])
        .toArray();
    for (const row of rows) {
        const status =
            typeof row._id === "string" && (PENDING_STATUSES as readonly string[]).includes(row._id)
                ? row._id
                : "unknown";
        counts[status] = (counts[status] ?? 0) + row.count;
        const age = safeAgeSeconds(row.oldestCreatedAt, now);
        if (age !== null && (oldestAgeSecondsByStatus[status] === null || age > oldestAgeSecondsByStatus[status])) {
            oldestAgeSecondsByStatus[status] = age;
        }
        const updatedAge = safeAgeSeconds(row.oldestUpdatedAt, now);
        if (
            updatedAge !== null &&
            (oldestUpdatedAgeSecondsByStatus[status] === null || updatedAge > oldestUpdatedAgeSecondsByStatus[status])
        ) {
            oldestUpdatedAgeSecondsByStatus[status] = updatedAge;
        }
    }
    let oldestStatus: string | null = null;
    let oldestAgeSeconds: number | null = null;
    for (const [status, age] of Object.entries(oldestAgeSecondsByStatus)) {
        if (age !== null && (oldestAgeSeconds === null || age > oldestAgeSeconds)) {
            oldestStatus = status;
            oldestAgeSeconds = age;
        }
    }
    let oldestUpdatedStatus: string | null = null;
    let oldestUpdatedAgeSeconds: number | null = null;
    for (const [status, age] of Object.entries(oldestUpdatedAgeSecondsByStatus)) {
        if (age !== null && (oldestUpdatedAgeSeconds === null || age > oldestUpdatedAgeSeconds)) {
            oldestUpdatedStatus = status;
            oldestUpdatedAgeSeconds = age;
        }
    }
    return {
        available: true,
        counts,
        oldestAgeSeconds,
        oldestStatus,
        oldestAgeSecondsByStatus,
        oldestUpdatedAgeSeconds,
        oldestUpdatedStatus,
        oldestUpdatedAgeSecondsByStatus,
        scanLimit: MONITORING_LIMITS.pendingStatusRecords,
        documentLimit: MONITORING_LIMITS.pendingStatusDocuments,
    };
}

async function getLockMetrics(db: Db, collectionNames: Set<string>, name: string, now: Date) {
    if (!collectionNames.has(name)) {
        return {
            available: true,
            active: 0,
            fingerprint: null,
            oldestRemainingSeconds: null,
            oldestAgeSeconds: null,
            ageAvailable: false,
            ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
        };
    }
    const collection = db.collection<{ _id: unknown; pendingRegistrationId?: string; expiresAt?: Date }>(name);
    const filter = { expiresAt: { $gt: now } };
    const activeDocuments = await collection
        .find(filter, { projection: { pendingRegistrationId: 1, expiresAt: 1 } })
        .limit(MAX_LOCK_FINGERPRINT_DOCUMENTS + 1)
        .toArray();
    if (activeDocuments.length > MAX_LOCK_FINGERPRINT_DOCUMENTS) {
        return {
            available: false,
            reason: "active-lock-count-exceeds-safe-monitoring-scan",
            active: null,
            fingerprint: null,
            oldestRemainingSeconds: null,
            oldestAgeSeconds: null,
            ageAvailable: false,
            ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
        };
    }
    const identifiers = activeDocuments
        .map((document) =>
            typeof document.pendingRegistrationId === "string"
                ? document.pendingRegistrationId
                : String(document._id ?? ""),
        )
        .filter(Boolean)
        .sort();
    const oldest = activeDocuments.reduce<Date | null>((current, document) => {
        if (!(document.expiresAt instanceof Date)) return current;
        return !current || document.expiresAt < current ? document.expiresAt : current;
    }, null);
    const remaining =
        oldest instanceof Date ? Math.max(0, Math.floor((oldest.getTime() - now.getTime()) / 1000)) : null;
    return {
        available: true,
        active: activeDocuments.length,
        fingerprint:
            identifiers.length === 0
                ? null
                : crypto.createHash("sha256").update(identifiers.join("\n")).digest("hex").slice(0, 32),
        oldestRemainingSeconds: remaining,
        oldestAgeSeconds: null,
        ageAvailable: false,
        ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
    };
}

async function getAuditMetrics(db: Db, collectionNames: Set<string>, now: Date) {
    const empty = {
        emailSent: { last15Minutes: 0, last60Minutes: 0 },
        emailFailed: { last15Minutes: 0, last60Minutes: 0 },
        provisioningInterrupted: { last15Minutes: 0, last60Minutes: 0 },
    };
    if (!collectionNames.has("pendingRegistrationAuditEvents")) {
        return { available: true, ...empty, documentLimit: MONITORING_LIMITS.auditDocuments };
    }
    const collection = db.collection("pendingRegistrationAuditEvents");
    if ((await collection.estimatedDocumentCount()) > MONITORING_LIMITS.auditDocuments) {
        return {
            available: false,
            reason: "audit-collection-exceeds-safe-monitoring-scan",
            emailSent: null,
            emailFailed: null,
            provisioningInterrupted: null,
            documentLimit: MONITORING_LIMITS.auditDocuments,
        };
    }
    const shortCutoff = new Date(now.getTime() - SHORT_AUDIT_WINDOW_MS);
    const longCutoff = new Date(now.getTime() - LONG_AUDIT_WINDOW_MS);
    const rows = await collection
        .aggregate<{ _id: string; last15Minutes: number; last60Minutes: number }>([
            {
                $match: {
                    eventType: {
                        $in: [
                            ...EMAIL_SENT_AUDIT_EVENTS,
                            "pending_registration.email_delivery_failed",
                            "pending_registration.provisioning_interrupted",
                        ],
                    },
                    occurredAt: { $gte: longCutoff },
                },
            },
            {
                $group: {
                    _id: "$eventType",
                    last60Minutes: { $sum: 1 },
                    last15Minutes: {
                        $sum: { $cond: [{ $gte: ["$occurredAt", shortCutoff] }, 1, 0] },
                    },
                },
            },
        ])
        .toArray();
    const counts = new Map(rows.map((row) => [row._id, row]));
    const sentRows = EMAIL_SENT_AUDIT_EVENTS.map((eventType) => counts.get(eventType)).filter(Boolean);
    const emailSent = {
        last15Minutes: sentRows.reduce((sum, row) => sum + (row?.last15Minutes ?? 0), 0),
        last60Minutes: sentRows.reduce((sum, row) => sum + (row?.last60Minutes ?? 0), 0),
    };
    const failed = counts.get("pending_registration.email_delivery_failed");
    const interrupted = counts.get("pending_registration.provisioning_interrupted");
    return {
        available: true,
        emailSent,
        emailFailed: {
            last15Minutes: failed?.last15Minutes ?? 0,
            last60Minutes: failed?.last60Minutes ?? 0,
        },
        provisioningInterrupted: {
            last15Minutes: interrupted?.last15Minutes ?? 0,
            last60Minutes: interrupted?.last60Minutes ?? 0,
        },
        documentLimit: MONITORING_LIMITS.auditDocuments,
    };
}

async function getManualReviewMetrics(
    db: Db,
    collectionNames: Set<string>,
    usersDirectory: string | undefined,
    pendingRegistrations: number,
    now: Date,
) {
    if (!usersDirectory) {
        return { available: false, reason: "users-directory-not-provided", counts: null };
    }
    const pendingDocuments = collectionNames.has("pendingRegistrations")
        ? await db.collection("pendingRegistrations").estimatedDocumentCount()
        : 0;
    const reservationDocuments = collectionNames.has("pendingRegistrationDidReservations")
        ? await db.collection("pendingRegistrationDidReservations").estimatedDocumentCount()
        : 0;
    if (
        pendingRegistrations > MONITORING_LIMITS.manualReviewRecords ||
        pendingDocuments > MONITORING_LIMITS.manualReviewDocuments ||
        reservationDocuments > MONITORING_LIMITS.identityReservationDocuments
    ) {
        return {
            available: false,
            reason: "identity-data-exceeds-safe-manual-review-scan",
            counts: null,
            recordLimit: MONITORING_LIMITS.manualReviewRecords,
            pendingDocumentLimit: MONITORING_LIMITS.manualReviewDocuments,
            reservationDocumentLimit: MONITORING_LIMITS.identityReservationDocuments,
        };
    }
    const results = await inspectPendingRegistrationReconciliation(db, { usersDirectory });
    const [pendingRows, provisioningLocks, finalizationLocks] = await Promise.all([
        db
            .collection("pendingRegistrations")
            .find({ status: { $ne: "provisioned" } }, { projection: { status: 1, updatedAt: 1 } })
            .limit(MONITORING_LIMITS.manualReviewRecords + 1)
            .toArray(),
        collectionNames.has("pendingRegistrationProvisioningLocks")
            ? db
                  .collection<{ pendingRegistrationId?: unknown; expiresAt?: unknown }>(
                      "pendingRegistrationProvisioningLocks",
                  )
                  .find({ expiresAt: { $gt: now } }, { projection: { pendingRegistrationId: 1 } })
                  .limit(MAX_LOCK_FINGERPRINT_DOCUMENTS + 1)
                  .toArray()
            : [],
        collectionNames.has("pendingRegistrationFinalizationLocks")
            ? db
                  .collection<{ _id: unknown; expiresAt?: unknown }>("pendingRegistrationFinalizationLocks")
                  .find({ expiresAt: { $gt: now } }, { projection: { _id: 1 } })
                  .limit(MAX_LOCK_FINGERPRINT_DOCUMENTS + 1)
                  .toArray()
            : [],
    ]);
    if (
        pendingRows.length > MONITORING_LIMITS.manualReviewRecords ||
        provisioningLocks.length > MAX_LOCK_FINGERPRINT_DOCUMENTS ||
        finalizationLocks.length > MAX_LOCK_FINGERPRINT_DOCUMENTS
    ) {
        return {
            available: false,
            reason: "identity-data-exceeds-safe-manual-review-scan",
            counts: null,
            recordLimit: MONITORING_LIMITS.manualReviewRecords,
            pendingDocumentLimit: MONITORING_LIMITS.manualReviewDocuments,
            reservationDocumentLimit: MONITORING_LIMITS.identityReservationDocuments,
        };
    }
    const manualReview = summarizeManualReviewResults(results, {
        activeProvisioningPendingIds: new Set(
            provisioningLocks
                .map((lock) => (typeof lock.pendingRegistrationId === "string" ? lock.pendingRegistrationId : null))
                .filter((id): id is string => Boolean(id)),
        ),
        activeFinalizationAccountIds: new Set(finalizationLocks.map((lock) => String(lock._id))),
        pendingUpdatedAtById: new Map(
            pendingRows.map((row) => [
                row._id.toHexString(),
                row.updatedAt instanceof Date ? row.updatedAt : new Date(Number.NaN),
            ]),
        ),
        now,
    });
    return {
        available: true,
        recordsExamined: results.length,
        byClassification: manualReview.byClassification,
        manualReview: manualReview.manualReview,
        transientActiveProvisioning: manualReview.transientActiveProvisioning,
        recoverableFinalize: results.filter((result) => result.classification === "recoverable_finalize").length,
        recordLimit: MONITORING_LIMITS.manualReviewRecords,
        pendingDocumentLimit: MONITORING_LIMITS.manualReviewDocuments,
        reservationDocumentLimit: MONITORING_LIMITS.identityReservationDocuments,
    };
}

/** Read-only initial activation check; expiry never substitutes for checking retained identity evidence. */
export async function getPendingRegistrationActivationReadiness(db: Db, now = new Date()) {
    const registrations = db.collection("pendingRegistrations");
    const unfinished = { status: { $ne: "provisioned" } };
    const emptyIdentityFields = [
        "reservedDid",
        "accountId",
        "accountDid",
        "provisionedAt",
        "reconciliationRequiredAt",
        "provisioningClaimHash",
        "provisioningClaimedAt",
        "provisioningLeaseHash",
        "provisioningLeaseExpiresAt",
        "verifiedAt",
        "verifiedContinuationHash",
        "verifiedContinuationExpiresAt",
    ];
    const [pendingRegistrations, reconciliationRequired, provisioningLocks, finalizationLocks, records] =
        await Promise.all([
            registrations.countDocuments(unfinished),
            registrations.countDocuments({ reconciliationRequiredAt: { $ne: null } }),
            // Even expired/malformed retained locks require review; do not depend on TTL cleanup.
            db.collection("pendingRegistrationProvisioningLocks").countDocuments(),
            db.collection("pendingRegistrationFinalizationLocks").countDocuments(),
            registrations
                .find(unfinished, {
                    projection: Object.fromEntries([
                        ["status", 1],
                        ["expiresAt", 1],
                        ["provisioningAttempts", 1],
                        ["email", 1],
                        ["normalizedEmail", 1],
                        ["requestedHandle", 1],
                        ...emptyIdentityFields.map((field) => [field, 1]),
                    ]),
                })
                .limit(MONITORING_LIMITS.manualReviewRecords + 1)
                .toArray(),
        ]);
    let untouchedPendingEmail = 0;
    let expiredPendingEmail = 0;
    const scanComplete =
        pendingRegistrations <= MONITORING_LIMITS.manualReviewRecords && records.length === pendingRegistrations;
    if (scanComplete) {
        for (const record of records) {
            if (
                !(record._id instanceof ObjectId) ||
                record.status !== "pending_email" ||
                record.provisioningAttempts !== 0 ||
                typeof record.email !== "string" ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) ||
                typeof record.normalizedEmail !== "string" ||
                record.normalizedEmail !== normalizeEmailForComparison(record.email) ||
                typeof record.requestedHandle !== "string" ||
                record.requestedHandle.length < 3 ||
                record.requestedHandle.length > 20 ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.requestedHandle) ||
                !(record.expiresAt instanceof Date) ||
                !Number.isFinite(record.expiresAt.getTime()) ||
                !emptyIdentityFields.every((field) => record[field] === null)
            ) {
                continue;
            }
            const [reservation, account, permanentAccount] = await Promise.all([
                db
                    .collection<{ _id: string }>("pendingRegistrationDidReservations")
                    .findOne({ _id: record._id.toHexString() }, { projection: { _id: 1 } }),
                db
                    .collection("circles")
                    .findOne(
                        { "metadata.pendingRegistrationId": record._id.toHexString() },
                        { projection: { _id: 1 } },
                    ),
                permanentSignupAccountExists(db.collection("circles"), record.normalizedEmail, record.requestedHandle),
            ]);
            if (reservation || account || permanentAccount) continue;
            untouchedPendingEmail += 1;
            if (record.expiresAt <= now) expiredPendingEmail += 1;
        }
    }
    return {
        ready:
            scanComplete &&
            untouchedPendingEmail === pendingRegistrations &&
            reconciliationRequired === 0 &&
            provisioningLocks === 0 &&
            finalizationLocks === 0,
        pendingRegistrations,
        untouchedPendingEmail,
        expiredPendingEmail,
        reconciliationRequired,
        provisioningLocks,
        finalizationLocks,
    };
}

export async function getOperationsStatus(db: Db, options: { usersDirectory?: string; runtimeSummary?: string } = {}) {
    const now = new Date();
    const collectionNames = new Set(
        (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
    );
    const count = (name: string, filter: Record<string, unknown> = {}) =>
        collectionNames.has(name) ? db.collection(name).countDocuments(filter) : Promise.resolve(0);
    const routing = await getRegistrationRouting(db.collection("registrationRouting"));
    const watchdogState = collectionNames.has("onboardingWatchdogState")
        ? await db.collection<StoredWatchdogState>("onboardingWatchdogState").findOne({ _id: "onboarding-watchdog" })
        : null;
    const configuredDeploymentId = process.env.REGISTRATION_DEPLOYMENT_ID || null;
    const pendingRegistrations = await count("pendingRegistrations", { status: { $ne: "provisioned" } });
    const reconciliationRequired = await count("pendingRegistrations", {
        // Finalization clears this marker. Null/missing provisionedAt must not hide an interrupted claim.
        reconciliationRequiredAt: { $ne: null },
    });
    const [provisioningLockMetrics, finalizationLockMetrics, pendingStatusMetrics, auditEvents, manualReview] =
        await Promise.all([
            getLockMetrics(db, collectionNames, "pendingRegistrationProvisioningLocks", now),
            getLockMetrics(db, collectionNames, "pendingRegistrationFinalizationLocks", now),
            getPendingStatusMetrics(db, collectionNames, pendingRegistrations, now),
            getAuditMetrics(db, collectionNames, now),
            getManualReviewMetrics(db, collectionNames, options.usersDirectory, pendingRegistrations, now),
        ]);
    const runtime = parseRuntimeSummary(options.runtimeSummary);
    return {
        routing,
        configuredDeploymentId,
        deploymentIdMatches:
            routing.mode !== "pending" ||
            Boolean(configuredDeploymentId && routing.deploymentId === configuredDeploymentId),
        pendingRegistrations,
        reconciliationRequired,
        activeProvisioningLocks: provisioningLockMetrics.active,
        activeFinalizationLocks: finalizationLockMetrics.active,
        observedAt: now.toISOString(),
        pendingStatusMetrics,
        lockMetrics: {
            provisioning: provisioningLockMetrics,
            finalization: finalizationLockMetrics,
        },
        manualReviewMetrics: manualReview,
        auditEvents,
        runtime,
        runtimeRoutingConsistency: runtimeRoutingConsistency(routing, runtime),
        watchdogHeartbeat: summarizeWatchdogHeartbeat(routing, watchdogState, now),
        monitoringLimits: MONITORING_LIMITS,
    };
}

export type PendingRegistrationOperationsStatus = Awaited<ReturnType<typeof getOperationsStatus>>;
