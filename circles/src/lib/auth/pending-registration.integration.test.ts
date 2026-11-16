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
    startPendingRegistration,
    verifyPendingRegistrationEmail,
    type PendingRegistration,
} from "@/lib/auth/pending-registration";
import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";
import { normalizeEmailForComparison, permanentSignupAccountExists } from "@/lib/auth/email-normalization";
import {
    getOperationsStatus,
    getPendingRegistrationActivationReadiness,
} from "@/lib/auth/pending-registration-monitoring";

async function checkActivationReadiness(db: ReturnType<MongoClient["db"]>, collections: any) {
    const now = new Date();
    assert.equal((await getPendingRegistrationActivationReadiness(db, now)).ready, true);
    await startPendingRegistration(
        {
            name: "Readiness Test",
            email: "readiness@example.invalid",
            requestedHandle: "readiness-test",
            clientIp: "192.0.2.1",
        },
        {
            collections,
            baseUrl: "https://kamooni.invalid",
            permanentAccountExists: async () => false,
            findAccountByPendingRegistrationId: async () => null,
            sendVerificationEmail: async () => {},
            provisionAccount: async () => {
                throw new Error("Readiness must not provision accounts");
            },
            validateProvisionedAccount: async () => false,
            finalizeAccount: async () => {
                throw new Error("Readiness must not finalize accounts");
            },
            issueSession: async () => {
                throw new Error("Readiness must not issue sessions");
            },
            now: () => now,
        },
    );
    const registrations = db.collection("pendingRegistrations");
    const original = (await registrations.findOne({ requestedHandle: "readiness-test" }))!;
    const id = original._id;
    const expected = {
        ready: true,
        pendingRegistrations: 1,
        untouchedPendingEmail: 1,
        expiredPendingEmail: 0,
        reconciliationRequired: 0,
        provisioningLocks: 0,
        finalizationLocks: 0,
    };
    const snapshot = async () =>
        JSON.stringify(
            await Promise.all(
                [
                    "pendingRegistrations",
                    "pendingRegistrationDidReservations",
                    "circles",
                    "pendingRegistrationProvisioningLocks",
                    "pendingRegistrationFinalizationLocks",
                ].map((name) => db.collection(name).find().sort({ _id: 1 }).toArray()),
            ),
        );
    const inspect = async () => {
        const before = await snapshot();
        const result = await getPendingRegistrationActivationReadiness(db, now);
        assert.equal(await snapshot(), before, "classification must not change records or identities");
        return result;
    };
    assert.deepEqual(await inspect(), expected);
    assert.equal(
        (await getOperationsStatus(db)).reconciliationRequired,
        0,
        "legitimate null-initialized pending is not reconciliation",
    );

    const indexes = await registrations.listIndexes().toArray();
    assert.ok(indexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
    // The disposable runner disables MongoDB's asynchronous TTL monitor. An expired document is still present.
    const expired = { ...original, expiresAt: new Date(now.getTime() - 60_000) };
    await registrations.replaceOne({ _id: id }, expired);
    assert.deepEqual(await inspect(), { ...expected, expiredPendingEmail: 1 });
    assert.equal((await getOperationsStatus(db)).pendingRegistrations, 1, "expiry is not deletion");
    assert.equal(await registrations.countDocuments({ _id: id }), 1);

    for (const patch of [
        { status: "email_verified" },
        { status: "provisioning" },
        { status: "provisioning_claimed" },
        { status: "unknown" },
        { reservedDid: "a".repeat(64) },
        { accountId: new ObjectId().toHexString() },
        { accountDid: "a".repeat(64) },
        { provisionedAt: now },
        { provisioningAttempts: 1 },
        { provisioningClaimHash: "claim" },
        { provisioningClaimedAt: now },
        { provisioningLeaseHash: "lease" },
        { provisioningLeaseExpiresAt: new Date(now.getTime() - 1) },
        { verifiedAt: now },
        { verifiedContinuationHash: "verified" },
        { verifiedContinuationExpiresAt: now },
        { reconciliationRequiredAt: now },
        { expiresAt: null },
        { email: "invalid" },
        { normalizedEmail: "different@example.invalid" },
        { requestedHandle: "__email_only__" },
    ]) {
        await registrations.replaceOne({ _id: id }, { ...expired, ...patch });
        assert.equal((await inspect()).ready, false, `retained partial state rejected: ${Object.keys(patch)}`);
    }
    for (const provisionedAt of [null, undefined, now]) {
        await registrations.replaceOne({ _id: id }, { ...original, reconciliationRequiredAt: now, provisionedAt });
        if (provisionedAt === undefined) await registrations.updateOne({ _id: id }, { $unset: { provisionedAt: "" } });
        assert.equal((await getOperationsStatus(db)).reconciliationRequired, 1);
        assert.equal((await inspect()).ready, false);
    }
    await registrations.replaceOne({ _id: id }, original);
    for (const field of [
        "provisioningClaimHash",
        "provisionedAt",
        "expiresAt",
        "status",
        "email",
        "normalizedEmail",
        "requestedHandle",
    ]) {
        await registrations.replaceOne({ _id: id }, original);
        await registrations.updateOne({ _id: id }, { $unset: { [field]: "" } });
        assert.equal((await inspect()).ready, false, "missing evidence is uncertain, not empty");
    }
    await registrations.replaceOne({ _id: id }, original);

    const reservations = db.collection<{ _id: string; did: string }>("pendingRegistrationDidReservations");
    await reservations.insertOne({ _id: id.toHexString(), did: "a".repeat(64) });
    assert.equal((await inspect()).ready, false, "registry-only reservation blocks activation");
    await reservations.deleteOne({ _id: id.toHexString() });
    const account = await db.collection("circles").insertOne({ metadata: { pendingRegistrationId: id.toHexString() } });
    assert.equal((await inspect()).ready, false, "correlated account blocks activation despite null record fields");
    await db.collection("circles").deleteOne({ _id: account.insertedId });
    for (const { email, legacy, conflict } of [
        { email: original.email, legacy: { email: original.email, handle: "other-handle" }, conflict: true },
        {
            email: original.email,
            legacy: { email: "READINESS@EXAMPLE.INVALID", handle: "other-handle" },
            conflict: true,
        },
        {
            email: "new.member+pilot@googlemail.com",
            legacy: { email: "New.Member+legacy@GMAIL.COM", handle: "other-handle" },
            conflict: true,
        },
        {
            email: "newmember@gmail.com",
            legacy: { email: "N.E.W.Member+legacy@GOOGLEMAIL.COM", handle: "other-handle" },
            conflict: true,
        },
        {
            email: original.email,
            legacy: { email: "unrelated@example.invalid", handle: original.requestedHandle },
            conflict: true,
        },
        {
            email: original.email,
            legacy: { email: "readiness+alias@example.invalid", handle: "other-handle" },
            conflict: false,
        },
        {
            email: "newmember@gmail.com",
            legacy: { email: "another.member@gmail.com", handle: "other-handle" },
            conflict: false,
        },
    ]) {
        const normalizedEmail = normalizeEmailForComparison(email);
        await registrations.replaceOne({ _id: id }, { ...original, email, normalizedEmail });
        const legacyAccount = await db.collection("circles").insertOne({ ...legacy, did: "c".repeat(64) });
        assert.equal(
            await permanentSignupAccountExists(db.collection("circles"), normalizedEmail, original.requestedHandle),
            conflict,
        );
        assert.equal(
            (await inspect()).ready,
            !conflict,
            "legacy collision semantics must match provisioning without pending-ID metadata",
        );
        await db.collection("circles").deleteOne({ _id: legacyAccount.insertedId });
    }
    await registrations.replaceOne({ _id: id }, original);
    for (const name of ["pendingRegistrationProvisioningLocks", "pendingRegistrationFinalizationLocks"]) {
        for (const expiresAt of [new Date(now.getTime() + 60_000), new Date(now.getTime() - 60_000), null]) {
            const lock = await db.collection(name).insertOne({ expiresAt });
            assert.equal((await inspect()).ready, false, "active, expired and malformed retained locks require review");
            await db.collection(name).deleteOne({ _id: lock.insertedId });
        }
    }
    assert.deepEqual(await inspect(), expected);
    const overflow = Array.from({ length: 100 }, (_, index) => ({
        ...original,
        _id: new ObjectId(),
        normalizedEmail: `readiness-${index}@example.invalid`,
        email: `readiness-${index}@example.invalid`,
        requestedHandle: `readiness-${index}`,
        verificationTokenHash: `readiness-token-${index}`,
    }));
    await registrations.insertMany(overflow);
    assert.equal((await inspect()).ready, false, "scan overflow must fail closed");
    await registrations.deleteMany({ _id: { $in: overflow.map((record) => record._id) } });
    await registrations.updateOne({ _id: id }, { $set: { status: "provisioned", provisionedAt: now } });
    await reservations.insertOne({ _id: id.toHexString(), did: "a".repeat(64) });
    assert.equal((await inspect()).ready, true, "completed registrations and durable reservations are preserved");
    assert.equal((await getOperationsStatus(db)).pendingRegistrations, 0);
    await registrations.updateOne({ _id: id }, { $set: { reconciliationRequiredAt: now } });
    assert.equal(
        (await getOperationsStatus(db)).reconciliationRequired,
        1,
        "a stale completed marker remains evidence",
    );
    assert.equal((await inspect()).ready, false);
    await reservations.deleteOne({ _id: id.toHexString() });
    await registrations.deleteOne({ _id: id });
    await collections.rateLimits.deleteMany({});
    await collections.auditEvents.deleteMany({});
    console.log("pending-registration read-only activation readiness and retained-expiry tests passed");
}

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
        await checkActivationReadiness(db, collections);

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
