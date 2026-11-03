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
    classification: ReconciliationClassification;
    safeNextAction: string;
};

type InspectOptions = { pendingRegistrationId?: string; usersDirectory: string };

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
    const safeDid = /^[a-f0-9]{64}$/.test(reservedDid);
    const credentialPath = safeDid ? path.resolve(usersDirectory, reservedDid) : "";
    const usersRoot = path.resolve(usersDirectory);
    const withinUsersRoot = credentialPath.startsWith(`${usersRoot}${path.sep}`);
    const credentialDirectoryExists = withinUsersRoot && isDirectoryWithoutFollowingSymlinks(credentialPath);
    const credentialFiles = Object.fromEntries(
        Object.entries(EXPECTED_FILES).map(([key, filename]) => [
            key,
            credentialDirectoryExists && isRegularFileWithoutFollowingSymlinks(path.join(credentialPath, filename)),
        ]),
    ) as PendingRegistrationReconciliation["credentialFiles"];
    let publicKeyMatchesDid: boolean | null = null;
    if (credentialFiles.publicKey) {
        try {
            const publicKey = fs.readFileSync(path.join(credentialPath, EXPECTED_FILES.publicKey), "utf8");
            publicKeyMatchesDid = crypto.createHash("sha256").update(publicKey).digest("hex") === reservedDid;
        } catch {
            publicKeyMatchesDid = false;
        }
    }

    const circles = db.collection("circles");
    const correlated = await circles
        .find(
            { "metadata.pendingRegistrationId": pendingRegistrationId },
            { projection: { _id: 1, did: 1, email: 1, handle: 1, publicKey: 1, metadata: 1 } },
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
            safeNextAction = "Identity evidence matches; member-authorized finalization recovery is not enabled yet.";
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
        classification,
        safeNextAction,
    };
}

function isDirectoryWithoutFollowingSymlinks(value: string): boolean {
    try {
        const stat = fs.lstatSync(value);
        return stat.isDirectory() && !stat.isSymbolicLink();
    } catch {
        return false;
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
