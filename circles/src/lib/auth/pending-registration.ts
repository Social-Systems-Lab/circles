import crypto from "crypto";
import { ObjectId, type Collection, type Db, type Filter } from "mongodb";
import { normalizeEmailForComparison } from "@/lib/auth/email-normalization";

export const PENDING_REGISTRATION_LIFETIME_MS = 48 * 60 * 60 * 1000;
export const PENDING_VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000;
export const PENDING_VERIFIED_CONTINUATION_TTL_MS = 30 * 60 * 1000;
export const PENDING_RESEND_COOLDOWN_MS = 60 * 1000;
export const PENDING_PROVISIONING_LEASE_MS = 2 * 60 * 1000;
export const PENDING_PROVISIONED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const PENDING_REGISTRATION_PUBLIC_MESSAGE = "If registration can continue, we sent an email with the next step.";

export type PendingRegistrationStatus = "pending_email" | "email_verified" | "provisioning" | "provisioned";

export type PendingRegistration = {
    _id: ObjectId;
    name: string;
    email: string;
    normalizedEmail: string;
    requestedHandle: string;
    status: PendingRegistrationStatus;
    continuationSecretHash: string;
    verificationTokenHash: string | null;
    verificationTokenExpiresAt: Date | null;
    verificationVersion: number;
    verificationLastSentAt: Date | null;
    verifiedContinuationHash: string | null;
    verifiedContinuationExpiresAt: Date | null;
    verifiedAt: Date | null;
    redirectTo: string | null;
    provisioningLeaseHash: string | null;
    provisioningLeaseExpiresAt: Date | null;
    provisioningAttempts: number;
    reservedDid: string | null;
    reconciliationRequiredAt: Date | null;
    accountId: string | null;
    accountDid: string | null;
    provisionedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    expiresAt?: Date;
};

export type PendingRegistrationAuditEvent = {
    pendingRegistrationId: string;
    eventType: string;
    occurredAt: Date;
    details?: Record<string, string | number | boolean | null>;
    expiresAt: Date;
};

type PendingRateLimit = { _id: string; count: number; expiresAt: Date };

export type PendingRegistrationCollections = {
    registrations: Collection<PendingRegistration>;
    rateLimits: Collection<PendingRateLimit>;
    auditEvents: Collection<PendingRegistrationAuditEvent>;
};

export type PendingRegistrationEmail = {
    to: string;
    name: string;
    verificationUrl: string;
};

export type ProvisionedPendingAccount = { accountId: string; did: string };

export type PendingRegistrationDependencies = {
    collections: PendingRegistrationCollections;
    sendVerificationEmail: (email: PendingRegistrationEmail) => Promise<void>;
    permanentAccountExists: (normalizedEmail: string, requestedHandle: string) => Promise<boolean>;
    findAccountByPendingRegistrationId: (pendingRegistrationId: string) => Promise<ProvisionedPendingAccount | null>;
    provisionAccount: (input: {
        pendingRegistrationId: string;
        name: string;
        email: string;
        requestedHandle: string;
        password: string;
    }) => Promise<ProvisionedPendingAccount>;
    finalizeAccount: (account: ProvisionedPendingAccount) => Promise<void>;
    baseUrl: string;
    now?: () => Date;
};

export async function beginPendingRegistration(
    input: {
        name: string;
        email: string;
        requestedHandle: string;
        redirectTo?: string | null;
        clientIp: string;
        altcha: string;
    },
    deps: PendingRegistrationDependencies,
    controls: {
        enabled?: boolean;
        verifyAltcha: (payload: string) => Promise<boolean>;
        registrationModeAllows?: () => Promise<boolean>;
    },
): Promise<{ enabled: false } | ({ enabled: true } & Awaited<ReturnType<typeof startPendingRegistration>>)> {
    if (!(controls.enabled ?? isPendingRegistrationEnabled())) return { enabled: false };
    const routeAllowed = controls.registrationModeAllows
        ? await controls.registrationModeAllows()
        : await (await import("@/lib/auth/registration-routing")).isRegistrationModeAllowed("pending");
    if (!routeAllowed) return { enabled: false };
    if (!(await controls.verifyAltcha(input.altcha))) {
        return {
            enabled: true,
            success: true,
            message: PENDING_REGISTRATION_PUBLIC_MESSAGE,
            pendingRegistrationId: new ObjectId().toHexString(),
            continuationSecret: pendingSecret(),
        };
    }
    return { enabled: true, ...(await startPendingRegistration(input, deps)) };
}

