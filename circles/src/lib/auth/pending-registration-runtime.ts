import crypto from "crypto";
import { ObjectId, type Collection } from "mongodb";
import { Circles, getDb } from "@/lib/data/db";
import { createUserAccount } from "@/lib/auth/auth";
import { createUserSession } from "@/lib/auth/auth";
import { normalizeEmailForComparison } from "@/lib/auth/email-normalization";
import { sendEmail } from "@/lib/data/email";
import { getUserPrivate } from "@/lib/data/user";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { getResolvedWelcomeTemplate } from "@/lib/data/system-message-templates";
import { ensureProvisionedPersonalMembership } from "@/lib/data/member";
import { assertRegistrationMode } from "@/lib/auth/registration-routing";
import {
    PENDING_PROVISIONED_RETENTION_MS,
    acquirePendingRegistrationProvisioningClaim,
    acquirePendingRegistrationOwnedLock,
    getPendingRegistrationCollections,
    hashPendingRegistrationSecret,
    isPendingRegistrationProvisioningClaimOwner,
    reservePendingRegistrationDid,
    renewPendingRegistrationOwnedLock,
    releasePendingRegistrationOwnedLock,
    type PendingRegistrationDependencies,
    type PendingRegistration,
    type ProvisionedPendingAccount,
} from "@/lib/auth/pending-registration";

type ProvisioningLock = { _id: string; pendingRegistrationId: string; ownerTokenHash: string; expiresAt: Date };
type FinalizationLock = { _id: string; ownerTokenHash: string; expiresAt: Date };

async function findExactPendingAccount(
    pendingRegistrationId: string,
    record: PendingRegistration,
    accountId: string,
    did: string,
    didReservations: Collection<{ _id: string; did: string; createdAt: Date }>,
) {
    if (!record.reservedDid || did !== record.reservedDid) return null;
    const reservation = await didReservations.findOne({ _id: pendingRegistrationId });
    if (reservation?.did !== did) return null;
    const correlated = await Circles.find({ "metadata.pendingRegistrationId": pendingRegistrationId })
        .project({ _id: 1, did: 1, email: 1, handle: 1, publicKey: 1, metadata: 1 })
        .limit(2)
        .toArray();
    const byDid = await Circles.find({ did }).project({ _id: 1 }).limit(2).toArray();
    const account = correlated.length === 1 ? correlated[0] : null;
    if (
        !account ||
        account._id.toString() !== accountId ||
        account.did !== did ||
        byDid.length !== 1 ||
        byDid[0]._id.toString() !== accountId ||
        account.metadata?.pendingRegistrationId !== pendingRegistrationId ||
        account.handle !== record.requestedHandle ||
        normalizeEmailForComparison(String(account.email || "")) !== record.normalizedEmail ||
        typeof account.publicKey !== "string" ||
        crypto.createHash("sha256").update(account.publicKey).digest("hex") !== did ||
        (record.accountId && record.accountId !== accountId) ||
        (record.accountDid && record.accountDid !== did)
    ) {
        return null;
    }
    return account;
}

