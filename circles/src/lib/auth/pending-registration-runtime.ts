import crypto from "crypto";
import { ObjectId, type Collection } from "mongodb";
import { Circles, getDb } from "@/lib/data/db";
import { createUserAccount } from "@/lib/auth/auth";
import { createUserSession } from "@/lib/auth/auth";
import { normalizeEmailForComparison } from "@/lib/auth/email-normalization";
import { sendEmail } from "@/lib/data/email";
import { getUserPrivate } from "@/lib/data/user";
import { updateCircle } from "@/lib/data/circle";
import { ensureWelcomeMessageForNewUser } from "@/lib/data/mongo-chat";
import { getResolvedWelcomeTemplate } from "@/lib/data/system-message-templates";
import { addMember, getMember } from "@/lib/data/member";
import { assertRegistrationMode } from "@/lib/auth/registration-routing";
import {
    acquirePendingRegistrationProvisioningClaim,
    acquirePendingRegistrationOwnedLock,
    getPendingRegistrationCollections,
    hashPendingRegistrationSecret,
    isPendingRegistrationProvisioningClaimOwner,
    reservePendingRegistrationDid,
    renewPendingRegistrationOwnedLock,
    releasePendingRegistrationOwnedLock,
    type PendingRegistrationDependencies,
    type ProvisionedPendingAccount,
} from "@/lib/auth/pending-registration";

type ProvisioningLock = { _id: string; pendingRegistrationId: string; ownerTokenHash: string; expiresAt: Date };
type FinalizationLock = { _id: string; ownerTokenHash: string; expiresAt: Date };

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
        finalizeAccount: async ({ accountId, did }, { pendingRegistrationId, provisioningClaimToken }) => {
            const acquired = await acquirePendingRegistrationOwnedLock(
                finalizationLocks,
                accountId,
                provisioningClaimToken,
            );
            if (!acquired) throw new Error("Registration finalization is already in progress");
            const checkpoint = async () => {
                const claimOwned = await isPendingRegistrationProvisioningClaimOwner(
                    pendingRegistrationId,
                    provisioningClaimToken,
                    { collections },
                );
                const lockOwned = await renewPendingRegistrationOwnedLock(
                    finalizationLocks,
                    accountId,
                    provisioningClaimToken,
                );
                if (!claimOwned || !lockOwned) throw new Error("Registration finalization ownership was lost");
            };
            try {
                await checkpoint();
                const user = await getUserPrivate(did);
                if (!(await getMember(did, user._id!))) {
                    await checkpoint();
                    await addMember(did, user._id!, ["admins", "moderators", "members"]);
                }
                await checkpoint();
                await updateCircle(
                    {
                        _id: user._id!,
                        isHuman: true,
                        metadata: { ...(user.metadata ?? {}), onboardingFlow: "pending-registration-v1" },
                    },
                    did,
                );
                const resolvedWelcome = await getResolvedWelcomeTemplate();
                await checkpoint();
                await ensureWelcomeMessageForNewUser(did, resolvedWelcome.config, resolvedWelcome.senderDid);
                await checkpoint();
                await createUserSession(user, did);
            } finally {
                await releasePendingRegistrationOwnedLock(finalizationLocks, accountId, provisioningClaimToken);
            }
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
