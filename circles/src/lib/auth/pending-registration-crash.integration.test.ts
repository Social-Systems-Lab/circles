import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import {
    acquirePendingRegistrationProvisioningClaim,
    acquirePendingRegistrationOwnedLock,
    backfillPendingRegistrationDidReservations,
    ensurePendingRegistrationIndexes,
    hashPendingRegistrationSecret,
    isPendingRegistrationProvisioningClaimOwner,
    isPendingRegistrationProvisioningLeaseOwner,
    PENDING_PROVISIONING_LEASE_MS,
    provisionPendingRegistration,
    reservePendingRegistrationDid,
    renewPendingRegistrationOwnedLock,
    renewPendingRegistrationProvisioningLease,
    releasePendingRegistrationOwnedLock,
    resendPendingRegistrationVerification,
    type PendingRegistration,
    type PendingRegistrationCollections,
    type PendingRegistrationDependencies,
    type PendingRegistrationDidReservation,
    verifyPendingRegistrationEmail,
} from "@/lib/auth/pending-registration";
import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";
import { ensureProvisionedPersonalMembership } from "@/lib/data/member";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { finalizeClaimedRegistrationForAuthenticatedLogin } from "@/lib/auth/pending-registration-runtime";
import { closeDbForTests } from "@/lib/data/db";

process.env.PENDING_REGISTRATION_TOKEN_HMAC_KEY = "crash-contract-integration-test-only";

type FaultPoint =
    | "none"
    | "before_claim"
    | "after_claim_before_did_reservation"
    | "after_did_reservation"
    | "during_credential_writes"
    | "after_credentials"
    | "after_account_insert"
    | "during_membership"
    | "after_membership_row"
    | "during_member_chat"
    | "after_membership_side_effects"
    | "during_profile_finalization"
    | "after_profile_finalization"
    | "during_welcome_finalization"
    | "after_welcome_finalization"
    | "before_provisioned_update"
    | "after_provisioned_update"
    | "during_session_issuance"
    | "after_session_issuance";