async function runPendingAccountFinalizationSideEffects(
    account: ProvisionedPendingAccount,
    pendingRegistrationId: string,
    ownerToken: string,
    assertClaim: () => Promise<boolean>,
    finalizationLocks: Collection<FinalizationLock>,
) {
    if (!(await acquirePendingRegistrationOwnedLock(finalizationLocks, account.accountId, ownerToken))) {
        throw new Error("Registration finalization is already in progress");
    }
    const checkpoint = async () => {
        const claimOwned = await assertClaim();
        const lockOwned = await renewPendingRegistrationOwnedLock(finalizationLocks, account.accountId, ownerToken);
        if (!claimOwned || !lockOwned) throw new Error("Registration finalization ownership was lost");
    };
    try {
        await checkpoint();
        const user = await Circles.findOne(
            {
                _id: new ObjectId(account.accountId),
                did: account.did,
                "metadata.pendingRegistrationId": pendingRegistrationId,
            },
            { projection: { _id: 1, did: 1 } },
        );
        if (!user || user._id.toString() !== account.accountId) {
            throw new Error("Finalization account identity changed");
        }
        await ensureProvisionedPersonalMembership(account.did, account.accountId);
        await checkpoint();
        const profileUpdate = await Circles.updateOne(
            {
                _id: new ObjectId(account.accountId),
                did: account.did,
                "metadata.pendingRegistrationId": pendingRegistrationId,
            },
            {
                $set: {
                    isHuman: true,
                    "metadata.onboardingFlow": "pending-registration-v1",
                    "metadata.pendingRegistrationFinalizationVersion": 1,
                },
            },
        );
        if (profileUpdate.matchedCount !== 1) throw new Error("Pending profile identity changed during finalization");
        const resolvedWelcome = await getResolvedWelcomeTemplate();
        await checkpoint();
        await ensureWelcomeMessageForNewUser(account.did, resolvedWelcome.config, resolvedWelcome.senderDid);
        await checkpoint();
    } finally {
        await releasePendingRegistrationOwnedLock(finalizationLocks, account.accountId, ownerToken);
    }
}

async function findPermanentAccount(normalizedEmail: string, requestedHandle: string) {
    const emailCandidates = normalizedEmail.endsWith("@gmail.com")
        ? await Circles.find({ email: { $regex: "@(gmail\\.com|googlemail\\.com)$", $options: "i" } })
              .project({ _id: 1, email: 1, handle: 1, did: 1 })
              .toArray()
        : await Circles.find({ email: normalizedEmail }, { collation: { locale: "en", strength: 2 } })
              .project({ _id: 1, email: 1, handle: 1, did: 1 })
              .toArray();
    const emailExists = emailCandidates.some(
        (candidate) => candidate.email && normalizeEmailForComparison(candidate.email) === normalizedEmail,
    );
    if (requestedHandle === "__email_only__") return emailExists;
    return emailExists || Boolean(await Circles.findOne({ handle: requestedHandle }, { projection: { _id: 1 } }));
}

async function acquireProvisioningLocks(
    collection: Collection<ProvisioningLock>,
    pendingRegistrationId: string,
    provisioningLeaseToken: string,
    normalizedEmail: string,
    requestedHandle: string,
) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    const ownerTokenHash = hashPendingRegistrationSecret("pending-provisioning-lock", provisioningLeaseToken);
    const ids = [
        crypto.createHash("sha256").update(`email:${normalizedEmail}`).digest("hex"),
        crypto.createHash("sha256").update(`handle:${requestedHandle}`).digest("hex"),
    ];
    const acquired: string[] = [];
    try {
        for (const _id of ids) {
            try {
                const result = await collection.findOneAndUpdate(
                    {
                        _id,
                        expiresAt: { $lte: now },
                    },
                    { $set: { pendingRegistrationId, ownerTokenHash, expiresAt } },
                    { upsert: true, returnDocument: "after" },
                );
                if (result?.ownerTokenHash !== ownerTokenHash) throw new Error("Provisioning lock ownership failed");
            } catch (error) {
                if ((error as { code?: number }).code === 11000) {
                    throw new Error("Registration provisioning is already in progress");
                }
                throw error;
            }
            acquired.push(_id);
        }
        return {
            renew: async () => {
                const renewedAt = new Date();
                const result = await collection.updateMany(
                    {
                        _id: { $in: acquired },
                        pendingRegistrationId,
                        ownerTokenHash,
                        expiresAt: { $gt: renewedAt },
                    },
                    { $set: { expiresAt: new Date(renewedAt.getTime() + 5 * 60 * 1000) } },
                );
                return result.matchedCount === acquired.length;
            },
            release: async () =>
                collection.deleteMany({ _id: { $in: acquired }, pendingRegistrationId, ownerTokenHash }),
        };
    } catch (error) {
        if (acquired.length) {
            await collection.deleteMany({ _id: { $in: acquired }, pendingRegistrationId, ownerTokenHash });
        }
        if ((error as { code?: number }).code === 11000) return null;
        throw error;
    }
}

