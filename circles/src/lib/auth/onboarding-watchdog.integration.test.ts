import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client as MinioClient } from "minio";
import { MongoClient, ObjectId } from "mongodb";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { test } from "bun:test";
import type { PendingRegistrationOperationsStatus } from "@/lib/auth/pending-registration-monitoring";
import { getRegistrationRouting, type RegistrationRoutingRecord } from "@/lib/auth/registration-routing";
import {
    EMPTY_WATCHDOG_STATE,
    WATCHDOG_STATE_SCHEMA_VERSION,
    type WatchdogState,
} from "@/lib/auth/pending-registration-watchdog-policy";
import { processPendingRegistrationWatchdog } from "@/lib/auth/pending-registration-watchdog";
import { pausePendingRegistrationForWatchdog } from "@/lib/auth/pending-registration-watchdog-control";

const enabled = process.env.ONBOARDING_WATCHDOG_INTEGRATION_TEST === "1";
if (!enabled) {
    console.log("onboarding watchdog integration test skipped: explicit opt-in is not set");
}

const hash = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const readStream = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
};

if (enabled) {
    test("automatic pause preserves accounts, pending rows, credential files, MinIO objects and existing-user access", async () => {
        assert.equal(process.env.NODE_ENV, "test");
        const mongoUri = process.env.MONGODB_URI;
        const databaseName = process.env.CIRCLES_MONGODB_DATABASE;
        const usersRoot = process.env.ONBOARDING_USERS_DIR;
        const minioEndpoint = process.env.MINIO_HOST;
        const minioPort = Number(process.env.MINIO_PORT);
        assert.ok(mongoUri && /^mongodb:\/\//.test(mongoUri));
        assert.ok(databaseName?.startsWith("circles_stage1a_test_watchdog_"));
        assert.ok(usersRoot && fs.realpathSync(usersRoot).startsWith(`${fs.realpathSync(os.tmpdir())}${path.sep}`));
        assert.equal(minioEndpoint, "127.0.0.1");
        assert.equal(minioPort, 29001);

        const databaseUrl = new URL(mongoUri);
        assert.equal(databaseUrl.hostname, "127.0.0.1");
        assert.equal(databaseUrl.port, "27029");

        const mongo = new MongoClient(mongoUri);
        const minio = new MinioClient({
            endPoint: minioEndpoint,
            port: minioPort,
            useSSL: false,
            accessKey: process.env.MINIO_ROOT_USERNAME!,
            secretKey: process.env.MINIO_ROOT_PASSWORD!,
        });
        const did = crypto.randomBytes(32).toString("hex");
        const accountId = new ObjectId();
        const pendingId = new ObjectId();
        const deploymentId = "production-onboarding-20261115-watchdog-01";
        const bucket = `watchdog-${crypto.randomBytes(6).toString("hex")}`;
        const objectName = `profiles/${did}/avatar.txt`;
        const objectBytes = Buffer.from("synthetic-minio-object");

        try {
            await mongo.connect();
            const db = mongo.db(databaseName);
            await db.collection<RegistrationRoutingRecord>("registrationRouting").insertOne({
                _id: "registration-routing",
                mode: "pending",
                deploymentId,
                updatedAt: new Date("2026-11-15T12:00:00.000Z"),
                updatedBy: "integration-test",
            });
            await db.collection("circles").insertOne({
                _id: accountId,
                did,
                circleType: "user",
                handle: "synthetic-existing-user",
                email: "synthetic@example.test",
                publicKey: "synthetic-public-key",
            });
            await db.collection("pendingRegistrations").insertOne({
                _id: pendingId,
                status: "provisioning_claimed",
                reservedDid: did,
                reconciliationRequiredAt: new Date("2026-11-15T11:55:00.000Z"),
            });

            const credentialDirectory = path.join(usersRoot, did);
            fs.mkdirSync(credentialDirectory, { recursive: true, mode: 0o700 });
            const credentialFiles = ["salt.bin", "iv.bin", "publicKey.pem", "privateKey.pem.enc"];
            for (const filename of credentialFiles) {
                fs.writeFileSync(path.join(credentialDirectory, filename), `synthetic-${filename}`, { mode: 0o600 });
            }

            await minio.makeBucket(bucket);
            await minio.putObject(bucket, objectName, objectBytes);

            const accountBefore = await db.collection("circles").findOne({ _id: accountId });
            const pendingBefore = await db.collection("pendingRegistrations").findOne({ _id: pendingId });
            const filesBefore = Object.fromEntries(
                credentialFiles.map((filename) => [
                    filename,
                    hash(fs.readFileSync(path.join(credentialDirectory, filename))),
                ]),
            );
            const minioBefore = hash(await readStream(await minio.getObject(bucket, objectName)));

            const routing = await getRegistrationRouting(db.collection("registrationRouting"));
            const criticalStatus = {
                routing,
                configuredDeploymentId: routing.deploymentId,
                deploymentIdMatches: true,
                pendingRegistrations: 1,
                reconciliationRequired: 1,
                activeProvisioningLocks: 0,
                activeFinalizationLocks: 0,
                observedAt: new Date().toISOString(),
                pendingStatusMetrics: {
                    available: true,
                    counts: {
                        pending_email: 0,
                        email_verified: 0,
                        provisioning: 0,
                        provisioning_claimed: 1,
                        unknown: 0,
                    },
                    oldestAgeSeconds: 300,
                    oldestStatus: "provisioning_claimed",
                    oldestAgeSecondsByStatus: {
                        pending_email: null,
                        email_verified: null,
                        provisioning: null,
                        provisioning_claimed: 300,
                        unknown: null,
                    },
                    oldestUpdatedAgeSeconds: 300,
                    oldestUpdatedStatus: "provisioning_claimed",
                    oldestUpdatedAgeSecondsByStatus: {
                        pending_email: null,
                        email_verified: null,
                        provisioning: null,
                        provisioning_claimed: 300,
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
                    recordsExamined: 1,
                    byClassification: { manual_review_account_mismatch: 1 },
                    manualReview: 1,
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
                    pendingRegistrationEnabled: true,
                    pendingRegistrationJourneyReady: true,
                    pendingRegistrationHmacPresent: true,
                    registrationDeploymentId: routing.deploymentId,
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

            const stateCollection = db.collection<WatchdogState>("onboardingWatchdogState");
            let injectAlertFailure = true;
            let alertAttempts = 0;
            const result = await processPendingRegistrationWatchdog({
                getStatus: async () => criticalStatus,
                getState: async () =>
                    (await stateCollection.findOne({ _id: "onboarding-watchdog" })) ?? EMPTY_WATCHDOG_STATE,
                saveState: async (state) => {
                    await stateCollection.replaceOne({ _id: "onboarding-watchdog" }, state, { upsert: true });
                },
                pausePendingRegistration: (deploymentId) =>
                    pausePendingRegistrationForWatchdog(db.collection("registrationRouting"), deploymentId),
                sendAlert: async () => {
                    alertAttempts += 1;
                    if (injectAlertFailure) throw new Error("synthetic alert failure");
                },
                alertConfigured: true,
                now: () => new Date("2026-11-15T12:00:00.000Z"),
            });

            assert.equal(result.pauseResult, "paused");
            assert.equal(result.alertDelivered, false);
            assert.equal(result.success, false);
            assert.equal((await getRegistrationRouting(db.collection("registrationRouting"))).mode, "paused");
            const failedState = await stateCollection.findOne({ _id: "onboarding-watchdog" });
            assert.equal(failedState?.alertPending?.attempts, 1);
            assert.equal(failedState?.schemaVersion, WATCHDOG_STATE_SCHEMA_VERSION);
            assert.equal(failedState?.deploymentId, deploymentId);
            assert.ok(failedState?.lastSuccessfulRunAt instanceof Date);

            injectAlertFailure = false;
            const retryStatus = {
                ...criticalStatus,
                routing: {
                    ...criticalStatus.routing,
                    mode: "paused",
                    deploymentId: null,
                },
            } as PendingRegistrationOperationsStatus;
            const retry = await processPendingRegistrationWatchdog({
                getStatus: async () => retryStatus,
                getState: async () =>
                    (await stateCollection.findOne({ _id: "onboarding-watchdog" })) ?? EMPTY_WATCHDOG_STATE,
                saveState: async (state) => {
                    await stateCollection.replaceOne({ _id: "onboarding-watchdog" }, state, { upsert: true });
                },
                pausePendingRegistration: async () => {
                    throw new Error("alert retry must not attempt to change routing");
                },
                sendAlert: async () => {
                    alertAttempts += 1;
                },
                alertConfigured: true,
                now: () => new Date("2026-11-15T12:05:00.000Z"),
            });
            assert.equal(retry.status, "skipped");
            assert.equal(retry.alertDelivered, true);
            assert.equal(retry.pauseResult, "not_requested");
            assert.equal(alertAttempts, 2);
            assert.equal((await getRegistrationRouting(db.collection("registrationRouting"))).mode, "paused");
            assert.equal((await stateCollection.findOne({ _id: "onboarding-watchdog" }))?.alertPending, null);

            assert.deepEqual(await db.collection("circles").findOne({ _id: accountId }), accountBefore);
            assert.deepEqual(await db.collection("pendingRegistrations").findOne({ _id: pendingId }), pendingBefore);
            assert.deepEqual(
                Object.fromEntries(
                    credentialFiles.map((filename) => [
                        filename,
                        hash(fs.readFileSync(path.join(credentialDirectory, filename))),
                    ]),
                ),
                filesBefore,
            );
            assert.equal(hash(await readStream(await minio.getObject(bucket, objectName))), minioBefore);

            const existingUserRead = await db.collection("circles").findOne({
                did,
                circleType: "user",
                handle: "synthetic-existing-user",
            });
            assert.equal(existingUserRead?._id.toString(), accountId.toString());
        } finally {
            try {
                await minio.removeObject(bucket, objectName);
                await minio.removeBucket(bucket);
            } catch {}
            await mongo.close();
        }
    });
}
