import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";
import { getPendingRegistrationCollections } from "@/lib/auth/pending-registration";
import {
    ensureRegistrationRoutingRecord,
    getRegistrationRouting,
    setRegistrationMode,
    type RegistrationMode,
} from "@/lib/auth/registration-routing";
import crypto from "crypto";
import fs from "fs";
import { MongoClient, type Db } from "mongodb";

const command = process.argv[2];
const args = new Map<string, string>();
for (let index = 3; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "end"}`);
    args.set(key.slice(2), value);
}

const allowedTransitions = new Set(["legacy:paused", "paused:pending", "pending:paused", "paused:legacy"]);
const PENDING_STATUSES = ["pending_email", "email_verified", "provisioning", "provisioning_claimed"] as const;
const EMAIL_SENT_AUDIT_EVENTS = [
    "pending_registration.verification_sent",
    "pending_registration.recovery_verification_sent",
    "pending_registration.verification_resent",
    "pending_registration.email_corrected",
];
const MONITORING_LIMITS = {
    pendingStatusRecords: 1_000,
    pendingStatusDocuments: 5_000,
    manualReviewRecords: 100,
    manualReviewDocuments: 500,
    identityReservationDocuments: 500,
    auditDocuments: 20_000,
};
const SHORT_AUDIT_WINDOW_MS = 15 * 60 * 1000;
const LONG_AUDIT_WINDOW_MS = 60 * 60 * 1000;

type RuntimeSummary = {
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

function authenticateRoutingOperator() {
    const expectedHex = process.env.REGISTRATION_ROUTING_OPERATOR_TOKEN_SHA256 || "";
    if (!/^[a-f0-9]{64}$/i.test(expectedHex)) {
        throw new Error("Routing operator authorization verifier is not configured");
    }
    const input = fs.readFileSync(0, "utf8");
    const suppliedToken = input.endsWith("\r\n")
        ? input.slice(0, -2)
        : input.endsWith("\n")
          ? input.slice(0, -1)
          : input;
    if (!suppliedToken || suppliedToken.length > 1024 || /[\r\n]/.test(suppliedToken)) {
        throw new Error("Routing operator authorization input is invalid");
    }
    const expected = Buffer.from(expectedHex, "hex");
    const supplied = crypto.createHash("sha256").update(suppliedToken).digest();
    if (!crypto.timingSafeEqual(expected, supplied)) throw new Error("Routing operator authorization failed");
}

function safeAgeSeconds(value: unknown, now: Date): number | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1000));
}

function parseRuntimeSummary(raw: string | undefined): RuntimeSummary {
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

function runtimeRoutingConsistency(
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
            active: 0,
            oldestRemainingSeconds: null,
            oldestAgeSeconds: null,
            ageAvailable: false,
            ageUnavailableReason: "lock-documents-do-not-store-acquisition-time",
        };
    }
    const collection = db.collection<{ expiresAt?: Date }>(name);
    const filter = { expiresAt: { $gt: now } };
    const active = await collection.countDocuments(filter);
    const oldest = await collection
        .find(filter, { projection: { expiresAt: 1 } })
        .sort({ expiresAt: 1 })
        .limit(1)
        .next();
    const remaining =
        oldest?.expiresAt instanceof Date
            ? Math.max(0, Math.floor((oldest.expiresAt.getTime() - now.getTime()) / 1000))
            : null;
    return {
        active,
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
    const byClassification = Object.fromEntries(
        [...new Set(results.map((result) => result.classification))]
            .sort()
            .map((classification) => [
                classification,
                results.filter((result) => result.classification === classification).length,
            ]),
    );
    return {
        available: true,
        recordsExamined: results.length,
        byClassification,
        manualReview: results.filter((result) => result.classification.startsWith("manual_review_")).length,
        recoverableFinalize: results.filter((result) => result.classification === "recoverable_finalize").length,
        recordLimit: MONITORING_LIMITS.manualReviewRecords,
        pendingDocumentLimit: MONITORING_LIMITS.manualReviewDocuments,
        reservationDocumentLimit: MONITORING_LIMITS.identityReservationDocuments,
    };
}

async function getOperationsStatus(db: Db, options: { usersDirectory?: string; runtimeSummary?: string } = {}) {
    const now = new Date();
    const collectionNames = new Set(
        (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
    );
    const count = (name: string, filter: Record<string, unknown> = {}) =>
        collectionNames.has(name) ? db.collection(name).countDocuments(filter) : Promise.resolve(0);
    const routing = await getRegistrationRouting(db.collection("registrationRouting"));
    const configuredDeploymentId = process.env.REGISTRATION_DEPLOYMENT_ID || null;
    const pendingRegistrations = await count("pendingRegistrations", { status: { $ne: "provisioned" } });
    const reconciliationRequired = await count("pendingRegistrations", {
        reconciliationRequiredAt: { $ne: null },
        provisionedAt: { $exists: false },
    });
    const [provisioningLockMetrics, finalizationLockMetrics, pendingStatusMetrics, auditEvents, manualReview] =
        await Promise.all([
            getLockMetrics(db, collectionNames, "pendingRegistrationProvisioningLocks", now),
            getLockMetrics(db, collectionNames, "pendingRegistrationFinalizationLocks", now),
            getPendingStatusMetrics(db, collectionNames, pendingRegistrations, now),
            getAuditMetrics(db, collectionNames, now),
            getManualReviewMetrics(db, collectionNames, options.usersDirectory, pendingRegistrations),
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
        monitoringLimits: MONITORING_LIMITS,
    };
}

async function getRecoveryActivationStatus(db: Db) {
    const now = new Date();
    const collectionNames = new Set(
        (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
    );
    if (!collectionNames.has("pendingRegistrations")) {
        return { pendingRegistrations: 0, recoverablePendingRegistrations: 0, unsafePendingRegistrations: 0 };
    }
    const registrations = db.collection("pendingRegistrations");
    const pending = await registrations.find({ status: { $ne: "provisioned" } }, { projection: { _id: 1 } }).toArray();
    const candidates = await registrations
        .find(
            {
                status: "email_verified",
                verifiedAt: { $type: "date" },
                verifiedContinuationExpiresAt: { $lte: now },
                expiresAt: { $gt: now },
                reservedDid: null,
                reconciliationRequiredAt: null,
                accountId: null,
                accountDid: null,
                provisionedAt: null,
                provisioningClaimHash: null,
            },
            { projection: { _id: 1 } },
        )
        .toArray();
    let recoverablePendingRegistrations = 0;
    for (const candidate of candidates) {
        const pendingRegistrationId = candidate._id.toString();
        const [reservation, correlatedAccount] = await Promise.all([
            collectionNames.has("pendingRegistrationDidReservations")
                ? db
                      .collection<{ _id: string }>("pendingRegistrationDidReservations")
                      .findOne({ _id: pendingRegistrationId })
                : null,
            collectionNames.has("circles")
                ? db.collection("circles").findOne({ "metadata.pendingRegistrationId": pendingRegistrationId })
                : null,
        ]);
        if (!reservation && !correlatedAccount) recoverablePendingRegistrations += 1;
    }
    return {
        pendingRegistrations: pending.length,
        recoverablePendingRegistrations,
        unsafePendingRegistrations: pending.length - recoverablePendingRegistrations,
    };
}

async function preparePendingRegistrationIndexes(db: Db) {
    const duplicateCorrelation = await db
        .collection("circles")
        .aggregate([
            { $match: { "metadata.pendingRegistrationId": { $type: "string" } } },
            { $group: { _id: "$metadata.pendingRegistrationId", count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $limit: 1 },
        ])
        .next();
    if (duplicateCorrelation) {
        throw new Error("Duplicate pending-registration account correlations require manual review");
    }

    const collections = await getPendingRegistrationCollections(db);
    await db
        .collection("pendingRegistrationProvisioningLocks")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db
        .collection("pendingRegistrationFinalizationLocks")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db
        .collection("circles")
        .createIndex(
            { "metadata.pendingRegistrationId": 1 },
            { unique: true, partialFilterExpression: { "metadata.pendingRegistrationId": { $type: "string" } } },
        );

    return {
        indexesReady: true,
        pendingRegistrations: await collections.registrations.countDocuments(),
        didReservations: await collections.didReservations.countDocuments(),
        accountsWithPendingRegistration: await db
            .collection("circles")
            .countDocuments({ "metadata.pendingRegistrationId": { $type: "string" } }),
    };
}

async function run(db: Db) {
    if (command === "inspect") {
        const usersDirectory = args.get("users-dir");
        if (!usersDirectory) throw new Error("--users-dir is required");
        const results = await inspectPendingRegistrationReconciliation(db, {
            usersDirectory,
            pendingRegistrationId: args.get("pending-id"),
        });
        console.log(JSON.stringify({ count: results.length, results }, null, 2));
        return;
    }
    if (command === "route-status") {
        console.log(JSON.stringify(await getRegistrationRouting(db.collection("registrationRouting")), null, 2));
        return;
    }
    if (command === "operations-status") {
        console.log(
            JSON.stringify(
                await getOperationsStatus(db, {
                    usersDirectory: args.get("users-dir"),
                    runtimeSummary: args.get("runtime-summary"),
                }),
                null,
                2,
            ),
        );
        return;
    }
    if (command === "recovery-activation-status") {
        console.log(JSON.stringify(await getRecoveryActivationStatus(db), null, 2));
        return;
    }
    if (command === "prepare-indexes") {
        if (args.get("confirm") !== "PREPARE_PENDING_REGISTRATION_INDEXES") {
            throw new Error("Explicit index-preparation confirmation is required");
        }
        authenticateRoutingOperator();
        console.log(JSON.stringify(await preparePendingRegistrationIndexes(db), null, 2));
        return;
    }
    if (command === "route-set") {
        if (args.get("confirm") !== "SET_REGISTRATION_ROUTE") throw new Error("Explicit confirmation is required");
        authenticateRoutingOperator();
        const routing = await ensureRegistrationRoutingRecord(db, args.get("actor") || "operator-cli");
        const expectedMode = args.get("expected") as RegistrationMode;
        const mode = args.get("to") as RegistrationMode;
        if (
            !["legacy", "paused", "pending"].includes(expectedMode) ||
            !["legacy", "paused", "pending"].includes(mode)
        ) {
            throw new Error("Invalid routing mode");
        }
        if (!allowedTransitions.has(`${expectedMode}:${mode}`)) {
            throw new Error(`Unsupported routing transition: ${expectedMode} -> ${mode}`);
        }
        const deploymentArgument = args.get("deployment-id");
        const deploymentId = !deploymentArgument || deploymentArgument === "none" ? null : deploymentArgument;
        if (mode === "pending") {
            const configuredDeploymentId = process.env.REGISTRATION_DEPLOYMENT_ID;
            if (!configuredDeploymentId || deploymentId !== configuredDeploymentId) {
                throw new Error("Pending routing deployment id does not match REGISTRATION_DEPLOYMENT_ID");
            }
        } else if (deploymentId) {
            throw new Error(`${mode} routing requires --deployment-id none`);
        }
        const changed = await setRegistrationMode(
            { expectedMode, mode, deploymentId, updatedBy: args.get("actor") || "operator-cli" },
            db.collection("registrationRouting"),
        );
        if (!changed) throw new Error(`Routing change rejected; current mode is ${routing.mode}`);
        console.log(JSON.stringify(await getRegistrationRouting(db.collection("registrationRouting")), null, 2));
        return;
    }
    throw new Error(
        "Usage: inspect, route-status, operations-status, recovery-activation-status, prepare-indexes, or route-set",
    );
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    const client = new MongoClient(uri);
    try {
        await client.connect();
        await run(client.db(process.env.CIRCLES_MONGODB_DATABASE || "circles"));
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : "Operator command failed";
    console.error(/mongodb(?:\+srv)?:\/\//i.test(message) ? "Operator command failed during MongoDB access" : message);
    process.exit(1);
});
