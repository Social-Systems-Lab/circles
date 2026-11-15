import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ObjectId } from "mongodb";
// @ts-expect-error Bun's runtime test module is available even though this repository does not install its types.
import { afterEach, beforeEach, test } from "bun:test";
import { verifyCompletedAccountIntegrity } from "@/lib/auth/pending-registration-reconciliation";

type FakeDb = {
    collection: (name: string) => {
        find: (filter?: Record<string, unknown>) => {
            limit: (value: number) => { toArray: () => Promise<unknown[]> };
            toArray: () => Promise<unknown[]>;
        };
        findOne: (filter: Record<string, unknown>) => Promise<unknown | null>;
        countDocuments: (filter?: Record<string, unknown>) => Promise<number>;
    };
};

function valueAtPath(document: Record<string, unknown>, key: string): unknown {
    return key.split(".").reduce<unknown>((value, part) => {
        if (!value || typeof value !== "object") return undefined;
        return (value as Record<string, unknown>)[part];
    }, document);
}

function matches(document: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = valueAtPath(document, key);
        if (expected && typeof expected === "object" && "$gt" in expected) {
            return actual instanceof Date && actual > (expected as { $gt: Date }).$gt;
        }
        if (expected && typeof expected === "object" && "$ne" in expected) {
            return actual !== (expected as { $ne: unknown }).$ne;
        }
        return String(actual) === String(expected);
    });
}

function fakeDb(initial: Record<string, Array<Record<string, unknown>>>): FakeDb {
    const collections = new Map(Object.entries(initial));
    return {
        collection(name) {
            const records = collections.get(name) ?? [];
            collections.set(name, records);
            const apply = (filter: Record<string, unknown> = {}) => records.filter((record) => matches(record, filter));
            return {
                find(filter = {}) {
                    let matched = apply(filter);
                    return {
                        limit(value) {
                            matched = matched.slice(0, value);
                            return { toArray: async () => matched };
                        },
                        toArray: async () => matched,
                    };
                },
                findOne: async (filter) => apply(filter)[0] ?? null,
                countDocuments: async (filter = {}) => apply(filter).length,
            };
        },
    };
}

const handle = "pilot-account";
let root = "";
let account: Record<string, any>;
let pendingRegistration: Record<string, any>;
let reservation: Record<string, any>;
let documents: Record<string, Array<Record<string, any>>>;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "completed-account-integrity-"));
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: "pkcs1", format: "pem" }).toString();
    const did = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
    const accountId = new ObjectId();
    const pendingId = new ObjectId();
    const credentialDirectory = path.join(root, did);
    fs.mkdirSync(credentialDirectory);
    fs.writeFileSync(path.join(credentialDirectory, "publicKey.pem"), publicKeyPem);
    fs.writeFileSync(path.join(credentialDirectory, "salt.bin"), crypto.randomBytes(16));
    fs.writeFileSync(path.join(credentialDirectory, "iv.bin"), crypto.randomBytes(16));
    fs.writeFileSync(path.join(credentialDirectory, "privateKey.pem.enc"), "opaque-synthetic-private-key");

    account = {
        _id: accountId,
        circleType: "user",
        did,
        handle,
        email: "private-pilot@example.invalid",
        publicKey: publicKeyPem,
        isHuman: true,
        metadata: {
            pendingRegistrationId: pendingId.toHexString(),
            onboardingFlow: "pending-registration-v1",
            pendingRegistrationFinalizationVersion: 1,
        },
    };
    pendingRegistration = {
        _id: pendingId,
        requestedHandle: handle,
        normalizedEmail: "private-pilot@example.invalid",
        status: "provisioned",
        reservedDid: did,
        accountId: accountId.toHexString(),
        accountDid: did,
        provisionedAt: new Date(),
        reconciliationRequiredAt: null,
        provisioningClaimHash: null,
        provisioningLeaseHash: null,
        provisioningLeaseExpiresAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
    };
    reservation = { _id: pendingId.toHexString(), did, createdAt: new Date() };
    documents = {
        circles: [account],
        pendingRegistrations: [pendingRegistration],
        pendingRegistrationDidReservations: [reservation],
        pendingRegistrationProvisioningLocks: [],
        pendingRegistrationFinalizationLocks: [],
    };
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

async function verify() {
    return verifyCompletedAccountIntegrity(fakeDb(documents) as any, {
        handle,
        usersDirectory: root,
    });
}

