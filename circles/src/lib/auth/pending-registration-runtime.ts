import crypto from "crypto";
import type { Collection } from "mongodb";
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
import {
    getPendingRegistrationCollections,
    reservePendingRegistrationDid,
    type PendingRegistrationDependencies,
    type ProvisionedPendingAccount,
} from "@/lib/auth/pending-registration";

type ProvisioningLock = { _id: string; pendingRegistrationId: string; expiresAt: Date };

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
    normalizedEmail: string,
    requestedHandle: string,
) {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const ids = [
        crypto.createHash("sha256").update(`email:${normalizedEmail}`).digest("hex"),
        crypto.createHash("sha256").update(`handle:${requestedHandle}`).digest("hex"),
    ];
    const acquired: string[] = [];
    try {
        for (const _id of ids) {
            await collection.insertOne({ _id, pendingRegistrationId, expiresAt });
            acquired.push(_id);
        }
        return async () => collection.deleteMany({ _id: { $in: acquired }, pendingRegistrationId });
    } catch (error) {
        if (acquired.length) await collection.deleteMany({ _id: { $in: acquired }, pendingRegistrationId });
        if ((error as { code?: number }).code === 11000) return null;
        throw error;
    }
}

export async function createPendingRegistrationRuntimeDependencies(): Promise<PendingRegistrationDependencies> {
    const db = await getDb();
    const collections = await getPendingRegistrationCollections(db);
    const locks = db.collection<ProvisioningLock>("pendingRegistrationProvisioningLocks");
    await locks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
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
        finalizeAccount: async ({ did }) => {
            const user = await getUserPrivate(did);
            if (!(await getMember(did, user._id!))) {
                await addMember(did, user._id!, ["admins", "moderators", "members"]);
            }
            await updateCircle(
                {
                    _id: user._id!,
                    isHuman: true,
                    metadata: { ...(user.metadata ?? {}), onboardingFlow: "pending-registration-v1" },
                },
                did,
            );
            const resolvedWelcome = await getResolvedWelcomeTemplate();
            await ensureWelcomeMessageForNewUser(did, resolvedWelcome.config, resolvedWelcome.senderDid);
            await createUserSession(user, did);
        },
        provisionAccount: async ({ pendingRegistrationId, name, email, requestedHandle, password }) => {
            const normalizedEmail = normalizeEmailForComparison(email);
            const release = await acquireProvisioningLocks(
                locks,
                pendingRegistrationId,
                normalizedEmail,
                requestedHandle,
            );
            if (!release) throw new Error("Registration provisioning is already in progress");
            try {
                const recovered = await Circles.findOne(
                    { "metadata.pendingRegistrationId": pendingRegistrationId },
                    { projection: { _id: 1, did: 1 } },
                );
                if (recovered?._id && recovered.did) {
                    return { accountId: recovered._id.toString(), did: recovered.did };
                }
                if (await findPermanentAccount(normalizedEmail, requestedHandle)) {
                    throw new Error("Registration could not be completed");
                }
                const account = await createUserAccount(name, requestedHandle, "user", email, password, {
                    emailAlreadyVerified: true,
                    pendingRegistrationId,
                    sendVerificationEmail: false,
                    reserveDid: async (did) => {
                        if (!(await reservePendingRegistrationDid(pendingRegistrationId, did, { collections }))) {
                            throw new Error("Pending registration already reserved a different identity");
                        }
                    },
                });
                return { accountId: account._id!, did: account.did! } satisfies ProvisionedPendingAccount;
            } finally {
                await release();
            }
        },
    };
}