const pendingSecret = (): string => crypto.randomBytes(32).toString("base64url");

function tokenSecret(): string {
    const secret = process.env.PENDING_REGISTRATION_TOKEN_HMAC_KEY || process.env.SIGNUP_FORM_HMAC_KEY;
    if (!secret) throw new Error("Pending registration token hashing is not configured");
    return secret;
}

export function hashPendingRegistrationSecret(purpose: string, value: string): string {
    return crypto.createHmac("sha256", tokenSecret()).update(`${purpose}:${value}`).digest("hex");
}

export function isPendingRegistrationEnabled(): boolean {
    return process.env.PENDING_REGISTRATION_ENABLED === "true" && isPendingRegistrationJourneyReady();
}

export function isPendingRegistrationJourneyReady(): boolean {
    return process.env.PENDING_REGISTRATION_JOURNEY_READY === "true";
}

export function validatePendingRedirect(value?: string | null): string | null {
    if (!value) return null;
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
    try {
        const parsed = new URL(value, "https://kamooni.invalid");
        return parsed.origin === "https://kamooni.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
    } catch {
        return null;
    }
}

export function validatePendingRegistrationInput(input: { name: string; email: string; requestedHandle: string }) {
    const name = input.name.trim();
    const email = input.email.trim();
    const requestedHandle = input.requestedHandle.trim().toLowerCase();
    if (
        name.length < 2 ||
        name.length > 100 ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        requestedHandle.length < 3 ||
        requestedHandle.length > 20 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedHandle)
    ) {
        throw new Error(PENDING_REGISTRATION_PUBLIC_MESSAGE);
    }
    return { name, email, requestedHandle, normalizedEmail: normalizeEmailForComparison(email) };
}

export async function ensurePendingRegistrationIndexes(collections: PendingRegistrationCollections): Promise<void> {
    await Promise.all([
        collections.registrations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        collections.registrations.createIndex({ verificationTokenHash: 1 }, { unique: true, sparse: true }),
        collections.registrations.createIndex({ normalizedEmail: 1 }, { unique: true }),
        collections.registrations.createIndex({ requestedHandle: 1 }, { unique: true }),
        collections.registrations.createIndex(
            { accountId: 1 },
            { unique: true, partialFilterExpression: { accountId: { $type: "string" } } },
        ),
        collections.rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        collections.auditEvents.createIndex({ pendingRegistrationId: 1, occurredAt: -1 }),
        collections.auditEvents.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
}

export async function getPendingRegistrationCollections(db?: Db): Promise<PendingRegistrationCollections> {
    const database = db ?? (await (await import("@/lib/data/db")).getDb());
    const collections = {
        registrations: database.collection<PendingRegistration>("pendingRegistrations"),
        rateLimits: database.collection<PendingRateLimit>("pendingRegistrationRateLimits"),
        auditEvents: database.collection<PendingRegistrationAuditEvent>("pendingRegistrationAuditEvents"),
    };
    await ensurePendingRegistrationIndexes(collections);
    return collections;
}

async function audit(
    collections: PendingRegistrationCollections,
    pendingRegistrationId: string,
    eventType: string,
    now: Date,
    details?: PendingRegistrationAuditEvent["details"],
) {
    await collections.auditEvents.insertOne({
        pendingRegistrationId,
        eventType,
        occurredAt: now,
        details,
        expiresAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    });
}

export async function consumePendingRegistrationRateLimit(
    collections: PendingRegistrationCollections,
    scope: string,
    subject: string,
    maximum: number,
    windowMs: number,
    now: Date,
): Promise<boolean> {
    const window = Math.floor(now.getTime() / windowMs);
    const id = hashPendingRegistrationSecret("rate-limit", `${scope}:${window}:${subject}`);
    try {
        const result = await collections.rateLimits.findOneAndUpdate(
            { _id: id, count: { $lt: maximum } },
            { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now.getTime() + windowMs) } },
            { upsert: true, returnDocument: "after" },
        );
        return Boolean(result && result.count <= maximum);
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return false;
        throw error;
    }
}

