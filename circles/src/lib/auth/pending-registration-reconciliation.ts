import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ObjectId, type Db, type Filter } from "mongodb";
import type { PendingRegistration } from "@/lib/auth/pending-registration";
import { normalizeEmailForComparison } from "@/lib/auth/email-normalization";

const EXPECTED_FILES = {
    salt: "salt.bin",
    iv: "iv.bin",
    publicKey: "publicKey.pem",
    encryptedPrivateKey: "privateKey.pem.enc",
} as const;

export type ReconciliationClassification =
    | "recoverable_finalize"
    | "manual_review_orphan_credentials"
    | "manual_review_missing_credentials"
    | "manual_review_invalid_public_key"
    | "manual_review_account_mismatch"
    | "manual_review_duplicate_accounts"
    | "manual_review_claim_without_did";

export type PendingRegistrationReconciliation = {
    pendingRegistrationId: string;
    status: PendingRegistration["status"];
    reservedDid: string | null;
    reconciliationRequiredAt: Date | null;
    credentialDirectoryExists: boolean;
    credentialFiles: Record<keyof typeof EXPECTED_FILES, boolean>;
    publicKeyMatchesDid: boolean | null;
    correlatedAccountCount: number;
    accountWithReservedDidCount: number;
    correlatedAccountId: string | null;
    correlatedAccountDid: string | null;
    didReservationMatches: boolean;
    canonicalHandleMatches: boolean;
    normalizedEmailMatches: boolean;
    accountPublicKeyMatchesDid: boolean;
    permanentAccountIdentityMatches: boolean;
    selfMembershipExists: boolean | null;
    selfChatMembershipExists: boolean | null;
    membershipCountMatches: boolean | null;
    profileInitialized: boolean | null;
    welcomeConversationExists: boolean | null;
    welcomeMessageExists: boolean | null;
    classification: ReconciliationClassification;
    safeNextAction: string;
};

type InspectOptions = { pendingRegistrationId?: string; usersDirectory: string };

export type CompletedAccountVerificationFailureCode =
    | "account_not_found"
    | "duplicate_account"
    | "invalid_account_identity"
    | "invalid_pending_registration_reference"
    | "did_account_missing"
    | "did_account_mismatch"
    | "duplicate_did_account"
    | "pending_correlation_missing"
    | "pending_correlation_mismatch"
    | "duplicate_pending_correlation"
    | "reservation_missing"
    | "reservation_identity_mismatch"
    | "duplicate_reservation"
    | "credential_directory_invalid"
    | "credential_salt_invalid"
    | "credential_iv_invalid"
    | "credential_public_key_invalid"
    | "credential_encrypted_private_key_invalid"
    | "mongo_public_key_mismatch"
    | "credential_public_key_mismatch"
    | "finalization_version_mismatch"
    | "onboarding_flow_mismatch"
    | "pending_record_status_mismatch"
    | "pending_record_identity_mismatch"
    | "pending_record_claim_present"
    | "pending_record_reconciliation_required"
    | "active_provisioning_lock"
    | "active_finalization_lock";

export type CompletedAccountVerification = {
    result: "PASS" | "FAIL";
    pendingRecordRetained: boolean;
    checks: {
        uniqueAccountByHandle: boolean;
        uniqueAccountByDid: boolean;
        uniqueAccountByPendingRegistration: boolean;
        accountIdentityConsistent: boolean;
        oneReservationById: boolean;
        oneReservationByDid: boolean;
        reservationMatchesAccount: boolean;
        credentialDirectoryValid: boolean;
        credentialSaltPresent: boolean;
        credentialIvPresent: boolean;
        credentialPublicKeyPresent: boolean;
        credentialEncryptedPrivateKeyPresent: boolean;
        mongoPublicKeyMatchesDid: boolean;
        credentialPublicKeyMatchesDid: boolean;
        finalizationVersionValid: boolean;
        onboardingFlowValid: boolean;
        pendingRecordStatusProvisioned: boolean | null;
        pendingRecordIdentityMatches: boolean | null;
        pendingRecordHasNoClaim: boolean | null;
        noReconciliationRequired: boolean | null;
        noActiveProvisioningLock: boolean;
        noActiveFinalizationLock: boolean;
    };
    failureCodes: CompletedAccountVerificationFailureCode[];
};

