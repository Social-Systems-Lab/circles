import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import {
    ensurePendingRegistrationIndexes,
    hashPendingRegistrationSecret,
    PENDING_PROVISIONING_LEASE_MS,
    provisionPendingRegistration,
    reservePendingRegistrationDid,
    resendPendingRegistrationVerification,
    type PendingRegistration,
    type PendingRegistrationCollections,
    type PendingRegistrationDependencies,
    verifyPendingRegistrationEmail,
} from "@/lib/auth/pending-registration";
import { inspectPendingRegistrationReconciliation } from "@/lib/auth/pending-registration-reconciliation";

process.env.PENDING_REGISTRATION_TOKEN_HMAC_KEY = "crash-contract-integration-test-only";

type FaultPoint =
    | "none"
    | "before_did_reservation"
    | "after_did_reservation"
    | "during_credential_writes"
    | "after_credentials"
    | "after_account_insert"
    | "during_membership"
    | "after_membership"
    | "during_profile_finalization"
    | "during_welcome_finalization"
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
const reproducedContractFailures: string[] = [];
const expectedContractFailures = [
    "session issuance must follow durable status=provisioned",
    "a zero-match provisioned transition must not return success",
    "a stale worker must not reserve a DID under a newer lease",
    "a DID reserved by one registration must not be claimable by another",
    "lock release must match the acquiring worker's fencing token",
    "an existing member row must not suppress repair of incomplete side effects",
    "reconciliation must reject account email/handle mismatch",
];
function describe(_name: string, register: () => void) {
    register();
}
function it(name: string, run: () => Promise<void>) {
    cases.push({ name, run });
}
function assertContractForMilestone2(name: string, assertion: () => void) {
    try {
        assertion();
        console.log(`CONTRACT SATISFIED: ${name}`);
    } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ERR_ASSERTION") throw error;
        reproducedContractFailures.push(name);
        console.warn(`EXPECTED CURRENT FAILURE: ${name}`);
    }
}