test("verified provisioned account returns only privacy-safe PASS evidence", async () => {
    const result = await verify();
    assert.equal(result.result, "PASS");
    assert.equal(result.pendingRecordRetained, true);
    assert.deepEqual(result.failureCodes, []);
    assert.equal(result.checks.uniqueAccountByDid, true);
    assert.equal(result.checks.reservationMatchesAccount, true);
    assert.equal(result.checks.mongoPublicKeyMatchesDid, true);
    assert.equal(result.checks.credentialPublicKeyMatchesDid, true);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(
        serialized,
        new RegExp(`${handle}|${account.did}|${account._id}|${pendingRegistration._id}|private-pilot|${root}`),
    );
});

test("expired pending record passes using durable account metadata and reservation", async () => {
    documents.pendingRegistrations = [];
    const result = await verify();
    assert.equal(result.result, "PASS");
    assert.equal(result.pendingRecordRetained, false);
    assert.equal(result.checks.pendingRecordStatusProvisioned, null);
});

test("missing account and missing reservation return fixed failure codes", async () => {
    documents.circles = [];
    let result = await verify();
    assert.deepEqual(result.failureCodes, ["account_not_found"]);

    documents.circles = [account];
    documents.pendingRegistrationDidReservations = [];
    result = await verify();
    assert.ok(result.failureCodes.includes("reservation_missing"));
});

test("duplicate handle, DID and pending correlations fail explicitly", async () => {
    documents.circles.push({ ...account, _id: new ObjectId() });
    let result = await verify();
    assert.equal(result.result, "FAIL");
    assert.ok(result.failureCodes.includes("duplicate_account"));

    documents.circles = [account, { ...account, _id: new ObjectId(), handle: "other-handle" }];
    result = await verify();
    assert.ok(result.failureCodes.includes("duplicate_did_account"));

    documents.circles = [account, { ...account, _id: new ObjectId(), handle: "other-handle", did: "f".repeat(64) }];
    result = await verify();
    assert.ok(result.failureCodes.includes("duplicate_pending_correlation"));
});

test("reservation mismatch and duplicate DID reservations fail", async () => {
    documents.pendingRegistrationDidReservations[0] = { ...reservation, did: "f".repeat(64) };
    let result = await verify();
    assert.ok(result.failureCodes.includes("reservation_identity_mismatch"));

    documents.pendingRegistrationDidReservations = [
        reservation,
        { _id: new ObjectId().toHexString(), did: account.did, createdAt: new Date() },
    ];
    result = await verify();
    assert.ok(result.failureCodes.includes("duplicate_reservation"));
});

test("MongoDB and credential public-key mismatches fail independently", async () => {
    account.publicKey = "wrong-mongo-public-key";
    let result = await verify();
    assert.ok(result.failureCodes.includes("mongo_public_key_mismatch"));

    account.publicKey = crypto
        .generateKeyPairSync("rsa", { modulusLength: 2048 })
        .publicKey.export({ type: "pkcs1", format: "pem" })
        .toString();
    account.did = crypto.createHash("sha256").update(account.publicKey).digest("hex");
    pendingRegistration.accountDid = account.did;
    pendingRegistration.reservedDid = account.did;
    reservation.did = account.did;

    const validPublicKey = crypto
        .generateKeyPairSync("rsa", { modulusLength: 2048 })
        .publicKey.export({ type: "pkcs1", format: "pem" })
        .toString();
    account.did = crypto.createHash("sha256").update(validPublicKey).digest("hex");
    account.publicKey = validPublicKey;
    pendingRegistration.accountDid = account.did;
    pendingRegistration.reservedDid = account.did;
    reservation.did = account.did;
    const validDirectory = path.join(root, account.did);
    fs.mkdirSync(validDirectory);
    fs.writeFileSync(path.join(validDirectory, "publicKey.pem"), validPublicKey);
    fs.writeFileSync(path.join(validDirectory, "salt.bin"), crypto.randomBytes(16));
    fs.writeFileSync(path.join(validDirectory, "iv.bin"), crypto.randomBytes(16));
    fs.writeFileSync(path.join(validDirectory, "privateKey.pem.enc"), "opaque-synthetic-private-key");
    fs.writeFileSync(path.join(validDirectory, "publicKey.pem"), "wrong-credential-public-key");
    result = await verify();
    assert.ok(result.failureCodes.includes("credential_public_key_mismatch"));
});