const databaseName = process.env.PENDING_REGISTRATION_TEST_DATABASE;
const uri = process.env.PENDING_REGISTRATION_TEST_MONGODB_URI;
if (!databaseName || !uri) throw new Error("Disposable crash-test MongoDB configuration is required");
const parsedUri = new URL(uri);
if (
    !/^circles_stage1a_test_pending_[a-z0-9_-]+$/i.test(databaseName) ||
    parsedUri.protocol !== "mongodb:" ||
    parsedUri.hostname !== "127.0.0.1" ||
    parsedUri.port !== "27019" ||
    parsedUri.username ||
    parsedUri.password ||
    parsedUri.search ||
    decodeURIComponent(parsedUri.pathname.replace(/^\//, "")) !== databaseName
) {
    throw new Error("Refusing crash tests: MongoDB endpoint or effective database failed disposable-target checks");
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
const projectDirectory = path.resolve(process.cwd());
const realProjectDirectory = fs.realpathSync(projectDirectory);
const tempRoot = fs.realpathSync(path.resolve(os.tmpdir()));
if (tempRoot === realProjectDirectory || tempRoot.startsWith(`${realProjectDirectory}${path.sep}`)) {
    throw new Error("System temporary directory must be outside the project before creating test credentials");
}
const usersDirectory = fs.mkdtempSync(path.join(tempRoot, "pending-registration-crash-"));
const realUsersDirectory = fs.realpathSync(usersDirectory);
if (realUsersDirectory.startsWith(`${realProjectDirectory}${path.sep}`)) {
    throw new Error("Crash-test credential directory must be outside the project");
}
let db: ReturnType<MongoClient["db"]>;
let collections: PendingRegistrationCollections;
const cases: Array<{ name: string; run: () => Promise<void> }> = [];
const satisfiedMilestone2Contracts: string[] = [];
const milestone2Contracts = [
    "session issuance must follow durable status=provisioned",
    "an existing member row must not suppress repair of incomplete side effects",
];
function describe(_name: string, register: () => void) {
    register();
}
function it(name: string, run: () => Promise<void>) {
    cases.push({ name, run });
}
function assertContractForMilestone2(name: string, assertion: () => void) {
    assertion();
    satisfiedMilestone2Contracts.push(name);
    console.log(`CONTRACT SATISFIED: ${name}`);
}

async function makeCase(
    fault: FaultPoint = "none",
    overrides: { loseFinalUpdate?: boolean; pauseBeforeClaim?: boolean } = {},
) {
    let now = new Date();
    const id = new ObjectId();
    const continuation = crypto.randomBytes(32).toString("base64url");
    const pendingContinuation = crypto.randomBytes(32).toString("base64url");
    let activeFault = fault;
    const capturedEmails: string[] = [];
    const registration: PendingRegistration = {
        _id: id,
        name: "Disposable Test Member",
        email: `${id.toHexString()}@example.invalid`,
        normalizedEmail: `${id.toHexString()}@example.invalid`,
        requestedHandle: `test-${id.toHexString().slice(-12)}`,
        status: "email_verified",
        continuationSecretHash: hashPendingRegistrationSecret("pending-continuation", pendingContinuation),
        verificationTokenHash: `unused-${id.toHexString()}`,
        verificationTokenExpiresAt: null,
        verificationVersion: 1,
        verificationLastSentAt: now,
        verifiedContinuationHash: hashPendingRegistrationSecret("verified-continuation", continuation),
        verifiedContinuationExpiresAt: new Date(now.getTime() + 60_000),
        verifiedAt: now,
        redirectTo: "/explore",
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
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    };
    await collections.registrations.insertOne(registration);
    const accountId = new ObjectId();
    const events: string[] = [];
    let generatedDid: string | null = null;
    let sessionCount = 0;
    let accountInsertCount = 0;
    let generatedDidCount = 0;
    let membershipInsertCount = 0;
    let welcomeInsertCount = 0;
    let loseUpdate = overrides.loseFinalUpdate ?? false;
    let updateWasLost = false;
    let pauseBeforeClaim = overrides.pauseBeforeClaim ?? false;
    let signalClaimPaused!: () => void;
    let releaseClaimPause!: () => void;
    const claimPaused = new Promise<void>((resolve) => (signalClaimPaused = resolve));
    const claimPauseGate = new Promise<void>((resolve) => (releaseClaimPause = resolve));
    const deps: PendingRegistrationDependencies = {
        collections: {
            ...collections,
            registrations: {
                findOne: (filter: any, options?: any) => collections.registrations.findOne(filter, options),
                findOneAndUpdate: (filter: any, update: any, options?: any) =>
                    collections.registrations.findOneAndUpdate(filter, update, options),
                createIndex: (index: any, options?: any) => collections.registrations.createIndex(index, options),
                updateOne: async (filter: any, update: any, options?: any) => {
                    if (pauseBeforeClaim && update.$set?.status === "provisioning_claimed") {
                        pauseBeforeClaim = false;
                        signalClaimPaused();
                        await claimPauseGate;
                    }
                    if (activeFault === "before_provisioned_update" && update.$set?.status === "provisioned") {
                        throw new Error("injected before durable provisioned transition");
                    }
                    if (loseUpdate && update.$set?.status === "provisioned") {
                        loseUpdate = false;
                        updateWasLost = true;
                        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 } as any;
                    }
                    const result = await collections.registrations.updateOne(filter, update, options);
                    if (update.$set?.status === "provisioned" && result.matchedCount === 1) {
                        events.push("provisioned");
                        if (activeFault === "after_provisioned_update") {
                            throw new Error("injected after durable provisioned transition");
                        }
                    }
                    return result;
                },
            } as any,
            auditEvents: {
                insertOne: async (event: any, options?: any) => {
                    if (
                        activeFault === "after_provisioned_update" &&
                        event.eventType === "pending_registration.provisioned"
                    ) {
                        throw new Error("injected after state transition, before completion response");
                    }
                    return collections.auditEvents.insertOne(event, options);
                },
                createIndex: (index: any, options?: any) => collections.auditEvents.createIndex(index, options),
            } as any,
        },
        baseUrl: "http://unused.invalid",
        now: () => now,
        sendVerificationEmail: async ({ verificationUrl }) => {
            capturedEmails.push(verificationUrl);
        },
        permanentAccountExists: async () => false,
        findAccountByPendingRegistrationId: async () => null,
        provisionAccount: async ({ pendingRegistrationId, provisioningLeaseToken, provisioningClaimToken }) => {
            events.push("provision-start");
            if (activeFault === "before_claim") throw new Error("injected before durable claim");
            assert.equal(
                await acquirePendingRegistrationProvisioningClaim(
                    pendingRegistrationId,
                    provisioningLeaseToken,
                    provisioningClaimToken,
                    deps,
                ),
                true,
                "worker acquires durable claim before generating identity or touching credential storage",
            );
            events.push("claim-acquired");
            if (activeFault === "after_claim_before_did_reservation") {
                throw new Error("injected after durable claim and before DID reservation");
            }
            const keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
            const publicKeyPem = keyPair.publicKey.export({ type: "pkcs1", format: "pem" }).toString();
            const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
            generatedDid = did;
            generatedDidCount += 1;
            events.push("did-generated");
            assert.equal(
                await reservePendingRegistrationDid(pendingRegistrationId, did, provisioningClaimToken, deps),
                true,
                "test worker reserves the generated identity",
            );
            events.push("did-reserved");
            assert.equal(
                await isPendingRegistrationProvisioningClaimOwner(pendingRegistrationId, provisioningClaimToken, deps),
                true,
            );
            if (activeFault === "after_did_reservation") throw new Error("injected after DID reservation");
            const credentialDirectory = path.join(usersDirectory, did);
            fs.mkdirSync(credentialDirectory);
            fs.writeFileSync(path.join(credentialDirectory, "publicKey.pem"), publicKeyPem);
            if (activeFault === "during_credential_writes") throw new Error("injected during credential writes");
            fs.writeFileSync(path.join(credentialDirectory, "salt.bin"), crypto.randomBytes(16));
            fs.writeFileSync(path.join(credentialDirectory, "iv.bin"), crypto.randomBytes(16));
            fs.writeFileSync(path.join(credentialDirectory, "privateKey.pem.enc"), crypto.randomBytes(64));
            events.push("credentials-complete");
            if (activeFault === "after_credentials") throw new Error("injected after credentials");
            assert.equal(
                await isPendingRegistrationProvisioningClaimOwner(pendingRegistrationId, provisioningClaimToken, deps),
                true,
                "permanent-account insertion requires the durable claim",
            );
            await db.collection("circles").insertOne({
                _id: accountId,
                did,
                circleType: "user",
                email: registration.email,
                handle: registration.requestedHandle,
                publicKey: publicKeyPem,
                metadata: { pendingRegistrationId },
            });
            accountInsertCount += 1;
            events.push("account-inserted");
            if (activeFault === "after_account_insert") throw new Error("injected after account insert");
            return { accountId: accountId.toHexString(), did };
        },
        validateProvisionedAccount: async (pendingRegistrationId, account) => {
            const pending = await collections.registrations.findOne({ _id: new ObjectId(pendingRegistrationId) });
            const correlated = await db.collection("circles").findOne({
                _id: accountId,
                did: account.did,
                "metadata.pendingRegistrationId": pendingRegistrationId,
            });
            const reservation = await collections.didReservations.findOne({ _id: pendingRegistrationId });
            return Boolean(
                pending?.status === "provisioning_claimed" &&
                    pending.reservedDid === account.did &&
                    reservation?.did === account.did &&
                    correlated?.email === registration.email &&
                    correlated?.handle === registration.requestedHandle &&
                    correlated?.publicKey &&
                    crypto.createHash("sha256").update(correlated.publicKey).digest("hex") === account.did,
            );
        },
        finalizeAccount: async (_account, { pendingRegistrationId }) => {
            if (activeFault === "during_membership") throw new Error("injected before membership row insertion");
            await db
                .collection("members")
                .updateOne(
                    { userDid: generatedDid, circleId: accountId.toHexString() },
                    { $setOnInsert: { joinedAt: now, userGroups: ["admins", "moderators", "members"] } },
                    { upsert: true },
                );
            membershipInsertCount += 1;
            events.push("membership-row-inserted");
            if (activeFault === "after_membership_row") throw new Error("injected after membership row insertion");
            if (activeFault === "during_member_chat") throw new Error("injected during member chat side effect");
            await db
                .collection("pendingTestChatMembers")
                .updateOne({ _id: accountId }, { $setOnInsert: { userDid: generatedDid } }, { upsert: true });
            await db.collection("circles").updateOne({ _id: accountId }, { $set: { members: 1 } });
            events.push("membership-side-effects-complete");
            if (activeFault === "after_membership_side_effects")
                throw new Error("injected after membership side effects");
            if (activeFault === "during_profile_finalization") throw new Error("injected during profile finalization");
            await db
                .collection("pendingTestProfiles")
                .updateOne(
                    { _id: accountId },
                    { $setOnInsert: { createdAt: now, onboardingComplete: false } },
                    { upsert: true },
                );
            await db.collection("circles").updateOne(
                { _id: accountId, did: generatedDid, "metadata.pendingRegistrationId": pendingRegistrationId },
                {
                    $set: {
                        isHuman: true,
                        "metadata.onboardingFlow": "pending-registration-v1",
                        "metadata.pendingRegistrationFinalizationVersion": 1,
                    },
                },
            );
            events.push("profile-finalized");
            if (activeFault === "after_profile_finalization") throw new Error("injected after profile finalization");
            if (activeFault === "during_welcome_finalization") throw new Error("injected during welcome finalization");
            await db
                .collection("pendingTestWelcomeMessages")
                .updateOne(
                    { _id: accountId },
                    { $setOnInsert: { createdAt: now, body: "Synthetic welcome" } },
                    { upsert: true },
                );
            welcomeInsertCount += 1;
            events.push("welcome-finalized");
            if (activeFault === "after_welcome_finalization") throw new Error("injected after welcome finalization");
        },
        issueSession: async (pendingRegistrationId, account) => {
            const state = await collections.registrations.findOne({
                _id: new ObjectId(pendingRegistrationId),
                status: "provisioned",
                accountId: account.accountId,
                accountDid: account.did,
            });
            assert.ok(state, "session issuance is forbidden before durable finalization");
            if (activeFault === "during_session_issuance") throw new Error("injected during session issuance");
            sessionCount += 1;
            events.push("session-issued");
            if (activeFault === "after_session_issuance") throw new Error("injected after session issuance");
        },
    };
    return {
        id,
        continuation,
        pendingContinuation,
        capturedEmails,
        registration,
        deps,
        events,
        accountId,
        get generatedDid() {
            return generatedDid;
        },
        get sessionCount() {
            return sessionCount;
        },
        get accountInsertCount() {
            return accountInsertCount;
        },
        get generatedDidCount() {
            return generatedDidCount;
        },
        get membershipInsertCount() {
            return membershipInsertCount;
        },
        get welcomeInsertCount() {
            return welcomeInsertCount;
        },
        get updateWasLost() {
            return updateWasLost;
        },
        setFault(nextFault: FaultPoint) {
            activeFault = nextFault;
        },
        advance(ms: number) {
            now = new Date(now.getTime() + ms);
        },
        loseUpdate() {
            loseUpdate = true;
        },
        waitForClaimPause() {
            return claimPaused;
        },
        resumeClaimPause() {
            releaseClaimPause();
        },
    };
}

async function complete(testCase: Awaited<ReturnType<typeof makeCase>>, continuation = testCase.continuation) {
    return provisionPendingRegistration(
        {
            pendingRegistrationId: testCase.id.toHexString(),
            verifiedContinuationSecret: continuation,
            password: "synthetic-test-password",
        },
        testCase.deps,
    );
}

async function prepareClaim(testCase: Awaited<ReturnType<typeof makeCase>>, leaseToken: string, claimToken: string) {
    await collections.registrations.updateOne(
        { _id: testCase.id },
        {
            $set: {
                status: "provisioning",
                provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", leaseToken),
                provisioningLeaseExpiresAt: new Date(Date.now() + 60_000),
                provisioningClaimHash: null,
                reservedDid: null,
            },
        },
    );
    return acquirePendingRegistrationProvisioningClaim(
        testCase.id.toHexString(),
        leaseToken,
        claimToken,
        testCase.deps,
    );
}

describe("pending-registration crash-boundary contracts (disposable MongoDB + synthetic credentials)", () => {
    it("rejects interruption before continuation claim without changing registration or issuing a session", async () => {
        const c = await makeCase();
        const result = await provisionPendingRegistration(
            {
                pendingRegistrationId: c.id.toHexString(),
                verifiedContinuationSecret: "wrong",
                password: "synthetic-test-password",
            },
            c.deps,
        );
        const stored = await collections.registrations.findOne({ _id: c.id });
        assert.equal(result.success, false);
        assert.equal(stored?.status, "email_verified");
        assert.equal(stored?.verifiedContinuationHash, c.registration.verifiedContinuationHash);
        assert.equal(c.sessionCount, 0);
    });

    it("retains a durable claim after interruption before DID reservation", async () => {
        const c = await makeCase("after_claim_before_did_reservation");
        const result = await complete(c);
        const stored = await collections.registrations.findOne({ _id: c.id });
        assert.equal(result.success, false);
        assert.equal(stored?.status, "provisioning_claimed");
        assert.equal(stored?.reservedDid, null);
        assert.equal(stored?.expiresAt, undefined, "TTL cannot remove an unresolved claim");
        assert.equal(stored?.verifiedContinuationHash, undefined);
        assert.equal(c.sessionCount, 0);
        assert.equal((await complete(c)).success, false, "consumed continuation is not reusable");
    });

    it("retries an interruption before claim only after lease expiry and fresh email verification", async () => {
        const c = await makeCase("before_claim");
        assert.equal((await complete(c)).success, false);
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, null);
        assert.equal((await complete(c)).success, false, "the consumed continuation cannot retry directly");

        c.advance(PENDING_PROVISIONING_LEASE_MS + 60_000);
        const resend = await resendPendingRegistrationVerification(
            {
                pendingRegistrationId: c.id.toHexString(),
                continuationSecret: c.pendingContinuation,
                clientIp: "127.0.0.1",
            },
            c.deps,
        );
        assert.equal(resend.success, true);
        assert.equal(c.capturedEmails.length, 1, "email is captured in memory; no external transport is used");
        const token = new URL(c.capturedEmails[0]).searchParams.get("token");
        assert.ok(token);
        const verified = await verifyPendingRegistrationEmail(token, c.deps);
        assert.equal(verified.success, true);
        const verifiedContinuationSecret = verified.verifiedContinuationSecret;
        if (!verifiedContinuationSecret)
            throw new Error("Fresh verification did not return continuation authorization");
        assert.equal(c.sessionCount, 0, "fresh verification does not itself create an authenticated session");

        c.setFault("none");
        const retry = await provisionPendingRegistration(
            {
                pendingRegistrationId: c.id.toHexString(),
                verifiedContinuationSecret,
                password: "synthetic-test-password",
            },
            c.deps,
        );
        assert.equal(retry.success, true);
        assert.ok(c.generatedDid, "one DID is generated on the renewed, newly authorized attempt");
        assert.equal(c.generatedDidCount, 1);
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, c.generatedDid);
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            1,
        );
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.status, "provisioned");
    });

    it("fences a paused pre-claim worker after fresh verification lets a replacement claim", async () => {
        const c = await makeCase("none", { pauseBeforeClaim: true });
        const workerA = complete(c);
        await c.waitForClaimPause();

        c.advance(PENDING_PROVISIONING_LEASE_MS + 60_000);
        const resend = await resendPendingRegistrationVerification(
            {
                pendingRegistrationId: c.id.toHexString(),
                continuationSecret: c.pendingContinuation,
                clientIp: "127.0.0.1",
            },
            c.deps,
        );
        assert.equal(resend.success, true);
        const token = new URL(c.capturedEmails.at(-1)!).searchParams.get("token");
        assert.ok(token);
        const verification = await verifyPendingRegistrationEmail(token, c.deps);
        assert.equal(verification.success, true);
        assert.ok(verification.verifiedContinuationSecret);

        const workerB = await complete(c, verification.verifiedContinuationSecret);
        assert.equal(workerB.success, true);
        const winnerDid = c.generatedDid;
        assert.ok(winnerDid);

        c.resumeClaimPause();
        const staleWorkerResult = await workerA;
        assert.equal(staleWorkerResult.success, false);
        assert.equal(c.generatedDidCount, 1, "worker A does not generate an identity after losing its lease");
        assert.equal(c.events.filter((event) => event === "did-generated").length, 1);
        assert.equal(c.accountInsertCount, 1, "only the durable-claim owner inserts a permanent account");
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            1,
        );
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, winnerDid);
    });

    it("keeps an acquired claim exclusive after lease expiry and process restart", async () => {
        const c = await makeCase();
        const lease = "durable-claim-initial-lease";
        const claim = "durable-claim-owner";
        assert.equal(await prepareClaim(c, lease, claim), true);
        c.advance(PENDING_PROVISIONING_LEASE_MS + 60_000);
        await collections.registrations.deleteMany({ expiresAt: { $lte: new Date(Date.now() + 1_000_000) } });
        assert.ok(
            await collections.registrations.findOne({ _id: c.id }),
            "claim acquisition removes the TTL date so cleanup cannot delete it",
        );
        const restartedClient = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
        try {
            await restartedClient.connect();
            const restartedCollections = {
                ...c.deps.collections,
                registrations: restartedClient.db(databaseName).collection<PendingRegistration>("pendingRegistrations"),
            } as PendingRegistrationCollections;
            assert.equal(
                await isPendingRegistrationProvisioningClaimOwner(c.id.toHexString(), claim, {
                    collections: restartedCollections,
                }),
                true,
            );
            const replacementLease = "replacement-after-claim";
            assert.equal(
                await renewPendingRegistrationProvisioningLease(c.id.toHexString(), lease, c.deps),
                false,
                "the temporary lease cannot be revived after claim transition",
            );
            assert.equal(
                await acquirePendingRegistrationProvisioningClaim(
                    c.id.toHexString(),
                    replacementLease,
                    "replacement-claim",
                    { collections: restartedCollections },
                ),
                false,
                "ordinary application requests cannot transfer a durable claim",
            );
            assert.equal(
                (await restartedCollections.registrations.findOne({ _id: c.id }))?.status,
                "provisioning_claimed",
            );
        } finally {
            await restartedClient.close();
        }
    });

    it("preserves the reservation and partial files after interruption during credential writes", async () => {
        const c = await makeCase("during_credential_writes");
        assert.equal((await complete(c)).success, false);
        const stored = await collections.registrations.findOne({ _id: c.id });
        assert.equal(stored?.reservedDid, c.generatedDid);
        const files = fs.readdirSync(path.join(usersDirectory, c.generatedDid!));
        assert.deepEqual(files, ["publicKey.pem"]);
        assert.equal(c.sessionCount, 0);
    });

    it("preserves a reserved DID after failure before credential creation and never silently replaces it", async () => {
        const c = await makeCase("after_did_reservation");
        assert.equal((await complete(c)).success, false);
        const firstDid = c.generatedDid;
        assert.ok(firstDid);
        const stored = await collections.registrations.findOne({ _id: c.id });
        assert.equal(stored?.reservedDid, firstDid);
        assert.equal(
            await reservePendingRegistrationDid(c.id.toHexString(), "f".repeat(64), "stale-worker", c.deps),
            false,
        );
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, firstDid);
    });

    it("characterizes failure after complete credentials but before account insertion", async () => {
        const c = await makeCase("after_credentials");
        assert.equal((await complete(c)).success, false);
        const record = await collections.registrations.findOne({ _id: c.id });
        assert.equal(record?.reservedDid, c.generatedDid);
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            0,
        );
        assert.deepEqual(fs.readdirSync(path.join(usersDirectory, c.generatedDid!)).sort(), [
            "iv.bin",
            "privateKey.pem.enc",
            "publicKey.pem",
            "salt.bin",
        ]);
        assert.equal(c.sessionCount, 0);
    });

    it("characterizes interruption immediately after permanent account insertion", async () => {
        const c = await makeCase("after_account_insert");
        assert.equal((await complete(c)).success, false);
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            1,
        );
        assert.equal(await db.collection("members").countDocuments({ circleId: c.accountId.toHexString() }), 0);
        assert.equal(c.sessionCount, 0);
        assert.equal((await complete(c)).success, false, "the consumed capability cannot finalize an inserted account");
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            1,
        );
        assert.equal(
            (await collections.registrations.findOne({ _id: c.id }))?.status,
            "provisioning_claimed",
            "an inserted account interrupted before finalization remains held by its durable claim",
        );
    });

    it("repairs a correlated claimed account after authenticated login without issuing a session", async () => {
        const c = await makeCase("after_account_insert");
        assert.equal((await complete(c)).success, false);
        const account = await db
            .collection("circles")
            .findOne({ "metadata.pendingRegistrationId": c.id.toHexString() });
        assert.ok(account?._id);
        const user = {
            _id: account!._id.toString(),
            did: c.generatedDid!,
            metadata: { pendingRegistrationId: c.id.toHexString() },
        };

        const refreshedUser = await db.collection("circles").findOne({ _id: account!._id });
        const authenticatedUser = { ...user, metadata: refreshedUser?.metadata };
        assert.equal(await finalizeClaimedRegistrationForAuthenticatedLogin(authenticatedUser), true);
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.status, "provisioned");
        assert.equal(await db.collection("members").countDocuments({ circleId: user._id }), 1);
        assert.equal(await db.collection("chatConversations").countDocuments({ participants: user.did }), 1);
        assert.equal(c.sessionCount, 0, "internal repair does not issue a session");

        const nextLoginUser = await db.collection("circles").findOne({ _id: account!._id });
        assert.equal(
            await finalizeClaimedRegistrationForAuthenticatedLogin({
                ...user,
                metadata: nextLoginUser?.metadata,
            }),
            true,
        );
        assert.equal(await db.collection("members").countDocuments({ circleId: user._id }), 1);
        assert.equal(await db.collection("chatConversations").countDocuments({ participants: user.did }), 1);
        assert.equal(c.sessionCount, 0, "repeat repair still does not issue a session");
    });

    it("refuses authenticated repair when exact account correlation is inconsistent", async () => {
        const c = await makeCase("after_account_insert");
        assert.equal((await complete(c)).success, false);
        const account = await db
            .collection("circles")
            .findOne({ "metadata.pendingRegistrationId": c.id.toHexString() });
        assert.ok(account?._id);
        await db
            .collection("circles")
            .updateOne({ _id: account!._id }, { $set: { email: "mismatch@example.invalid" } });

        assert.equal(
            await finalizeClaimedRegistrationForAuthenticatedLogin({
                _id: account!._id.toString(),
                did: c.generatedDid!,
                metadata: { pendingRegistrationId: c.id.toHexString() },
            }),
            false,
        );
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.status, "provisioning_claimed");
        assert.equal(await db.collection("members").countDocuments({ circleId: account!._id.toString() }), 0);
        assert.equal(c.sessionCount, 0);
    });

    it("preserves a membership row when later finalization effects fail", async () => {
        const c = await makeCase("after_membership_row");
        assert.equal((await complete(c)).success, false);
        assert.equal(c.membershipInsertCount, 1);
        assert.equal(await db.collection("members").countDocuments({ circleId: c.accountId.toHexString() }), 1);
        assert.equal(c.sessionCount, 0);
    });

    it("repairs an existing membership row, chat membership and count idempotently", async () => {
        const did = crypto.createHash("sha256").update(`membership-repair:${new ObjectId()}`).digest("hex");
        const circleId = new ObjectId();
        const chatRoomId = new ObjectId();
        await db.collection("circles").insertOne({ _id: circleId, did, circleType: "user", members: 0 });
        await db
            .collection("chatRooms")
            .insertOne({ _id: chatRoomId, circleId: circleId.toHexString(), handle: "members" });
        await db.collection("members").insertOne({
            userDid: did,
            circleId: circleId.toHexString(),
            joinedAt: new Date(),
            userGroups: ["admins", "moderators", "members"],
        });

        await Promise.all([
            ensureProvisionedPersonalMembership(did, circleId.toHexString()),
            ensureProvisionedPersonalMembership(did, circleId.toHexString()),
        ]);
        await ensureProvisionedPersonalMembership(did, circleId.toHexString());

        assert.equal(
            await db.collection("members").countDocuments({ userDid: did, circleId: circleId.toHexString() }),
            1,
        );
        const chatMembershipCount = await db
            .collection("chatRoomMembers")
            .countDocuments({ userDid: did, chatRoomId: chatRoomId.toHexString() });
        assert.equal(chatMembershipCount, 1);
        assert.equal((await db.collection("circles").findOne({ _id: circleId }))?.members, 1);
        assertContractForMilestone2("an existing member row must not suppress repair of incomplete side effects", () =>
            assert.equal(chatMembershipCount, 1),
        );
    });

    it("repairs and deduplicates welcome conversation and message creation", async () => {
        const did = crypto.createHash("sha256").update(`welcome-repair:${new ObjectId()}`).digest("hex");
        const config = {
            senderHandle: "kamooni",
            displayName: "Kamooni",
            avatarUrl: "/images/kamooni.png",
            threadName: "Welcome to Kamooni",
            source: "system_welcome" as const,
            version: "test-v1",
            repliesDisabled: true,
            markdown: "Synthetic welcome message",
        };
        const [first, retry] = await Promise.all([
            ensureWelcomeMessageForNewUser(did, config, `sender-${did}`),
            ensureWelcomeMessageForNewUser(did, config, `sender-${did}`),
        ]);
        assert.equal(first.conversationId, retry.conversationId);
        assert.equal([first.messageCreated, retry.messageCreated].filter(Boolean).length, 1);
        assert.equal((await ensureWelcomeMessageForNewUser(did, config, `sender-${did}`)).messageCreated, false);
        assert.equal(
            await db.collection("chatConversations").countDocuments({ handle: `welcome-${did}`, participants: did }),
            1,
        );
        assert.equal(
            await db
                .collection("chatMessageDocs")
                .countDocuments({ conversationId: first.conversationId, source: config.source }),
            1,
        );
    });

    it("models interruption during profile and welcome finalization", async () => {
        for (const fault of ["during_profile_finalization", "during_welcome_finalization"] as const) {
            const c = await makeCase(fault);
            assert.equal((await complete(c)).success, false, fault);
            assert.equal(
                await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
                1,
            );
            assert.equal(c.sessionCount, 0);
        }
    });

    it("models failure before and after the durable provisioned transition", async () => {
        const before = await makeCase("before_provisioned_update");
        assert.equal((await complete(before)).success, false);
        assert.equal((await collections.registrations.findOne({ _id: before.id }))?.status, "provisioning_claimed");

        const after = await makeCase("after_provisioned_update");
        assert.equal((await complete(after)).success, false);
        assert.equal((await collections.registrations.findOne({ _id: after.id }))?.status, "provisioned");
        assert.equal(
            after.sessionCount,
            0,
            "a lost response after durable finalization does not roll back account readiness",
        );
        assert.equal(
            (await complete(after)).success,
            false,
            "consumed capability cannot repeat completion after lost response",
        );
        const finalizedAccount = await db
            .collection("circles")
            .findOne({ "metadata.pendingRegistrationId": after.id.toHexString() });
        assert.ok(finalizedAccount?._id);
        assert.equal(
            await finalizeClaimedRegistrationForAuthenticatedLogin({
                _id: finalizedAccount!._id.toString(),
                did: after.generatedDid!,
                metadata: finalizedAccount!.metadata,
            }),
            true,
            "an authenticated ordinary login recognizes durable completion after the response was lost",
        );
        assert.equal(after.sessionCount, 0, "reconciliation does not issue a session");
        await collections.registrations.deleteOne({ _id: after.id });
        assert.equal(
            await finalizeClaimedRegistrationForAuthenticatedLogin({
                _id: finalizedAccount!._id.toString(),
                did: after.generatedDid!,
                metadata: finalizedAccount!.metadata,
            }),
            true,
            "the durable account marker preserves ordinary login after provisioned-record TTL cleanup",
        );
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": after.id.toHexString() }),
            1,
        );
    });

    it("models session issuance failure before and after the external session side effect", async () => {
        const before = await makeCase("during_session_issuance");
        assert.equal((await complete(before)).success, false);
        assert.equal(before.sessionCount, 0);
        assert.equal((await collections.registrations.findOne({ _id: before.id }))?.status, "provisioned");

        const after = await makeCase("after_session_issuance");
        assert.equal((await complete(after)).success, false);
        assert.equal(after.sessionCount, 1);
        assert.equal((await collections.registrations.findOne({ _id: after.id }))?.status, "provisioned");
    });

    it("models two completion workers racing on the same one-use continuation", async () => {
        const c = await makeCase();
        const outcomes = await Promise.all([complete(c), complete(c)]);
        assert.equal(outcomes.filter((result) => result.success).length, 1);
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            1,
        );
        assert.equal(c.sessionCount, 1);
    });

    it("enforces session issuance only after durable registration finalization", async () => {
        const c = await makeCase("none");
        assert.equal((await complete(c)).success, true);
        const state = await collections.registrations.findOne({ _id: c.id });
        assert.equal(state?.status, "provisioned");
        assertContractForMilestone2("session issuance must follow durable status=provisioned", () => {
            assert.ok(c.events.indexOf("session-issued") > c.events.indexOf("provisioned"));
        });
    });

    it("rejects success when the lease-fenced provisioned update matches no record", async () => {
        const c = await makeCase("none", { loseFinalUpdate: true });
        const result = await complete(c);
        const state = await collections.registrations.findOne({ _id: c.id });
        assert.equal(result.success, false);
        assert.equal(c.updateWasLost, true);
        assert.equal(state?.status, "provisioning_claimed");
        assert.equal(c.sessionCount, 0, "zero-match finalization never issues a session");
    });

    it("rejects expired leases for claim acquisition and requires a durable claim for DID reservation", async () => {
        const c = await makeCase("none");
        const expiredLease = "expired-worker";
        await collections.registrations.updateOne(
            { _id: c.id },
            {
                $set: {
                    status: "provisioning",
                    provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", expiredLease),
                    provisioningLeaseExpiresAt: new Date(Date.now() - 1),
                    reservedDid: null,
                },
            },
        );
        const staleWorkerDid = "a".repeat(64);
        assert.equal(
            await acquirePendingRegistrationProvisioningClaim(
                c.id.toHexString(),
                expiredLease,
                "expired-claim",
                c.deps,
            ),
            false,
        );
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, null);
        assert.equal(
            await reservePendingRegistrationDid(c.id.toHexString(), staleWorkerDid, "expired-claim", c.deps),
            false,
        );
        assert.equal(await renewPendingRegistrationProvisioningLease(c.id.toHexString(), expiredLease, c.deps), false);
        const newLease = "replacement-worker";
        const newClaim = "replacement-claim";
        await collections.registrations.updateOne(
            { _id: c.id },
            {
                $set: {
                    provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", newLease),
                    provisioningLeaseExpiresAt: new Date(Date.now() + 60_000),
                },
            },
        );
        assert.equal(
            await acquirePendingRegistrationProvisioningClaim(c.id.toHexString(), expiredLease, "stale-claim", c.deps),
            false,
        );
        assert.equal(
            await isPendingRegistrationProvisioningLeaseOwner(c.id.toHexString(), expiredLease, c.deps),
            false,
        );
        assert.equal(await renewPendingRegistrationProvisioningLease(c.id.toHexString(), newLease, c.deps), true);
        assert.equal(
            await acquirePendingRegistrationProvisioningClaim(c.id.toHexString(), newLease, newClaim, c.deps),
            true,
        );
        assert.equal(await reservePendingRegistrationDid(c.id.toHexString(), staleWorkerDid, newClaim, c.deps), true);
    });

    it("prevents a second registration from reserving another registration's DID", async () => {
        const first = await makeCase("after_did_reservation");
        assert.equal((await complete(first)).success, false);
        const second = await makeCase();
        const secondLease = "second-registration-lease";
        const secondClaim = "second-registration-claim";
        await collections.registrations.updateOne(
            { _id: second.id },
            {
                $set: {
                    status: "provisioning",
                    provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", secondLease),
                    provisioningLeaseExpiresAt: new Date(Date.now() + 60_000),
                },
            },
        );
        assert.equal(
            await acquirePendingRegistrationProvisioningClaim(
                second.id.toHexString(),
                secondLease,
                secondClaim,
                second.deps,
            ),
            true,
        );
        const crossRegistrationReservation = await reservePendingRegistrationDid(
            second.id.toHexString(),
            first.generatedDid!,
            secondClaim,
            second.deps,
        );
        assert.equal(crossRegistrationReservation, false);
        assert.equal((await collections.registrations.findOne({ _id: second.id }))?.reservedDid, null);
    });

    it("atomically permits only one of two concurrent registrations to reserve the same DID", async () => {
        const first = await makeCase();
        const second = await makeCase();
        const firstLease = "concurrent-owner-one";
        const secondLease = "concurrent-owner-two";
        const claims = ["concurrent-claim-one", "concurrent-claim-two"] as const;
        const registrations: Array<[typeof first, string]> = [
            [first, firstLease],
            [second, secondLease],
        ];
        for (const [index, [registration, token]] of registrations.entries()) {
            await collections.registrations.updateOne(
                { _id: registration.id },
                {
                    $set: {
                        status: "provisioning",
                        provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", token),
                        provisioningLeaseExpiresAt: new Date(Date.now() + 60_000),
                    },
                },
            );
            assert.equal(
                await acquirePendingRegistrationProvisioningClaim(
                    registration.id.toHexString(),
                    token,
                    claims[index],
                    registration.deps,
                ),
                true,
            );
        }
        const did = "c".repeat(64);
        const results = await Promise.all([
            reservePendingRegistrationDid(first.id.toHexString(), did, claims[0], first.deps),
            reservePendingRegistrationDid(second.id.toHexString(), did, claims[1], second.deps),
        ]);
        assert.equal(results.filter(Boolean).length, 1);
        assert.equal(await collections.didReservations.countDocuments({ did }), 1);
        assert.equal(await collections.registrations.countDocuments({ reservedDid: did }), 1);
    });

    it("retains DID ownership across a new Mongo client after process restart", async () => {
        const owner = await makeCase("after_did_reservation");
        assert.equal((await complete(owner)).success, false);
        const ownerDid = owner.generatedDid;
        if (!ownerDid) throw new Error("Test did not retain the synthetic DID");
        const contender = await makeCase();
        const contenderLease = "restarted-contender";
        const contenderClaim = "restarted-contender-claim";
        const restartedClient = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
        try {
            await restartedClient.connect();
            const restartedDb = restartedClient.db(databaseName);
            const restartedCollections = {
                ...contender.deps.collections,
                registrations: restartedDb.collection<PendingRegistration>("pendingRegistrations"),
                didReservations: restartedDb.collection<PendingRegistrationDidReservation>(
                    "pendingRegistrationDidReservations",
                ),
            } as PendingRegistrationCollections;
            await restartedCollections.registrations.updateOne(
                { _id: contender.id },
                {
                    $set: {
                        status: "provisioning",
                        provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", contenderLease),
                        provisioningLeaseExpiresAt: new Date(Date.now() + 60_000),
                    },
                },
            );
            assert.equal(
                await acquirePendingRegistrationProvisioningClaim(
                    contender.id.toHexString(),
                    contenderLease,
                    contenderClaim,
                    { collections: restartedCollections },
                ),
                true,
            );
            assert.equal(
                await reservePendingRegistrationDid(contender.id.toHexString(), ownerDid, contenderClaim, {
                    collections: restartedCollections,
                }),
                false,
            );
            const persisted = await restartedCollections.didReservations.findOne({ _id: owner.id.toHexString() });
            assert.equal(persisted?.did, ownerDid);
        } finally {
            await restartedClient.close();
        }
    });

    it("backfills non-conflicting legacy reservations and fails closed on duplicate legacy ownership", async () => {
        const legacy = await makeCase();
        const legacyDid = "d".repeat(64);
        await collections.registrations.updateOne(
            { _id: legacy.id },
            { $set: { status: "provisioning", reservedDid: legacyDid } },
        );
        await backfillPendingRegistrationDidReservations(collections);
        assert.equal((await collections.didReservations.findOne({ _id: legacy.id.toHexString() }))?.did, legacyDid);

        const duplicate = await makeCase();
        await collections.registrations.updateOne(
            { _id: duplicate.id },
            { $set: { status: "provisioning", reservedDid: legacyDid } },
        );
        await assert.rejects(
            backfillPendingRegistrationDidReservations(collections),
            /Conflicting legacy pending DID reservations require manual review/,
        );
        assert.equal(await collections.didReservations.countDocuments({ did: legacyDid }), 1);
    });

    it("reconciliation finds a DID registry write interrupted before the pending record update", async () => {
        const c = await makeCase();
        assert.equal(await prepareClaim(c, "registry-only-lease", "registry-only-claim"), true);
        const did = "e".repeat(64);
        await collections.didReservations.insertOne({
            _id: c.id.toHexString(),
            did,
            createdAt: new Date(),
        });
        const report = await inspectPendingRegistrationReconciliation(db, {
            usersDirectory,
            pendingRegistrationId: c.id.toHexString(),
        });
        assert.equal(report.length, 1, "registry-only reservations remain visible for review");
        assert.equal(report[0].reservedDid, did);
        assert.equal(report[0].classification, "manual_review_missing_credentials");
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, null);
    });

    it("fences lock acquire, renew, expiry reclaim and release across workers", async () => {
        const locks = db.collection<any>("pendingRegistrationTestOwnedLocks");
        const id = new ObjectId().toHexString();
        const now = new Date();
        assert.equal(await acquirePendingRegistrationOwnedLock(locks as any, id, "worker-one", now, 1000), true);
        assert.equal(await acquirePendingRegistrationOwnedLock(locks as any, id, "worker-two", now, 1000), false);
        assert.equal(await renewPendingRegistrationOwnedLock(locks as any, id, "worker-one", now, 1000), true);
        await locks.updateOne({ _id: id }, { $set: { expiresAt: new Date(now.getTime() - 1) } });
        assert.equal(await acquirePendingRegistrationOwnedLock(locks as any, id, "worker-two", now, 1000), true);
        assert.equal(await releasePendingRegistrationOwnedLock(locks as any, id, "worker-one"), false);
        assert.equal(await releasePendingRegistrationOwnedLock(locks as any, id, "worker-two"), true);
    });

    it("reproduces reconciliation accepting a correlated account with mismatched email and handle", async () => {
        const c = await makeCase();
        const keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
        const publicKeyPem = keyPair.publicKey.export({ type: "pkcs1", format: "pem" }).toString();
        const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
        const credentialDirectory = path.join(usersDirectory, did);
        fs.mkdirSync(credentialDirectory, { recursive: true });
        fs.writeFileSync(path.join(credentialDirectory, "publicKey.pem"), publicKeyPem);
        fs.writeFileSync(path.join(credentialDirectory, "salt.bin"), crypto.randomBytes(16));
        fs.writeFileSync(path.join(credentialDirectory, "iv.bin"), crypto.randomBytes(16));
        fs.writeFileSync(path.join(credentialDirectory, "privateKey.pem.enc"), crypto.randomBytes(64));
        await collections.registrations.updateOne(
            { _id: c.id },
            { $set: { status: "provisioning", reservedDid: did, reconciliationRequiredAt: new Date() } },
        );
        await collections.didReservations.insertOne({
            _id: c.id.toHexString(),
            did,
            createdAt: new Date(),
        });
        await db.collection("circles").insertOne({
            _id: c.accountId,
            did,
            email: "different-account@example.invalid",
            handle: "different-account",
            publicKey: publicKeyPem,
            metadata: { pendingRegistrationId: c.id.toHexString() },
        });
        const [report] = await inspectPendingRegistrationReconciliation(db, {
            usersDirectory,
            pendingRegistrationId: c.id.toHexString(),
        });
        assert.equal(report.classification, "manual_review_account_mismatch");
    });

    it("allows retry after a successful durable transition only with a new registration authorization", async () => {
        const c = await makeCase();
        const first = await complete(c);
        assert.equal(first.success, true);
        assert.equal((await complete(c)).success, false);
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            1,
        );
        assert.equal(c.sessionCount, 1);
    });
});