export async function authorizePendingRegistrationChallenge(
    clientIp: string,
    deps: Pick<PendingRegistrationDependencies, "collections" | "now">,
): Promise<boolean> {
    const now = deps.now?.() ?? new Date();
    return consumePendingRegistrationRateLimit(deps.collections, "challenge-ip", clientIp, 20, 60 * 60 * 1000, now);
}

export async function reservePendingRegistrationDid(
    pendingRegistrationId: string,
    did: string,
    deps: Pick<PendingRegistrationDependencies, "collections" | "now">,
): Promise<boolean> {
    if (!ObjectId.isValid(pendingRegistrationId)) return false;
    const now = deps.now?.() ?? new Date();
    const result = await deps.collections.registrations.updateOne(
        {
            _id: new ObjectId(pendingRegistrationId),
            status: "provisioning",
            $or: [{ reservedDid: null }, { reservedDid: did }],
        },
        {
            $set: { reservedDid: did, reconciliationRequiredAt: now, updatedAt: now },
            $unset: { expiresAt: "" },
        },
    );
    return result.matchedCount === 1;
}

const verificationUrl = (baseUrl: string, token: string) =>
    `${baseUrl.replace(/\/+$/, "")}/register/verify?token=${encodeURIComponent(token)}`;

export async function startPendingRegistration(
    input: { name: string; email: string; requestedHandle: string; redirectTo?: string | null; clientIp: string },
    deps: PendingRegistrationDependencies,
): Promise<{ success: true; message: string; pendingRegistrationId: string; continuationSecret: string }> {
    const now = deps.now?.() ?? new Date();
    const values = validatePendingRegistrationInput(input);
    const decoyId = new ObjectId();
    const continuationSecret = pendingSecret();
    const verificationToken = pendingSecret();
    const publicResult = {
        success: true as const,
        message: PENDING_REGISTRATION_PUBLIC_MESSAGE,
        pendingRegistrationId: decoyId.toHexString(),
        continuationSecret,
    };
    const allowed = await Promise.all([
        consumePendingRegistrationRateLimit(deps.collections, "start-ip", input.clientIp, 5, 60 * 60 * 1000, now),
        consumePendingRegistrationRateLimit(
            deps.collections,
            "start-email",
            values.normalizedEmail,
            3,
            60 * 60 * 1000,
            now,
        ),
    ]);
    if (
        allowed.some((value) => !value) ||
        (await deps.permanentAccountExists(values.normalizedEmail, values.requestedHandle))
    ) {
        return publicResult;
    }

    const record: PendingRegistration = {
        _id: decoyId,
        ...values,
        status: "pending_email",
        continuationSecretHash: hashPendingRegistrationSecret("pending-continuation", continuationSecret),
        verificationTokenHash: hashPendingRegistrationSecret("email-verification", verificationToken),
        verificationTokenExpiresAt: new Date(now.getTime() + PENDING_VERIFICATION_TOKEN_TTL_MS),
        verificationVersion: 1,
        verificationLastSentAt: now,
        verifiedContinuationHash: null,
        verifiedContinuationExpiresAt: null,
        verifiedAt: null,
        redirectTo: validatePendingRedirect(input.redirectTo),
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
        expiresAt: new Date(now.getTime() + PENDING_REGISTRATION_LIFETIME_MS),
    };
    try {
        await deps.collections.registrations.insertOne(record);
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return publicResult;
        throw error;
    }
    await audit(deps.collections, record._id.toHexString(), "pending_registration.created", now);
    try {
        await deps.sendVerificationEmail({
            to: record.email,
            name: record.name,
            verificationUrl: verificationUrl(deps.baseUrl, verificationToken),
        });
        await audit(deps.collections, record._id.toHexString(), "pending_registration.verification_sent", now);
    } catch {
        await audit(deps.collections, record._id.toHexString(), "pending_registration.email_delivery_failed", now);
    }
    return publicResult;
}