export async function createPendingRegistrationRuntimeDependencies(): Promise<PendingRegistrationDependencies> {
    const db = await getDb();
    const collections = await getPendingRegistrationCollections(db);
    const locks = db.collection<ProvisioningLock>("pendingRegistrationProvisioningLocks");
    const finalizationLocks = db.collection<FinalizationLock>("pendingRegistrationFinalizationLocks");
    await locks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await finalizationLocks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await Circles.createIndex(
        { "metadata.pendingRegistrationId": 1 },
        { unique: true, partialFilterExpression: { "metadata.pendingRegistrationId": { $type: "string" } } },
    );

    return {
        collections,
        baseUrl: process.env.CIRCLES_URL || "http://localhost:3000",
        sendVerificationEmail: async ({ to, name, verificationUrl }) => {
            await sendEmail({
                to,
                templateAlias: "email-verification",
                templateModel: { name, actionUrl: verificationUrl },
            });
        },
        permanentAccountExists: findPermanentAccount,
        findAccountByPendingRegistrationId: async (pendingRegistrationId) => {
            const account = await Circles.findOne(
                { "metadata.pendingRegistrationId": pendingRegistrationId },
                { projection: { _id: 1, did: 1 } },
            );
            return account?._id && account.did ? { accountId: account._id.toString(), did: account.did } : null;
        },
        validateProvisionedAccount: async (pendingRegistrationId, account) => {
            if (!ObjectId.isValid(pendingRegistrationId)) return false;
            const record = await collections.registrations.findOne({
                _id: new ObjectId(pendingRegistrationId),
                status: "provisioning_claimed",
            });
            if (!record) return false;
            return Boolean(
                await findExactPendingAccount(
                    pendingRegistrationId,
                    record,
                    account.accountId,
                    account.did,
                    collections.didReservations,
                ),
            );
        },
        finalizeAccount: async ({ accountId, did }, { pendingRegistrationId, provisioningClaimToken }) => {
            const finalizationOwnerToken = crypto.randomBytes(32).toString("base64url");
            const assertClaim = () =>
                isPendingRegistrationProvisioningClaimOwner(pendingRegistrationId, provisioningClaimToken, {
                    collections,
                });
            await runPendingAccountFinalizationSideEffects(
                { accountId, did },
                pendingRegistrationId,
                finalizationOwnerToken,
                assertClaim,
                finalizationLocks,
            );
        },
        issueSession: async (pendingRegistrationId, account) => {
            if (!ObjectId.isValid(pendingRegistrationId)) throw new Error("Invalid finalized registration id");
            const finalized = await collections.registrations.findOne({
                _id: new ObjectId(pendingRegistrationId),
                status: "provisioned",
                accountId: account.accountId,
                accountDid: account.did,
            });
            if (!finalized) throw new Error("Registration must be durably finalized before session issuance");
            const finalizationMarker = await Circles.findOne(
                {
                    _id: new ObjectId(account.accountId),
                    did: account.did,
                    "metadata.pendingRegistrationId": pendingRegistrationId,
                    "metadata.pendingRegistrationFinalizationVersion": 1,
                },
                { projection: { _id: 1 } },
            );
            if (!finalizationMarker) throw new Error("Required account finalization effects are incomplete");
            const user = await getUserPrivate(account.did);
            if (user._id?.toString() !== account.accountId) throw new Error("Session account identity changed");
            await createUserSession(user, account.did);
        },
        provisionAccount: async ({
            pendingRegistrationId,
            provisioningLeaseToken,
            provisioningClaimToken,
            reservedDid,
            name,
            email,
            requestedHandle,
            password,
        }) => {
            await assertRegistrationMode("pending");
            const normalizedEmail = normalizeEmailForComparison(email);
            const release = await acquireProvisioningLocks(
                locks,
                pendingRegistrationId,
                provisioningLeaseToken,
                normalizedEmail,
                requestedHandle,
            );
            if (!release) throw new Error("Registration provisioning is already in progress");
            try {
                const recovered = await Circles.findOne(
                    { "metadata.pendingRegistrationId": pendingRegistrationId },
                    { projection: { _id: 1, did: 1, email: 1, handle: 1, publicKey: 1 } },
                );
                if (recovered) {
                    const reservation = await collections.didReservations.findOne({ _id: pendingRegistrationId });
                    const pendingRecord = await collections.registrations.findOne(
                        { _id: new ObjectId(pendingRegistrationId) },
                        { projection: { accountId: 1, accountDid: 1 } },
                    );
                    const byDid =
                        typeof recovered.did === "string"
                            ? await Circles.find({ did: recovered.did }, { projection: { _id: 1 } })
                                  .limit(2)
                                  .toArray()
                            : [];
                    if (
                        !recovered._id ||
                        !recovered.did ||
                        !reservedDid ||
                        recovered.did !== reservedDid ||
                        reservation?.did !== reservedDid ||
                        typeof recovered.publicKey !== "string" ||
                        crypto.createHash("sha256").update(recovered.publicKey).digest("hex") !== reservedDid ||
                        byDid.length !== 1 ||
                        byDid[0]._id.toString() !== recovered._id.toString() ||
                        (pendingRecord?.accountId && pendingRecord.accountId !== recovered._id.toString()) ||
                        (pendingRecord?.accountDid && pendingRecord.accountDid !== recovered.did) ||
                        recovered.handle !== requestedHandle ||
                        normalizeEmailForComparison(recovered.email || "") !== normalizedEmail
                    ) {
                        throw new Error("Correlated account identity requires manual review");
                    }
                    if (
                        !(await acquirePendingRegistrationProvisioningClaim(
                            pendingRegistrationId,
                            provisioningLeaseToken,
                            provisioningClaimToken,
                            { collections },
                        ))
                    ) {
                        throw new Error("Durable provisioning claim could not be acquired");
                    }
                    return { accountId: recovered._id.toString(), did: recovered.did };
                }
                if (reservedDid) {
                    const reservation = await collections.didReservations.findOne({ _id: pendingRegistrationId });
                    if (reservation?.did !== reservedDid) {
                        throw new Error("Reserved identity ownership requires manual review");
                    }
                    throw new Error("Reserved identity has no proven permanent account; manual review is required");
                }
                if (await findPermanentAccount(normalizedEmail, requestedHandle)) {
                    throw new Error("Registration could not be completed");
                }
                const account = await createUserAccount(name, requestedHandle, "user", email, password, {
                    emailAlreadyVerified: true,
                    pendingRegistrationId,
                    sendVerificationEmail: false,
                    acquireProvisioningClaim: async () => {
                        if (!(await release.renew())) throw new Error("Provisioning lock ownership was lost");
                        if (
                            !(await acquirePendingRegistrationProvisioningClaim(
                                pendingRegistrationId,
                                provisioningLeaseToken,
                                provisioningClaimToken,
                                { collections },
                            ))
                        ) {
                            throw new Error("Durable provisioning claim could not be acquired");
                        }
                    },
                    assertProvisioningClaim: async () => {
                        if (!(await release.renew())) throw new Error("Provisioning lock ownership was lost");
                        if (
                            !(await isPendingRegistrationProvisioningClaimOwner(
                                pendingRegistrationId,
                                provisioningClaimToken,
                                { collections },
                            ))
                        ) {
                            throw new Error("Durable provisioning claim ownership was lost");
                        }
                    },
                    reserveDid: async (did) => {
                        if (
                            !(await reservePendingRegistrationDid(pendingRegistrationId, did, provisioningClaimToken, {
                                collections,
                            }))
                        ) {
                            throw new Error("Pending registration already reserved a different identity");
                        }
                    },
                });
                return { accountId: account._id!, did: account.did! } satisfies ProvisionedPendingAccount;
            } finally {
                await release.release();
            }
        },
    };
}

