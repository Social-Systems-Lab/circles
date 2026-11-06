import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
import { MongoClient, ObjectId } from "mongodb";
import {
    acquirePendingRegistrationProvisioningClaim,
    ensurePendingRegistrationIndexes,
    getVerifiedPendingRegistration,
    hashPendingRegistrationSecret,
    requestPendingRegistrationRecovery,
    reservePendingRegistrationDid,
    verifyPendingRegistrationEmail,
    type PendingRegistration,
} from "@/lib/auth/pending-registration";
import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";

async function main() {
    const uri = process.env.PENDING_REGISTRATION_TEST_MONGODB_URI;
    const databaseName = process.env.PENDING_REGISTRATION_TEST_DATABASE;
    if (!uri || !databaseName) {
        console.log("pending-registration integration test skipped: disposable MongoDB configuration is not set");
        return;
    }
    if (!/^circles_stage1a_test_pending_[a-z0-9_-]+$/i.test(databaseName)) {
        throw new Error("Integration test database must use the circles_stage1a_test_pending_* safety prefix");
    }
    const parsedUri = new URL(uri);
    const uriDatabaseName = decodeURIComponent(parsedUri.pathname.replace(/^\//, ""));
    if (
        parsedUri.protocol !== "mongodb:" ||
        parsedUri.hostname !== "127.0.0.1" ||
        parsedUri.port !== "27019" ||
        net.isIP(parsedUri.hostname) !== 4 ||
        parsedUri.username ||
        parsedUri.password ||
        parsedUri.search ||
        uriDatabaseName !== databaseName
    ) {
        throw new Error("Integration test requires the dedicated loopback MongoDB endpoint and matching database URI");
    }
    const client = new MongoClient(uri);
    const projectDirectory = path.resolve(process.cwd());
    const tempRoot = path.resolve(os.tmpdir());
    if (tempRoot === projectDirectory || tempRoot.startsWith(`${projectDirectory}${path.sep}`)) {
        throw new Error("System temporary directory must be outside the project before creating test credentials");
    }
    const usersDirectory = fs.mkdtempSync(path.join(tempRoot, "pending-registration-integration-"));
    if (path.resolve(usersDirectory).startsWith(`${projectDirectory}${path.sep}`)) {
        throw new Error("Integration credentials directory must be outside the project");
    }
    try {
        await client.connect();
        const db = client.db(databaseName);
        await db.dropDatabase();
        const collections = {
            registrations: db.collection<PendingRegistration>("pendingRegistrations"),
            didReservations: db.collection("pendingRegistrationDidReservations"),
            rateLimits: db.collection("pendingRegistrationRateLimits"),
            auditEvents: db.collection("pendingRegistrationAuditEvents"),
        } as any;
        await ensurePendingRegistrationIndexes(collections);

        const recoveryId = new ObjectId();
        const recoveryNow = new Date();
        const recoveryEmail = "recovery-integration@example.invalid";
        await collections.registrations.insertOne({
            _id: recoveryId,
            name: "Recovery Integration",
            email: recoveryEmail,
            normalizedEmail: recoveryEmail,
            requestedHandle: "recovery-integration",
            status: "email_verified",
            continuationSecretHash: hashPendingRegistrationSecret("pending-continuation", "integration-continuation"),
            verificationTokenHash: null,
            verificationTokenExpiresAt: null,
            verificationVersion: 1,
            verificationLastSentAt: new Date(recoveryNow.getTime() - 60 * 60 * 1000),
            verifiedContinuationHash: hashPendingRegistrationSecret(
                "verified-continuation",
                "expired-integration-continuation",
            ),
            verifiedContinuationExpiresAt: new Date(recoveryNow.getTime() - 60_000),
            verifiedAt: new Date(recoveryNow.getTime() - 31 * 60 * 1000),
            redirectTo: "/onboarding",
            provisioningLeaseHash: null,
            provisioningLeaseExpiresAt: null,
            provisioningClaimHash: null,
            provisioningClaimedAt: null,
            provisioningAttempts: 0,
            reservedDid: null,
            reconciliationRequiredAt: null,
            accountId: null,
            accountDid: null,
            provisionedAt: null,
            createdAt: new Date(recoveryNow.getTime() - 60 * 60 * 1000),
            updatedAt: new Date(recoveryNow.getTime() - 31 * 60 * 1000),
            expiresAt: new Date(recoveryNow.getTime() + 60 * 60 * 1000),
        });
        const recoveryMessages: Array<{ verificationUrl: string }> = [];
        const recoveryDeps = {
            collections,
            baseUrl: "https://staging.kamooni.invalid",
            now: () => recoveryNow,
            sendVerificationEmail: async ({ verificationUrl }: { verificationUrl: string }) => {
                recoveryMessages.push({ verificationUrl });
            },
            permanentAccountExists: async () => false,
        } as any;
        await Promise.all([
            requestPendingRegistrationRecovery({ email: recoveryEmail, clientIp: "192.0.2.120" }, recoveryDeps),
            requestPendingRegistrationRecovery({ email: recoveryEmail, clientIp: "192.0.2.121" }, recoveryDeps),
        ]);
        assert.equal(recoveryMessages.length, 1, "concurrent MongoDB recovery sends one email");
        assert.equal(await collections.registrations.countDocuments({ normalizedEmail: recoveryEmail }), 1);
        const recoveryToken = new URL(recoveryMessages[0].verificationUrl).searchParams.get("token")!;
        const recovered = await verifyPendingRegistrationEmail(recoveryToken, recoveryDeps);
        assert.equal(recovered.success, true);
        assert.equal((await verifyPendingRegistrationEmail(recoveryToken, recoveryDeps)).success, false);
        assert.equal(
            (
                await getVerifiedPendingRegistration(
                    recovered.pendingRegistrationId!,
                    recovered.verifiedContinuationSecret!,
                    recoveryDeps,
                )
            ).success,
            true,
        );
        assert.equal(await collections.didReservations.countDocuments({ _id: recoveryId.toHexString() }), 0);
        await collections.registrations.deleteOne({ _id: recoveryId });
        await collections.rateLimits.deleteMany({});
        await collections.auditEvents.deleteMany({});

        const pendingId = new ObjectId();
        const now = new Date();
        await collections.registrations.insertOne({
            _id: pendingId,
            name: "Integration Test",
            email: "integration@example.invalid",
            normalizedEmail: "integration@example.invalid",
            requestedHandle: "integration-test",
            status: "provisioning",
            continuationSecretHash: "test-only",
            verificationTokenHash: null,
            verificationTokenExpiresAt: null,
            verificationVersion: 1,
            verificationLastSentAt: now,
            verifiedContinuationHash: "test-only",
            verifiedContinuationExpiresAt: new Date(now.getTime() + 60_000),
            verifiedAt: now,
            redirectTo: null,
            provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", "integration-lease"),
            provisioningLeaseExpiresAt: new Date(now.getTime() + 60_000),
            provisioningClaimHash: null,
            provisioningClaimedAt: null,
            provisioningAttempts: 1,
            reservedDid: null,
            reconciliationRequiredAt: null,
            accountId: null,
            accountDid: null,
            provisionedAt: null,
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(now.getTime() + 60_000),
        });

        const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
        const publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" }).toString();
        const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
        assert.equal(
            await acquirePendingRegistrationProvisioningClaim(
                pendingId.toHexString(),
                "integration-lease",
                "integration-claim",
                { collections },
            ),
            true,
        );
        assert.equal(
            await reservePendingRegistrationDid(pendingId.toHexString(), did, "integration-claim", { collections }),
            true,
        );
        assert.equal(
            await reservePendingRegistrationDid(pendingId.toHexString(), did, "integration-claim", { collections }),
            true,
        );
        assert.equal(
            await reservePendingRegistrationDid(pendingId.toHexString(), "f".repeat(64), "integration-claim", {
                collections,
            }),
            false,
        );
        const reserved = await collections.registrations.findOne({ _id: pendingId });
        assert.equal(reserved?.reservedDid, did);
        assert.equal(reserved?.expiresAt, undefined, "reserved identity is not TTL eligible");
        await assert.rejects(
            collections.registrations.insertOne({
                ...reserved!,
                _id: new ObjectId(),
                requestedHandle: "another-handle",
                reservedDid: null,
                reconciliationRequiredAt: null,
            }),
            (error: any) => error?.code === 11000,
            "MongoDB rejects a concurrent duplicate normalized email",
        );
        await assert.rejects(
            collections.registrations.insertOne({
                ...reserved!,
                _id: new ObjectId(),
                email: "another@example.invalid",
                normalizedEmail: "another@example.invalid",
                reservedDid: null,
                reconciliationRequiredAt: null,
            }),
            (error: any) => error?.code === 11000,
            "MongoDB rejects a concurrent duplicate requested handle",
        );

        const credentialDirectory = path.join(usersDirectory, did);
        fs.mkdirSync(credentialDirectory);
        fs.writeFileSync(path.join(credentialDirectory, "publicKey.pem"), publicKeyPem);
        fs.writeFileSync(path.join(credentialDirectory, "salt.bin"), crypto.randomBytes(16));
        fs.writeFileSync(path.join(credentialDirectory, "iv.bin"), crypto.randomBytes(16));
        fs.writeFileSync(path.join(credentialDirectory, "privateKey.pem.enc"), "encrypted-test-material");
        const accountId = new ObjectId();
        await db.collection("circles").insertOne({
            _id: accountId,
            did,
            email: "integration@example.invalid",
            handle: "integration-test",
            publicKey: publicKeyPem,
            metadata: { pendingRegistrationId: pendingId.toHexString() },
        });
        await db
            .collection("members")
            .updateOne(
                { userDid: did, circleId: accountId.toHexString() },
                { $setOnInsert: { userGroups: ["admins", "moderators", "members"], joinedAt: now } },
                { upsert: true },
            );
        await db
            .collection("members")
            .updateOne(
                { userDid: did, circleId: accountId.toHexString() },
                { $setOnInsert: { userGroups: ["admins", "moderators", "members"], joinedAt: now } },
                { upsert: true },
            );
        assert.equal(
            await db.collection("members").countDocuments({ userDid: did, circleId: accountId.toHexString() }),
            1,
        );
        const [inspection] = await inspectPendingRegistrationReconciliation(db, { usersDirectory });
        assert.equal(inspection.classification, "recoverable_finalize");
        assert.equal(inspection.publicKeyMatchesDid, true);
        assert.equal(inspection.selfMembershipExists, true);
        console.log("pending-registration MongoDB/filesystem integration tests passed");
        await db.dropDatabase();
    } finally {
        await client.close();
        fs.rmSync(usersDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