export async function verifyPendingRegistrationEmail(
    token: string,
    deps: PendingRegistrationDependencies,
): Promise<{ success: boolean; message: string; pendingRegistrationId?: string; verifiedContinuationSecret?: string }> {
    const now = deps.now?.() ?? new Date();
    const verifiedContinuationSecret = pendingSecret();
    const record = await deps.collections.registrations.findOneAndUpdate(
        {
            status: "pending_email",
            verificationTokenHash: hashPendingRegistrationSecret("email-verification", token),
            verificationTokenExpiresAt: { $gt: now },
            expiresAt: { $gt: now },
        },
        {
            $set: {
                status: "email_verified",
                verifiedAt: now,
                verifiedContinuationHash: hashPendingRegistrationSecret(
                    "verified-continuation",
                    verifiedContinuationSecret,
                ),
                verifiedContinuationExpiresAt: new Date(now.getTime() + PENDING_VERIFIED_CONTINUATION_TTL_MS),
                updatedAt: now,
            },
            $unset: { verificationTokenHash: "", verificationTokenExpiresAt: "" },
        },
        { returnDocument: "after" },
    );
    if (!record) {
        const existing = await deps.collections.registrations.findOne({
            verificationTokenHash: hashPendingRegistrationSecret("email-verification", token),
            verificationTokenExpiresAt: { $gt: now },
            $or: [{ expiresAt: { $gt: now } }, { reservedDid: { $type: "string" as const } }],
        });
        if (!existing) return { success: false, message: "This verification link is invalid or expired." };
        if (existing.status === "provisioning" && existing.reservedDid) {
            return { success: false, message: "This registration needs support review before it can continue." };
        }
        if (existing.status === "provisioning" && !existing.reservedDid) {
            const recoverySecret = pendingSecret();
            const recoveryRecord = await deps.collections.registrations.findOneAndUpdate(
                {
                    _id: existing._id,
                    status: "provisioning",
                    reservedDid: null,
                    verificationTokenHash: hashPendingRegistrationSecret("email-verification", token),
                    verificationTokenExpiresAt: { $gt: now },
                },
                {
                    $set: {
                        status: "email_verified",
                        verifiedContinuationHash: hashPendingRegistrationSecret(
                            "verified-continuation",
                            recoverySecret,
                        ),
                        verifiedContinuationExpiresAt: new Date(now.getTime() + PENDING_VERIFIED_CONTINUATION_TTL_MS),
                        updatedAt: now,
                    },
                    $unset: {
                        verificationTokenHash: "",
                        verificationTokenExpiresAt: "",
                        provisioningLeaseHash: "",
                        provisioningLeaseExpiresAt: "",
                    },
                },
                { returnDocument: "after" },
            );
            if (!recoveryRecord) return { success: false, message: "This verification link is invalid or expired." };
            return {
                success: true,
                message: "Email verified.",
                pendingRegistrationId: recoveryRecord._id.toHexString(),
                verifiedContinuationSecret: recoverySecret,
            };
        }
        return { success: false, message: "This verification link is invalid or expired." };
    }
    await audit(deps.collections, record._id.toHexString(), "pending_registration.email_verified", now);
    return {
        success: true,
        message: "Email verified.",
        pendingRegistrationId: record._id.toHexString(),
        verifiedContinuationSecret,
    };
}

function possessionFilter(id: string, continuationSecret: string, now: Date) {
    if (!ObjectId.isValid(id)) return null;
    return {
        _id: new ObjectId(id),
        continuationSecretHash: hashPendingRegistrationSecret("pending-continuation", continuationSecret),
        expiresAt: { $gt: now },
    };
}

export async function resumePendingRegistration(
    id: string,
    continuationSecret: string,
    deps: PendingRegistrationDependencies,
): Promise<{
    success: boolean;
    status?: PendingRegistrationStatus;
    redirectTo?: string | null;
    email?: string;
    verificationLastSentAt?: Date | null;
    verifiedContinuationExpiresAt?: Date | null;
}> {
    const now = deps.now?.() ?? new Date();
    const filter = possessionFilter(id, continuationSecret, now);
    if (!filter) return { success: false };
    const record = await deps.collections.registrations.findOne(filter);
    return record
        ? {
              success: true,
              status: record.status,
              redirectTo: record.redirectTo,
              email: record.email,
              verificationLastSentAt: record.verificationLastSentAt,
              verifiedContinuationExpiresAt: record.verifiedContinuationExpiresAt,
          }
        : { success: false };
}