type CredentialEvidence = {
    directoryExists: boolean;
    files: Record<keyof typeof EXPECTED_FILES, boolean>;
    publicKeyMatchesDid: boolean | null;
};

function inspectCredentialEvidence(usersDirectory: string, did: string): CredentialEvidence {
    const safeDid = /^[a-f0-9]{64}$/.test(did);
    const credentialPath = safeDid ? path.resolve(usersDirectory, did) : "";
    const usersRoot = path.resolve(usersDirectory);
    const withinUsersRoot = credentialPath.startsWith(`${usersRoot}${path.sep}`);
    const directoryExists = withinUsersRoot && isDirectoryWithoutFollowingSymlinks(credentialPath);
    const files = Object.fromEntries(
        Object.entries(EXPECTED_FILES).map(([key, filename]) => [
            key,
            directoryExists && isRegularFileWithoutFollowingSymlinks(path.join(credentialPath, filename)),
        ]),
    ) as CredentialEvidence["files"];
    let publicKeyMatchesDid: boolean | null = null;
    if (files.publicKey) {
        const publicKey = readRegularFileWithoutFollowingSymlinks(
            path.join(credentialPath, EXPECTED_FILES.publicKey),
            64 * 1024,
        );
        publicKeyMatchesDid = publicKey !== null && crypto.createHash("sha256").update(publicKey).digest("hex") === did;
    }
    return { directoryExists, files, publicKeyMatchesDid };
}

export async function inspectPendingRegistrationReconciliation(
    db: Db,
    options: InspectOptions,
): Promise<PendingRegistrationReconciliation[]> {
    const registrations = db.collection<PendingRegistration>("pendingRegistrations");
    const filter: Filter<PendingRegistration> = {
        status: { $ne: "provisioned" },
    };
    if (options.pendingRegistrationId) {
        if (!ObjectId.isValid(options.pendingRegistrationId)) throw new Error("Invalid pending registration id");
        filter._id = new ObjectId(options.pendingRegistrationId);
    }
    const records = await registrations.find(filter).sort({ reconciliationRequiredAt: 1, createdAt: 1 }).toArray();
    const reservations = await db
        .collection<PendingRegistrationDidReservationLike>("pendingRegistrationDidReservations")
        .find()
        .toArray();
    const reservationsByOwner = new Map(reservations.map((reservation) => [reservation._id, reservation.did]));
    const results: PendingRegistrationReconciliation[] = [];
    for (const record of records) {
        const reservedDid = record.reservedDid || reservationsByOwner.get(record._id.toHexString());
        if (!reservedDid) {
            if (record.status === "provisioning_claimed") {
                results.push(await inspectClaimWithoutDid(db, record));
            }
            continue;
        }
        results.push(await inspectRecord(db, options.usersDirectory, { ...record, reservedDid }));
    }
    return results;
}

type PendingRegistrationDidReservationLike = { _id: string; did: string; createdAt: Date };

async function inspectClaimWithoutDid(db: Db, record: PendingRegistration): Promise<PendingRegistrationReconciliation> {
    const pendingRegistrationId = record._id.toHexString();
    const correlated = await db
        .collection("circles")
        .find({ "metadata.pendingRegistrationId": pendingRegistrationId }, { projection: { _id: 1, did: 1 } })
        .toArray();
    return {
        pendingRegistrationId,
        status: record.status,
        reservedDid: null,
        reconciliationRequiredAt: record.reconciliationRequiredAt,
        credentialDirectoryExists: false,
        credentialFiles: { salt: false, iv: false, publicKey: false, encryptedPrivateKey: false },
        publicKeyMatchesDid: null,
        correlatedAccountCount: correlated.length,
        accountWithReservedDidCount: 0,
        correlatedAccountId: correlated.length === 1 ? (correlated[0]._id?.toString() ?? null) : null,
        correlatedAccountDid:
            correlated.length === 1 && typeof correlated[0].did === "string" ? correlated[0].did : null,
        didReservationMatches: false,
        canonicalHandleMatches: false,
        normalizedEmailMatches: false,
        accountPublicKeyMatchesDid: false,
        permanentAccountIdentityMatches: false,
        selfMembershipExists: null,
        selfChatMembershipExists: null,
        membershipCountMatches: null,
        profileInitialized: null,
        welcomeConversationExists: null,
        welcomeMessageExists: null,
        classification: "manual_review_claim_without_did",
        safeNextAction:
            "Preserve the non-expiring claim. Confirm every worker from the claiming attempt is stopped before any separately authorized recovery; age alone is not proof that ownership can be transferred.",
    };
}