/**
 * Repairs only the secondary effects for an account whose durable commit claim
 * already exists. This function never verifies a password and never issues a
 * session; the login action calls it only after ordinary credential validation.
 */
export async function finalizeClaimedRegistrationForAuthenticatedLogin(user: {
    _id?: string | ObjectId;
    did?: string;
    metadata?: Record<string, unknown>;
}): Promise<boolean> {
    const pendingRegistrationId = user.metadata?.pendingRegistrationId;
    if (typeof pendingRegistrationId !== "string") return true;
    if (!ObjectId.isValid(pendingRegistrationId) || !user._id || !user.did) return false;
    const accountId = user._id.toString();
    const userMetadata = user.metadata ?? {};

    const deps = await createPendingRegistrationRuntimeDependencies();
    const id = new ObjectId(pendingRegistrationId);
    const record = await deps.collections.registrations.findOne({ _id: id });
    // Provisioned registration records become TTL eligible after the review
    // window. Only the durable profile marker written by finalization permits
    // pending accounts to continue after that retention window.
    if (!record) return userMetadata.pendingRegistrationFinalizationVersion === 1;
    if (record.status === "provisioned") {
        return (
            record.accountId === accountId &&
            record.accountDid === user.did &&
            userMetadata.pendingRegistrationFinalizationVersion === 1
        );
    }
    if (record.status !== "provisioning_claimed" || !record.provisioningClaimHash) return false;

    const exactAccount = await findExactPendingAccount(
        pendingRegistrationId,
        record,
        accountId,
        user.did,
        deps.collections.didReservations,
    );
    if (!exactAccount) return false;

    const claimHash = record.provisioningClaimHash;
    const ownerToken = crypto.randomBytes(32).toString("base64url");
    const assertClaim = async () =>
        Boolean(
            await deps.collections.registrations.findOne({
                _id: id,
                status: "provisioning_claimed",
                provisioningClaimHash: claimHash,
                reservedDid: user.did,
            }),
        );
    await runPendingAccountFinalizationSideEffects(
        { accountId, did: user.did },
        pendingRegistrationId,
        ownerToken,
        assertClaim,
        (await getDb()).collection<FinalizationLock>("pendingRegistrationFinalizationLocks"),
    );

    const finalizedAt = new Date();
    const transition = await deps.collections.registrations.updateOne(
        {
            _id: id,
            status: "provisioning_claimed",
            provisioningClaimHash: claimHash,
            reservedDid: user.did,
        },
        {
            $set: {
                status: "provisioned",
                accountId,
                accountDid: user.did,
                provisionedAt: finalizedAt,
                updatedAt: finalizedAt,
                reconciliationRequiredAt: null,
                expiresAt: new Date(finalizedAt.getTime() + PENDING_PROVISIONED_RETENTION_MS),
            },
            $unset: { provisioningClaimHash: "" },
        },
    );
    if (transition.matchedCount !== 1) {
        const current = await deps.collections.registrations.findOne({
            _id: id,
            status: "provisioned",
            accountId,
            accountDid: user.did,
        });
        return Boolean(current);
    }

    await deps.collections.auditEvents.insertOne({
        pendingRegistrationId,
        eventType: "pending_registration.finalization_recovered_after_login",
        occurredAt: finalizedAt,
        expiresAt: new Date(finalizedAt.getTime() + 180 * 24 * 60 * 60 * 1000),
    });
    return true;
}
