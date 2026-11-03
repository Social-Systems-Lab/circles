import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
import { MongoClient, ObjectId } from "mongodb";
import {
    ensurePendingRegistrationIndexes,
    reservePendingRegistrationDid,
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
            rateLimits: db.collection("pendingRegistrationRateLimits"),
            auditEvents: db.collection("pendingRegistrationAuditEvents"),
        } as any;
        await ensurePendingRegistrationIndexes(collections);

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
            provisioningLeaseHash: "test-only",
            provisioningLeaseExpiresAt: new Date(now.getTime() + 60_000),
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
        assert.equal(await reservePendingRegistrationDid(pendingId.toHexString(), did, { collections }), true);
        assert.equal(await reservePendingRegistrationDid(pendingId.toHexString(), did, { collections }), true);
        assert.equal(
            await reservePendingRegistrationDid(pendingId.toHexString(), "f".repeat(64), { collections }),
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