async function inspectRecord(
    db: Db,
    usersDirectory: string,
    record: PendingRegistration,
): Promise<PendingRegistrationReconciliation> {
    const pendingRegistrationId = record._id.toHexString();
    const reservedDid = record.reservedDid!;
    const credentialEvidence = inspectCredentialEvidence(usersDirectory, reservedDid);
    const credentialDirectoryExists = credentialEvidence.directoryExists;
    const credentialFiles = credentialEvidence.files;
    const publicKeyMatchesDid = credentialEvidence.publicKeyMatchesDid;

    const circles = db.collection("circles");
    const correlated = await circles
        .find(
            { "metadata.pendingRegistrationId": pendingRegistrationId },
            { projection: { _id: 1, did: 1, email: 1, handle: 1, publicKey: 1, metadata: 1, isHuman: 1 } },
        )
        .toArray();
    const didAccounts = await circles.find({ did: reservedDid }, { projection: { _id: 1 } }).toArray();
    const account = correlated.length === 1 ? correlated[0] : null;
    const accountId = account?._id?.toString() ?? null;
    const accountDid = typeof account?.did === "string" ? account.did : null;
    const didReservation = await db
        .collection<{ _id: string; did: string }>("pendingRegistrationDidReservations")
        .findOne({ _id: pendingRegistrationId });
    const didReservationMatches = didReservation?.did === reservedDid;
    const canonicalHandleMatches = Boolean(account && account.handle === record.requestedHandle);
    const normalizedEmailMatches = Boolean(
        account && normalizeEmailForComparison(String(account.email || "")) === record.normalizedEmail,
    );
    const accountPublicKeyMatchesDid = Boolean(
        account &&
            typeof account.publicKey === "string" &&
            crypto.createHash("sha256").update(account.publicKey).digest("hex") === reservedDid,
    );
    const permanentAccountIdentityMatches = Boolean(
        account &&
            accountId &&
            accountDid === reservedDid &&
            didAccounts.length === 1 &&
            didAccounts[0]._id?.toString() === accountId &&
            (!record.accountId || record.accountId === accountId) &&
            (!record.accountDid || record.accountDid === accountDid) &&
            account.metadata?.pendingRegistrationId === pendingRegistrationId,
    );
    const selfMembershipExists = accountId
        ? Boolean(
              await db
                  .collection("members")
                  .findOne({ userDid: reservedDid, circleId: accountId }, { projection: { _id: 1 } }),
          )
        : null;
    const membersChat = accountId
        ? await db.collection("chatRooms").findOne({ circleId: accountId, handle: "members" })
        : null;
    const selfChatMembershipExists = accountId
        ? !membersChat ||
          Boolean(
              await db.collection("chatRoomMembers").findOne({
                  userDid: reservedDid,
                  chatRoomId: String(membersChat._id),
              }),
          )
        : null;
    const circle = accountId ? await circles.findOne({ _id: account?._id }) : null;
    const membershipCountMatches = accountId
        ? Boolean(circle && circle.members === (await db.collection("members").countDocuments({ circleId: accountId })))
        : null;
    const profileInitialized = account
        ? account.isHuman === true &&
          account.metadata?.onboardingFlow === "pending-registration-v1" &&
          account.metadata?.pendingRegistrationFinalizationVersion === 1
        : null;
    const welcomeHandle = `welcome-${reservedDid}`;
    const welcomeConversation = accountId
        ? await db.collection("chatConversations").findOne({ handle: welcomeHandle, participants: reservedDid })
        : null;
    const welcomeConversationExists = Boolean(welcomeConversation);
    const welcomeMessageExists = welcomeConversation
        ? Boolean(
              await db.collection("chatMessageDocs").findOne({
                  conversationId: String(welcomeConversation._id),
                  source: "system_welcome",
              }),
          )
        : false;
    const completeCredentials = Object.values(credentialFiles).every(Boolean);

    let classification: ReconciliationClassification;
    let safeNextAction: string;
    if (correlated.length > 1 || didAccounts.length > 1) {
        classification = "manual_review_duplicate_accounts";
        safeNextAction = "Stop and escalate; do not modify accounts or credential files.";
    } else if (account || didAccounts.length > 0) {
        if (
            !account ||
            !didReservationMatches ||
            !canonicalHandleMatches ||
            !normalizedEmailMatches ||
            !accountPublicKeyMatchesDid ||
            !permanentAccountIdentityMatches
        ) {
            classification = "manual_review_account_mismatch";
            safeNextAction = "Stop and verify DID reservation ownership, account ID, DID, handle and normalized email.";
        } else if (publicKeyMatchesDid === false) {
            classification = "manual_review_invalid_public_key";
            safeNextAction = "Preserve the directory and escalate the public-key/DID mismatch.";
        } else if (completeCredentials && publicKeyMatchesDid === true) {
            classification = "recoverable_finalize";
            safeNextAction =
                "Identity evidence matches; the member may authenticate normally to finish idempotent finalization.";
        } else {
            classification = "manual_review_missing_credentials";
            safeNextAction = "Preserve all records and credential files; verify missing identity evidence manually.";
        }
    } else if (publicKeyMatchesDid === false) {
        classification = "manual_review_invalid_public_key";
        safeNextAction = "Preserve the directory and escalate the public-key/DID mismatch.";
    } else if (!account && credentialDirectoryExists) {
        classification = "manual_review_orphan_credentials";
        safeNextAction = "Preserve key material and use a reviewed account-import procedure; never retry a new DID.";
    } else {
        classification = "manual_review_missing_credentials";
        safeNextAction = "Confirm no account or files exist before any explicit identity-abandonment decision.";
    }

    return {
        pendingRegistrationId,
        status: record.status,
        reservedDid,
        reconciliationRequiredAt: record.reconciliationRequiredAt,
        credentialDirectoryExists,
        credentialFiles,
        publicKeyMatchesDid,
        correlatedAccountCount: correlated.length,
        accountWithReservedDidCount: didAccounts.length,
        correlatedAccountId: accountId,
        correlatedAccountDid: accountDid,
        didReservationMatches,
        canonicalHandleMatches,
        normalizedEmailMatches,
        accountPublicKeyMatchesDid,
        permanentAccountIdentityMatches,
        selfMembershipExists,
        selfChatMembershipExists,
        membershipCountMatches,
        profileInitialized,
        welcomeConversationExists,
        welcomeMessageExists,
        classification,
        safeNextAction,
    };
}

