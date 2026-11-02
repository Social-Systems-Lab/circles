import crypto from "crypto";
import fs from "fs";
import path from "path";
import { ObjectId, type Db, type Filter } from "mongodb";
import type { PendingRegistration } from "@/lib/auth/pending-registration";

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
    | "manual_review_duplicate_accounts";

export type PendingRegistrationReconciliation = {
    pendingRegistrationId: string;
    status: PendingRegistration["status"];
    reservedDid: string;
    reconciliationRequiredAt: Date | null;
    credentialDirectoryExists: boolean;
    credentialFiles: Record<keyof typeof EXPECTED_FILES, boolean>;
    publicKeyMatchesDid: boolean | null;
    correlatedAccountCount: number;
    accountWithReservedDidCount: number;
    correlatedAccountId: string | null;
    correlatedAccountDid: string | null;
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
        reservedDid: { $type: "string" },
        status: { $ne: "provisioned" },
    };
    if (options.pendingRegistrationId) {
        if (!ObjectId.isValid(options.pendingRegistrationId)) throw new Error("Invalid pending registration id");
        filter._id = new ObjectId(options.pendingRegistrationId);
    }
    const records = await registrations.find(filter).sort({ reconciliationRequiredAt: 1, createdAt: 1 }).toArray();
    const results: PendingRegistrationReconciliation[] = [];
    for (const record of records) results.push(await inspectRecord(db, options.usersDirectory, record));
    return results;
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
        .find({ "metadata.pendingRegistrationId": pendingRegistrationId }, { projection: { _id: 1, did: 1 } })
        .toArray();
    const didAccounts = await circles.find({ did: reservedDid }, { projection: { _id: 1 } }).toArray();
    const account = correlated.length === 1 ? correlated[0] : null;
    const accountId = account?._id?.toString() ?? null;
    const accountDid = typeof account?.did === "string" ? account.did : null;
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
    } else if (account && accountDid !== reservedDid) {
        classification = "manual_review_account_mismatch";
        safeNextAction = "Stop and escalate the DID correlation mismatch.";
    } else if (publicKeyMatchesDid === false) {
        classification = "manual_review_invalid_public_key";
        safeNextAction = "Preserve the directory and escalate the public-key/DID mismatch.";
    } else if (account && completeCredentials && publicKeyMatchesDid === true) {
        classification = "recoverable_finalize";
        safeNextAction = "Use the authenticated provisioning retry to repair finalization and self-membership.";
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