export async function resendPendingRegistrationVerification(
    input: { pendingRegistrationId: string; continuationSecret: string; clientIp: string },
    deps: PendingRegistrationDependencies,
): Promise<{ success: true; message: string }> {
    const now = deps.now?.() ?? new Date();
    const filter = possessionFilter(input.pendingRegistrationId, input.continuationSecret, now);
    if (!filter) return { success: true, message: PENDING_REGISTRATION_PUBLIC_MESSAGE };
    const allowed = await consumePendingRegistrationRateLimit(
        deps.collections,
        "resend",
        `${input.pendingRegistrationId}:${input.clientIp}`,
        3,
        60 * 60 * 1000,
        now,
    );
    if (!allowed) return { success: true, message: PENDING_REGISTRATION_PUBLIC_MESSAGE };
    const token = pendingSecret();
    const record = await deps.collections.registrations.findOneAndUpdate(
        {
            ...filter,
            $and: [
                {
                    $or: [
                        { status: "pending_email" },
                        { status: "provisioning", reservedDid: null, provisioningLeaseExpiresAt: { $lte: now } },
                    ],
                },
                {
                    $or: [
                        { verificationLastSentAt: null },
                        { verificationLastSentAt: { $lte: new Date(now.getTime() - PENDING_RESEND_COOLDOWN_MS) } },
                    ],
                },
            ],
        },
        {
            $set: {
                verificationTokenHash: hashPendingRegistrationSecret("email-verification", token),
                verificationTokenExpiresAt: new Date(now.getTime() + PENDING_VERIFICATION_TOKEN_TTL_MS),
                verificationLastSentAt: now,
                updatedAt: now,
                status: "pending_email",
            },
            $unset: {
                verifiedContinuationHash: "",
                verifiedContinuationExpiresAt: "",
                provisioningLeaseHash: "",
                provisioningLeaseExpiresAt: "",
            },
            $inc: { verificationVersion: 1 },
        },
        { returnDocument: "after" },
    );
    if (record) {
        try {
            await deps.sendVerificationEmail({
                to: record.email,
                name: record.name,
                verificationUrl: verificationUrl(deps.baseUrl, token),
            });
            await audit(deps.collections, input.pendingRegistrationId, "pending_registration.verification_resent", now);
        } catch {
            await audit(
                deps.collections,
                input.pendingRegistrationId,
                "pending_registration.email_delivery_failed",
                now,
            );
        }
    }
    return { success: true, message: PENDING_REGISTRATION_PUBLIC_MESSAGE };
}

export async function correctPendingRegistrationEmail(
    input: {
        pendingRegistrationId: string;
        continuationSecret: string;
        newEmail: string;
        clientIp: string;
    },
    deps: PendingRegistrationDependencies,
): Promise<{ success: true; message: string }> {
    const now = deps.now?.() ?? new Date();
    const filter = possessionFilter(input.pendingRegistrationId, input.continuationSecret, now);
    if (!filter) return { success: true, message: PENDING_REGISTRATION_PUBLIC_MESSAGE };
    let email: string;
    let normalizedEmail: string;
    try {
        const validated = validatePendingRegistrationInput({
            name: "Valid Name",
            email: input.newEmail,
            requestedHandle: "valid-handle",
        });
        email = validated.email;
        normalizedEmail = validated.normalizedEmail;
    } catch {
        return { success: true, message: PENDING_REGISTRATION_PUBLIC_MESSAGE };
    }
    const allowed = await consumePendingRegistrationRateLimit(
        deps.collections,
        "correction",
        `${input.pendingRegistrationId}:${input.clientIp}`,
        3,
        24 * 60 * 60 * 1000,
        now,
    );
    if (!allowed || (await deps.permanentAccountExists(normalizedEmail, "__email_only__"))) {
        return { success: true, message: PENDING_REGISTRATION_PUBLIC_MESSAGE };
    }
    const token = pendingSecret();
    let record: PendingRegistration | null = null;
    try {
        record = await deps.collections.registrations.findOneAndUpdate(
            { ...filter, status: "pending_email" },
            {
                $set: {
                    email,
                    normalizedEmail,
                    verificationTokenHash: hashPendingRegistrationSecret("email-verification", token),
                    verificationTokenExpiresAt: new Date(now.getTime() + PENDING_VERIFICATION_TOKEN_TTL_MS),
                    verificationLastSentAt: now,
                    updatedAt: now,
                },
                $inc: { verificationVersion: 1 },
            },
            { returnDocument: "after" },
        );
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
    }
    if (record) {
        try {
            await deps.sendVerificationEmail({
                to: record.email,
                name: record.name,
                verificationUrl: verificationUrl(deps.baseUrl, token),
            });
            await audit(deps.collections, input.pendingRegistrationId, "pending_registration.email_corrected", now);
        } catch {
            await audit(
                deps.collections,
                input.pendingRegistrationId,
                "pending_registration.email_delivery_failed",
                now,
            );
        }
    }
    return { success: true, message: PENDING_REGISTRATION_PUBLIC_MESSAGE };
}