export async function verifyCompletedAccountIntegrity(
    db: Db,
    options: { handle: string; usersDirectory: string },
): Promise<CompletedAccountVerification> {
    const emptyChecks: CompletedAccountVerification["checks"] = {
        uniqueAccountByHandle: false,
        uniqueAccountByDid: false,
        uniqueAccountByPendingRegistration: false,
        accountIdentityConsistent: false,
        oneReservationById: false,
        oneReservationByDid: false,
        reservationMatchesAccount: false,
        credentialDirectoryValid: false,
        credentialSaltPresent: false,
        credentialIvPresent: false,
        credentialPublicKeyPresent: false,
        credentialEncryptedPrivateKeyPresent: false,
        mongoPublicKeyMatchesDid: false,
        credentialPublicKeyMatchesDid: false,
        finalizationVersionValid: false,
        onboardingFlowValid: false,
        pendingRecordStatusProvisioned: null,
        pendingRecordIdentityMatches: null,
        pendingRecordHasNoClaim: null,
        noReconciliationRequired: null,
        noActiveProvisioningLock: false,
        noActiveFinalizationLock: false,
    };
    const failureCodes = new Set<CompletedAccountVerificationFailureCode>();
    const fail = (code: CompletedAccountVerificationFailureCode) => {
        failureCodes.add(code);
    };
    const finish = (
        checks: CompletedAccountVerification["checks"],
        pendingRecordRetained: boolean,
    ): CompletedAccountVerification => {
        const orderedCodes = [...failureCodes].sort();
        return {
            result: orderedCodes.length === 0 ? "PASS" : "FAIL",
            pendingRecordRetained,
            checks,
            failureCodes: orderedCodes,
        };
    };

    const accountProjection = {
        _id: 1,
        did: 1,
        publicKey: 1,
        metadata: 1,
    } as const;
    const handleAccounts = await db
        .collection("circles")
        .find({ circleType: "user", handle: options.handle }, { projection: accountProjection })
        .limit(2)
        .toArray();
    emptyChecks.uniqueAccountByHandle = handleAccounts.length === 1;
    if (handleAccounts.length === 0) {
        fail("account_not_found");
        return finish(emptyChecks, false);
    }
    if (handleAccounts.length > 1) {
        fail("duplicate_account");
        return finish(emptyChecks, false);
    }

    const account = handleAccounts[0];
    const accountId = account._id?.toString() ?? "";
    const did = typeof account.did === "string" ? account.did : "";
    const pendingRegistrationId =
        typeof account.metadata?.pendingRegistrationId === "string" ? account.metadata.pendingRegistrationId : "";
    if (!accountId || !/^[a-f0-9]{64}$/.test(did)) fail("invalid_account_identity");
    if (!ObjectId.isValid(pendingRegistrationId)) fail("invalid_pending_registration_reference");
    if (failureCodes.size > 0) return finish(emptyChecks, false);

    const [didAccounts, pendingAccounts, reservationById, reservationByIdCount, reservationByDidCount] =
        await Promise.all([
            db
                .collection("circles")
                .find({ did }, { projection: { _id: 1 } })
                .limit(2)
                .toArray(),
            db
                .collection("circles")
                .find({ "metadata.pendingRegistrationId": pendingRegistrationId }, { projection: { _id: 1 } })
                .limit(2)
                .toArray(),
            db
                .collection<{ _id: string; did: string }>("pendingRegistrationDidReservations")
                .findOne({ _id: pendingRegistrationId }),
            db.collection("pendingRegistrationDidReservations").countDocuments({ _id: pendingRegistrationId }),
            db.collection("pendingRegistrationDidReservations").countDocuments({ did }),
        ]);
    const checks: CompletedAccountVerification["checks"] = {
        ...emptyChecks,
        uniqueAccountByHandle: true,
        uniqueAccountByDid: didAccounts.length === 1 && didAccounts[0]?._id?.toString() === accountId,
        uniqueAccountByPendingRegistration:
            pendingAccounts.length === 1 && pendingAccounts[0]?._id?.toString() === accountId,
        accountIdentityConsistent:
            didAccounts.length === 1 &&
            pendingAccounts.length === 1 &&
            didAccounts[0]?._id?.toString() === accountId &&
            pendingAccounts[0]?._id?.toString() === accountId,
        oneReservationById: reservationByIdCount === 1,
        oneReservationByDid: reservationByDidCount === 1,
        reservationMatchesAccount: reservationById?.did === did,
    };
    if (didAccounts.length === 0) fail("did_account_missing");
    else if (didAccounts.length > 1) fail("duplicate_did_account");
    else if (!checks.uniqueAccountByDid) fail("did_account_mismatch");
    if (pendingAccounts.length === 0) fail("pending_correlation_missing");
    else if (pendingAccounts.length > 1) fail("duplicate_pending_correlation");
    else if (!checks.uniqueAccountByPendingRegistration) fail("pending_correlation_mismatch");
    if (reservationByIdCount === 0 || reservationByDidCount === 0) fail("reservation_missing");
    else if (!checks.oneReservationById || !checks.oneReservationByDid) fail("duplicate_reservation");
    if (!checks.reservationMatchesAccount || !checks.accountIdentityConsistent) {
        fail("reservation_identity_mismatch");
    }

    const credentialEvidence = inspectCredentialEvidence(options.usersDirectory, did);
    checks.credentialDirectoryValid = credentialEvidence.directoryExists;
    checks.credentialSaltPresent = credentialEvidence.files.salt;
    checks.credentialIvPresent = credentialEvidence.files.iv;
    checks.credentialPublicKeyPresent = credentialEvidence.files.publicKey;
    checks.credentialEncryptedPrivateKeyPresent = credentialEvidence.files.encryptedPrivateKey;
    checks.credentialPublicKeyMatchesDid = credentialEvidence.publicKeyMatchesDid === true;
    if (!checks.credentialDirectoryValid) fail("credential_directory_invalid");
    if (!checks.credentialSaltPresent) fail("credential_salt_invalid");
    if (!checks.credentialIvPresent) fail("credential_iv_invalid");
    if (!checks.credentialPublicKeyPresent) fail("credential_public_key_invalid");
    if (!checks.credentialEncryptedPrivateKeyPresent) fail("credential_encrypted_private_key_invalid");
    if (checks.credentialPublicKeyPresent && !checks.credentialPublicKeyMatchesDid) {
        fail("credential_public_key_mismatch");
    }

    checks.mongoPublicKeyMatchesDid =
        typeof account.publicKey === "string" &&
        crypto.createHash("sha256").update(account.publicKey).digest("hex") === did;
    if (!checks.mongoPublicKeyMatchesDid) fail("mongo_public_key_mismatch");

    checks.finalizationVersionValid = account.metadata?.pendingRegistrationFinalizationVersion === 1;
    checks.onboardingFlowValid = account.metadata?.onboardingFlow === "pending-registration-v1";
    if (!checks.finalizationVersionValid) fail("finalization_version_mismatch");
    if (!checks.onboardingFlowValid) fail("onboarding_flow_mismatch");

    const now = new Date();
    const [record, provisioningLocks, finalizationLocks] = await Promise.all([
        db
            .collection<PendingRegistration>("pendingRegistrations")
            .findOne({ _id: new ObjectId(pendingRegistrationId) }),
        db
            .collection<{ pendingRegistrationId?: string; expiresAt?: Date }>("pendingRegistrationProvisioningLocks")
            .find({ pendingRegistrationId }, { projection: { expiresAt: 1 } })
            .toArray(),
        db
            .collection<{ _id: string; expiresAt: Date }>("pendingRegistrationFinalizationLocks")
            .find({ _id: accountId }, { projection: { expiresAt: 1 } })
            .toArray(),
    ]);
    checks.noActiveProvisioningLock = provisioningLocks.every(
        (lock) => lock.expiresAt instanceof Date && lock.expiresAt <= now,
    );
    checks.noActiveFinalizationLock = finalizationLocks.every(
        (lock) => lock.expiresAt instanceof Date && lock.expiresAt <= now,
    );
    if (!checks.noActiveProvisioningLock) fail("active_provisioning_lock");
    if (!checks.noActiveFinalizationLock) fail("active_finalization_lock");

    if (record) {
        checks.pendingRecordStatusProvisioned = record.status === "provisioned";
        checks.pendingRecordIdentityMatches =
            record.status === "provisioned" &&
            record.accountId === accountId &&
            record.accountDid === did &&
            record.reservedDid === did;
        checks.pendingRecordHasNoClaim =
            !record.provisioningClaimHash && !record.provisioningLeaseHash && !record.provisioningLeaseExpiresAt;
        checks.noReconciliationRequired =
            record.reconciliationRequiredAt === null || record.reconciliationRequiredAt === undefined;
        if (!checks.pendingRecordStatusProvisioned) fail("pending_record_status_mismatch");
        if (!checks.pendingRecordIdentityMatches) fail("pending_record_identity_mismatch");
        if (!checks.pendingRecordHasNoClaim) fail("pending_record_claim_present");
        if (!checks.noReconciliationRequired) fail("pending_record_reconciliation_required");
    }

    return finish(checks, Boolean(record));
}

function isDirectoryWithoutFollowingSymlinks(value: string): boolean {
    try {
        const stat = fs.lstatSync(value);
        return stat.isDirectory() && !stat.isSymbolicLink();
    } catch {
        return false;
    }
}

function readRegularFileWithoutFollowingSymlinks(value: string, maximumBytes: number): string | null {
    let descriptor: number | null = null;
    try {
        descriptor = fs.openSync(value, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.size > maximumBytes) return null;
        return fs.readFileSync(descriptor, "utf8");
    } catch {
        return null;
    } finally {
        if (descriptor !== null) {
            try {
                fs.closeSync(descriptor);
            } catch {
                // Best-effort descriptor cleanup after a read-only diagnostic.
            }
        }
    }
}

function isRegularFileWithoutFollowingSymlinks(value: string): boolean {
    try {
        const stat = fs.lstatSync(value);
        return stat.isFile() && !stat.isSymbolicLink();
    } catch {
        return false;
    }
}