async function makeCase(fault: FaultPoint = "none", overrides: { loseFinalUpdate?: boolean } = {}) {
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
    let membershipInsertCount = 0;
    let welcomeInsertCount = 0;
    let loseUpdate = overrides.loseFinalUpdate ?? false;
    let updateWasLost = false;
    const deps: PendingRegistrationDependencies = {
        collections: {
            ...collections,
            registrations: {
                findOne: (filter: any, options?: any) => collections.registrations.findOne(filter, options),
                findOneAndUpdate: (filter: any, update: any, options?: any) =>
                    collections.registrations.findOneAndUpdate(filter, update, options),
                createIndex: (index: any, options?: any) => collections.registrations.createIndex(index, options),
                updateOne: async (filter: any, update: any, options?: any) => {
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
        provisionAccount: async ({ pendingRegistrationId }) => {
            events.push("provision-start");
            if (activeFault === "before_did_reservation") throw new Error("injected before DID reservation");
            const keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
            const publicKeyPem = keyPair.publicKey.export({ type: "pkcs1", format: "pem" }).toString();
            const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
            generatedDid = did;
            assert.equal(
                await reservePendingRegistrationDid(pendingRegistrationId, did, deps),
                true,
                "test worker reserves the generated identity",
            );
            events.push("did-reserved");
            if (activeFault === "after_did_reservation") throw new Error("injected after DID reservation");
            const credentialDirectory = path.join(usersDirectory, did);
            fs.mkdirSync(credentialDirectory, { recursive: true });
            fs.writeFileSync(path.join(credentialDirectory, "publicKey.pem"), publicKeyPem);
            if (activeFault === "during_credential_writes") throw new Error("injected during credential writes");
            fs.writeFileSync(path.join(credentialDirectory, "salt.bin"), crypto.randomBytes(16));
            fs.writeFileSync(path.join(credentialDirectory, "iv.bin"), crypto.randomBytes(16));
            fs.writeFileSync(path.join(credentialDirectory, "privateKey.pem.enc"), crypto.randomBytes(64));
            events.push("credentials-complete");
            if (activeFault === "after_credentials") throw new Error("injected after credentials");
            await db.collection("circles").insertOne({
                _id: accountId,
                did,
                email: registration.email,
                handle: registration.requestedHandle,
                metadata: { pendingRegistrationId },
            });
            accountInsertCount += 1;
            events.push("account-inserted");
            if (activeFault === "after_account_insert") throw new Error("injected after account insert");
            if (activeFault === "during_membership") throw new Error("injected during membership creation");
            await db
                .collection("members")
                .updateOne(
                    { userDid: did, circleId: accountId.toHexString() },
                    { $setOnInsert: { joinedAt: now, userGroups: ["admins", "moderators", "members"] } },
                    { upsert: true },
                );
            membershipInsertCount += 1;
            events.push("membership-created");
            if (activeFault === "after_membership") throw new Error("injected after membership creation");
            return { accountId: accountId.toHexString(), did };
        },
        finalizeAccount: async () => {
            if (activeFault === "during_profile_finalization") throw new Error("injected during profile finalization");
            await db
                .collection("pendingTestProfiles")
                .updateOne(
                    { _id: accountId },
                    { $setOnInsert: { createdAt: now, onboardingComplete: false } },
                    { upsert: true },
                );
            events.push("profile-finalized");
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
    };
}

async function complete(testCase: Awaited<ReturnType<typeof makeCase>>) {
    return provisionPendingRegistration(
        {
            pendingRegistrationId: testCase.id.toHexString(),
            verifiedContinuationSecret: testCase.continuation,
            password: "synthetic-test-password",
        },
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

    it("characterizes the post-claim/pre-reservation interruption and consumed-capability replay", async () => {
        const c = await makeCase("before_did_reservation");
        const result = await complete(c);
        const stored = await collections.registrations.findOne({ _id: c.id });
        assert.equal(result.success, false);
        assert.equal(stored?.status, "provisioning");
        assert.equal(stored?.reservedDid, null);
        assert.equal(stored?.verifiedContinuationHash, undefined);
        assert.equal(c.sessionCount, 0);
        assert.equal((await complete(c)).success, false, "consumed continuation is not reusable");
    });

    it("retries a pre-DID interruption only after lease expiry and fresh email verification", async () => {
        const c = await makeCase("before_did_reservation");
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
        assert.ok(c.generatedDid, "one original DID is generated on the renewed authorized attempt");
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, c.generatedDid);
        assert.equal(
            await db.collection("circles").countDocuments({ "metadata.pendingRegistrationId": c.id.toHexString() }),
            1,
        );
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
        assert.equal(await reservePendingRegistrationDid(c.id.toHexString(), "f".repeat(64), c.deps), false);
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
    });

    it("characterizes partial self-membership and verifies the persisted insert is singular", async () => {
        const c = await makeCase("after_membership");
        assert.equal((await complete(c)).success, false);
        assert.equal(c.membershipInsertCount, 1);
        assert.equal(await db.collection("members").countDocuments({ circleId: c.accountId.toHexString() }), 1);
        assert.equal(c.sessionCount, 0);
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
        assert.equal((await collections.registrations.findOne({ _id: before.id }))?.status, "provisioning");

        const after = await makeCase("after_provisioned_update");
        assert.equal((await complete(after)).success, false);
        assert.equal((await collections.registrations.findOne({ _id: after.id }))?.status, "provisioned");
        assert.equal(
            (await complete(after)).success,
            false,
            "consumed capability cannot repeat completion after lost response",
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
        assert.equal((await collections.registrations.findOne({ _id: before.id }))?.status, "provisioning");

        const after = await makeCase("after_session_issuance");
        assert.equal((await complete(after)).success, false);
        assert.equal(after.sessionCount, 1);
        assert.equal((await collections.registrations.findOne({ _id: after.id }))?.status, "provisioning");
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

    it("records the current session-before-durable-completion ordering as a reproduced contract violation", async () => {
        const c = await makeCase("none");
        assert.equal((await complete(c)).success, true);
        const state = await collections.registrations.findOne({ _id: c.id });
        assert.equal(state?.status, "provisioned");
        assertContractForMilestone2("session issuance must follow durable status=provisioned", () => {
            assert.ok(c.events.indexOf("session-issued") > c.events.indexOf("provisioned"));
        });
    });

    it("reproduces success being returned when the lease-fenced provisioned update matches no record", async () => {
        const c = await makeCase("none", { loseFinalUpdate: true });
        const result = await complete(c);
        const state = await collections.registrations.findOne({ _id: c.id });
        assert.equal(result.success, true);
        assert.equal(c.updateWasLost, true);
        assert.equal(state?.status, "provisioning");
        assertContractForMilestone2("a zero-match provisioned transition must not return success", () => {
            assert.equal(result.success, false);
        });
    });

    it("reproduces an unfenced DID reservation accepting a stale worker during a newer lease", async () => {
        const c = await makeCase("none");
        await collections.registrations.updateOne(
            { _id: c.id },
            {
                $set: {
                    status: "provisioning",
                    provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", "new-worker"),
                    provisioningLeaseExpiresAt: new Date(Date.now() + 60_000),
                    reservedDid: null,
                },
            },
        );
        const staleWorkerDid = "a".repeat(64);
        const reservationAccepted = await reservePendingRegistrationDid(c.id.toHexString(), staleWorkerDid, c.deps);
        assert.equal(reservationAccepted, true);
        assert.equal((await collections.registrations.findOne({ _id: c.id }))?.reservedDid, staleWorkerDid);
        assertContractForMilestone2("a stale worker must not reserve a DID under a newer lease", () => {
            assert.equal(reservationAccepted, false);
        });
    });

    it("reproduces a second registration reserving another registration's DID", async () => {
        const first = await makeCase("after_did_reservation");
        assert.equal((await complete(first)).success, false);
        const second = await makeCase();
        await collections.registrations.updateOne({ _id: second.id }, { $set: { status: "provisioning" } });
        const crossRegistrationReservation = await reservePendingRegistrationDid(
            second.id.toHexString(),
            first.generatedDid!,
            second.deps,
        );
        assert.equal(crossRegistrationReservation, true);
        assert.equal((await collections.registrations.findOne({ _id: second.id }))?.reservedDid, first.generatedDid);
        assertContractForMilestone2("a DID reserved by one registration must not be claimable by another", () => {
            assert.equal(crossRegistrationReservation, false);
        });
    });

    it("reproduces finalization-lock release without owner fencing", async () => {
        const runtimeSource = fs.readFileSync("src/lib/auth/pending-registration-runtime.ts", "utf8");
        assert.match(runtimeSource, /finalizationLocks\.deleteOne\(\{ _id: accountId \}\)/);
        assert.match(runtimeSource, /type FinalizationLock = \{ _id: string; expiresAt: Date \}/);
        assertContractForMilestone2("lock release must match the acquiring worker's fencing token", () => {
            assert.doesNotMatch(runtimeSource, /finalizationLocks\.deleteOne\(\{ _id: accountId \}\)/);
        });
    });

    it("reproduces membership retry skipping side effects after the member row exists", async () => {
        const memberSource = fs.readFileSync("src/lib/data/member.ts", "utf8");
        const runtimeSource = fs.readFileSync("src/lib/auth/pending-registration-runtime.ts", "utf8");
        assert.ok(
            memberSource.indexOf("await Members.insertOne(member)") <
                memberSource.indexOf("await autoAddToMemberChats"),
        );
        assert.ok(memberSource.indexOf("await autoAddToMemberChats") < memberSource.indexOf("$inc: { members: 1 }"));
        assert.match(runtimeSource, /if \(\!\(await getMember\(did, user\._id!\)\)\)\s*\{\s*await addMember/);
        assertContractForMilestone2(
            "an existing member row must not suppress repair of incomplete side effects",
            () => {
                assert.doesNotMatch(
                    runtimeSource,
                    /if \(\!\(await getMember\(did, user\._id!\)\)\)\s*\{\s*await addMember/,
                );
            },
        );
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
        await db.collection("circles").insertOne({
            _id: c.accountId,
            did,
            email: "different-account@example.invalid",
            handle: "different-account",
            metadata: { pendingRegistrationId: c.id.toHexString() },
        });
        const [report] = await inspectPendingRegistrationReconciliation(db, {
            usersDirectory,
            pendingRegistrationId: c.id.toHexString(),
        });
        assert.equal(report.classification, "recoverable_finalize");
        assertContractForMilestone2("reconciliation must reject account email/handle mismatch", () => {
            assert.notEqual(report.classification, "recoverable_finalize");
        });
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
        console.log(
            `Milestone 2 assertions failing against current implementation: ${reproducedContractFailures.length}`,
        );
        for (const failure of reproducedContractFailures) console.log(`  - ${failure}`);
        assert.deepEqual(
            [...reproducedContractFailures].sort(),
            [...expectedContractFailures].sort(),
            "Expected-failure inventory changed; review the security contract before updating this baseline",
        );
    } finally {
        try {
            if (db) await db.dropDatabase();
        } finally {
            await client.close();
            fs.rmSync(usersDirectory, { recursive: true, force: true });
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