export async function provisionPendingRegistration(
    input: { pendingRegistrationId: string; verifiedContinuationSecret: string; password: string },
    deps: PendingRegistrationDependencies,
): Promise<{ success: boolean; account?: ProvisionedPendingAccount; message: string }> {
    const now = deps.now?.() ?? new Date();
    if (input.password.length < 8 || input.password.length > 128 || !ObjectId.isValid(input.pendingRegistrationId)) {
        return { success: false, message: "Registration could not be completed." };
    }
    const id = new ObjectId(input.pendingRegistrationId);
    const retentionFilter: Filter<PendingRegistration> = {
        $or: [{ expiresAt: { $gt: now } }, { reservedDid: { $type: "string" as const } }],
    };
    const authorized = await deps.collections.registrations.findOne({
        _id: id,
        status: "email_verified",
        $and: [retentionFilter],
        verifiedContinuationHash: hashPendingRegistrationSecret(
            "verified-continuation",
            input.verifiedContinuationSecret,
        ),
        verifiedContinuationExpiresAt: { $gt: now },
    });
    if (!authorized) return { success: false, message: "Registration could not be completed." };
    const lease = pendingSecret();
    const record = await deps.collections.registrations.findOneAndUpdate(
        {
            _id: id,
            verifiedContinuationHash: hashPendingRegistrationSecret(
                "verified-continuation",
                input.verifiedContinuationSecret,
            ),
            verifiedContinuationExpiresAt: { $gt: now },
            $and: [
                retentionFilter,
                {
                    $or: [
                        { status: "email_verified" },
                        { status: "provisioning", provisioningLeaseExpiresAt: { $lte: now } },
                    ],
                },
            ],
        },
        {
            $set: {
                status: "provisioning",
                provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", lease),
                provisioningLeaseExpiresAt: new Date(now.getTime() + PENDING_PROVISIONING_LEASE_MS),
                updatedAt: now,
            },
            $unset: { verifiedContinuationHash: "", verifiedContinuationExpiresAt: "" },
            $inc: { provisioningAttempts: 1 },
        },
        { returnDocument: "after" },
    );
    if (!record) {
        return { success: false, message: "Registration could not be completed." };
    }
    try {
        const account = await deps.provisionAccount({
            pendingRegistrationId: input.pendingRegistrationId,
            name: record.name,
            email: record.email,
            requestedHandle: record.requestedHandle,
            password: input.password,
        });
        await deps.finalizeAccount(account);
        await deps.collections.registrations.updateOne(
            {
                _id: id,
                provisioningLeaseHash: hashPendingRegistrationSecret("provisioning-lease", lease),
            },
            {
                $set: {
                    status: "provisioned",
                    accountId: account.accountId,
                    accountDid: account.did,
                    provisionedAt: now,
                    updatedAt: now,
                    reconciliationRequiredAt: null,
                    expiresAt: new Date(now.getTime() + PENDING_PROVISIONED_RETENTION_MS),
                },
                $unset: {
                    provisioningLeaseHash: "",
                    provisioningLeaseExpiresAt: "",
                },
            },
        );
        await audit(deps.collections, input.pendingRegistrationId, "pending_registration.provisioned", now);
        return { success: true, account, message: "Registration completed." };
    } catch {
        await audit(
            deps.collections,
            input.pendingRegistrationId,
            "pending_registration.provisioning_interrupted",
            now,
        );
        return { success: false, message: "Registration could not be completed. Please try again." };
    }
}