async function main() {
    try {
        await client.connect();
        db = client.db(databaseName);
        await db.dropDatabase();
        collections = {
            registrations: db.collection<PendingRegistration>("pendingRegistrations"),
            didReservations: db.collection("pendingRegistrationDidReservations"),
            rateLimits: db.collection("pendingRegistrationRateLimits"),
            auditEvents: db.collection("pendingRegistrationAuditEvents"),
        };
        await ensurePendingRegistrationIndexes(collections);
        await db.collection("circles").createIndex(
            { "metadata.pendingRegistrationId": 1 },
            {
                unique: true,
                partialFilterExpression: { "metadata.pendingRegistrationId": { $type: "string" } },
            },
        );
        for (const testCase of cases) {
            await testCase.run();
            console.log(`PASS ${testCase.name}`);
        }
        console.log(`Passed ${cases.length} pending-registration crash-contract cases.`);
        assert.deepEqual(
            [...satisfiedMilestone2Contracts].sort(),
            [...milestone2Contracts].sort(),
            "Both original Milestone 2B contracts must remain explicit passing assertions",
        );
        console.log("Both original Milestone 2B expected failures are now enforced as passing assertions.");
    } finally {
        try {
            if (db) await db.dropDatabase();
        } finally {
            try {
                await closeDbForTests();
            } finally {
                await client.close();
                fs.rmSync(usersDirectory, { recursive: true, force: true });
            }
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