test("missing files, symlink directories, path traversal and incomplete finalization fail", async () => {
    let result;
    for (const [filename, failureCode] of [
        ["salt.bin", "credential_salt_invalid"],
        ["iv.bin", "credential_iv_invalid"],
        ["publicKey.pem", "credential_public_key_invalid"],
        ["privateKey.pem.enc", "credential_encrypted_private_key_invalid"],
    ] as const) {
        const credentialFile = path.join(root, account.did, filename);
        const original = fs.readFileSync(credentialFile);
        fs.rmSync(credentialFile);
        result = await verify();
        assert.ok(result.failureCodes.includes(failureCode));
        fs.writeFileSync(credentialFile, original);
    }

    const target = fs.mkdtempSync(path.join(os.tmpdir(), "completed-account-symlink-target-"));
    try {
        fs.rmSync(path.join(root, account.did), { recursive: true, force: true });
        fs.symlinkSync(target, path.join(root, account.did), "dir");
        result = await verify();
        assert.ok(result.failureCodes.includes("credential_directory_invalid"));
    } finally {
        fs.rmSync(target, { recursive: true, force: true });
    }

    fs.rmSync(path.join(root, account.did), { force: true });
    fs.mkdirSync(path.join(root, account.did));
    fs.writeFileSync(path.join(root, account.did, "salt.bin"), crypto.randomBytes(16));
    fs.writeFileSync(path.join(root, account.did, "iv.bin"), crypto.randomBytes(16));
    fs.writeFileSync(path.join(root, account.did, "privateKey.pem.enc"), "opaque-synthetic-private-key");
    const publicKeyTarget = path.join(root, "outside-public-key.pem");
    fs.writeFileSync(publicKeyTarget, account.publicKey);
    fs.symlinkSync(publicKeyTarget, path.join(root, account.did, "publicKey.pem"));
    result = await verify();
    assert.ok(result.failureCodes.includes("credential_public_key_invalid"));

    account.did = "../outside";
    result = await verify();
    assert.ok(result.failureCodes.includes("invalid_account_identity"));

    account.did = reservation.did;
    account.metadata.pendingRegistrationFinalizationVersion = 2;
    account.metadata.onboardingFlow = "other-flow";
    result = await verify();
    assert.ok(result.failureCodes.includes("finalization_version_mismatch"));
    assert.ok(result.failureCodes.includes("onboarding_flow_mismatch"));
});

test("changed current handle remains valid when persistent ownership metadata matches", async () => {
    account.handle = "changed-handle";
    pendingRegistration.requestedHandle = "original-handle";
    const result = await verifyCompletedAccountIntegrity(fakeDb(documents) as any, {
        handle: "changed-handle",
        usersDirectory: root,
    });
    assert.equal(result.result, "PASS");
});

test("active locks and abnormal completed-record state fail", async () => {
    documents.pendingRegistrationProvisioningLocks.push({
        _id: "lock",
        pendingRegistrationId: pendingRegistration._id.toHexString(),
        expiresAt: new Date(Date.now() + 60_000),
    });
    documents.pendingRegistrationFinalizationLocks.push({
        _id: account._id.toHexString(),
        expiresAt: new Date(Date.now() + 60_000),
    });
    pendingRegistration.status = "provisioning";
    pendingRegistration.provisioningClaimHash = "active-claim";
    pendingRegistration.reconciliationRequiredAt = new Date();
    const result = await verify();
    assert.ok(result.failureCodes.includes("pending_record_status_mismatch"));
    assert.ok(result.failureCodes.includes("pending_record_identity_mismatch"));
    assert.ok(result.failureCodes.includes("active_provisioning_lock"));
    assert.ok(result.failureCodes.includes("active_finalization_lock"));
    assert.ok(result.failureCodes.includes("pending_record_claim_present"));
    assert.ok(result.failureCodes.includes("pending_record_reconciliation_required"));
});

test("locks with missing or invalid expiry fail closed", async () => {
    documents.pendingRegistrationProvisioningLocks.push({
        _id: "malformed-lock",
        pendingRegistrationId: pendingRegistration._id.toHexString(),
    });
    documents.pendingRegistrationFinalizationLocks.push({ _id: account._id.toHexString() });
    const result = await verify();
    assert.ok(result.failureCodes.includes("active_provisioning_lock"));
    assert.ok(result.failureCodes.includes("active_finalization_lock"));
});
