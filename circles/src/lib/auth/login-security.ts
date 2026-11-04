import crypto from "crypto";
import { isIP } from "net";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/data/db";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_PAIR_FAILURE_LIMIT = 10;
export const LOGIN_IP_FAILURE_LIMIT = 25;
export const LOGIN_LEASE_MS = 30 * 1000;
export const LOGIN_BACKOFF_MS = [0, 0, 0, 0, 1_000, 2_000, 4_000, 8_000] as const;
export const GENERIC_INVALID_CREDENTIALS = "Invalid email or password.";
export const LOGIN_TEMPORARILY_UNAVAILABLE = "Login is temporarily unavailable. Please try again later.";

const DUMMY_PASSWORD_SALT = Buffer.from("kamooni-login-dummy-salt-v1", "utf8");
const DUMMY_PASSWORD_VERIFIER = Buffer.from("ca071f6415cea558a7b62ad555e42475ad9a327dd3b771c3f9e07cadae4fa77f", "hex");

type LoginRateLimitRecord = {
    _id: string;
    kind: "pair" | "ip";
    count: number;
    blockedUntil: Date;
    expiresAt: Date;
    leaseToken?: string;
    leaseUntil?: Date;
};

export type LoginRateLimitCollection = Pick<
    Collection<LoginRateLimitRecord>,
    "createIndex" | "deleteMany" | "findOneAndUpdate" | "updateOne" | "deleteOne"
>;

export type LoginAttemptLease = {
    pairKey: string;
    ipKey: string;
    token: string;
    priorPairFailures: number;
};

export class LoginThrottledError extends Error {
    constructor() {
        super("Login attempt throttled");
        this.name = "LoginThrottledError";
    }
}

export class LoginRateLimitStorageError extends Error {
    constructor(cause?: unknown) {
        super("Login rate-limit storage unavailable", { cause });
        this.name = "LoginRateLimitStorageError";
    }
}

function limiterSecret(): string {
    const secret = process.env.LOGIN_RATE_LIMIT_HMAC_KEY || process.env.ALTCHA_HMAC_KEY;
    if (!secret) throw new LoginRateLimitStorageError(new Error("Login limiter HMAC key is not configured"));
    return secret;
}

export function normalizeLoginIdentifier(value: string): string {
    return value.trim().toLowerCase();
}

export function trustedLoginClientIp(xRealIp: string | null): string {
    const candidate = xRealIp?.trim() ?? "";
    return isIP(candidate) ? candidate : "missing-or-invalid-x-real-ip";
}

export function verifyDummyLoginPassword(password: string): void {
    const candidate = crypto.pbkdf2Sync(password, DUMMY_PASSWORD_SALT, 100000, 32, "sha512");
    crypto.timingSafeEqual(candidate, DUMMY_PASSWORD_VERIFIER);
}

export function loginLimiterKeys(
    ip: string,
    normalizedIdentifier: string,
    secret: string,
): { pairKey: string; ipKey: string } {
    const digest = (value: string) => crypto.createHmac("sha256", secret).update(value).digest("hex");
    const ipDigest = digest(`login-ip\0${ip}`);
    return {
        ipKey: `ip:${ipDigest}`,
        pairKey: `pair:${digest(`login-pair\0${ip}\0${normalizedIdentifier}`)}`,
    };
}

async function loginRateLimits(): Promise<LoginRateLimitCollection> {
    const collection = (await getDb()).collection<LoginRateLimitRecord>("loginRateLimits");
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return collection;
}

function isDuplicateKey(error: unknown): boolean {
    return (error as { code?: number }).code === 11000;
}

export async function beginLoginAttempt(
    ip: string,
    normalizedIdentifier: string,
    collection?: LoginRateLimitCollection,
    now = new Date(),
    secret = limiterSecret(),
): Promise<LoginAttemptLease> {
    const records = collection ?? (await loginRateLimits());
    const { pairKey, ipKey } = loginLimiterKeys(ip, normalizedIdentifier, secret);
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(now.getTime() + LOGIN_WINDOW_MS);

    try {
        // TTL deletion is asynchronous, so expired records must not keep a caller blocked.
        await records.deleteMany({ _id: { $in: [pairKey, ipKey] }, expiresAt: { $lte: now } });

        let pair: LoginRateLimitRecord | null;
        try {
            pair = await records.findOneAndUpdate(
                {
                    _id: pairKey,
                    count: { $lt: LOGIN_PAIR_FAILURE_LIMIT },
                    blockedUntil: { $lte: now },
                    $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
                },
                {
                    $set: { leaseToken: token, leaseUntil: new Date(now.getTime() + LOGIN_LEASE_MS) },
                    $setOnInsert: { kind: "pair", count: 0, blockedUntil: now, expiresAt },
                },
                { upsert: true, returnDocument: "after" },
            );
        } catch (error) {
            if (isDuplicateKey(error)) throw new LoginThrottledError();
            throw error;
        }
        if (!pair || pair.leaseToken !== token) throw new LoginThrottledError();

        try {
            const ipRecord = await records.findOneAndUpdate(
                { _id: ipKey, count: { $lt: LOGIN_IP_FAILURE_LIMIT }, blockedUntil: { $lte: now } },
                {
                    $inc: { count: 1 },
                    $setOnInsert: { kind: "ip", blockedUntil: now, expiresAt },
                },
                { upsert: true, returnDocument: "after" },
            );
            if (!ipRecord || ipRecord.count > LOGIN_IP_FAILURE_LIMIT) throw new LoginThrottledError();
        } catch (error) {
            await records.updateOne(
                { _id: pairKey, leaseToken: token },
                { $unset: { leaseToken: "", leaseUntil: "" } },
            );
            if (isDuplicateKey(error) || error instanceof LoginThrottledError) throw new LoginThrottledError();
            throw error;
        }

        return { pairKey, ipKey, token, priorPairFailures: pair.count };
    } catch (error) {
        if (error instanceof LoginThrottledError) throw error;
        throw new LoginRateLimitStorageError(error);
    }
}

export async function recordFailedLogin(
    lease: LoginAttemptLease,
    collection?: LoginRateLimitCollection,
    now = new Date(),
): Promise<void> {
    const records = collection ?? (await loginRateLimits());
    const failures = lease.priorPairFailures + 1;
    const delay = failures >= LOGIN_PAIR_FAILURE_LIMIT ? LOGIN_WINDOW_MS : (LOGIN_BACKOFF_MS[failures - 1] ?? 0);
    const blockedUntil = new Date(now.getTime() + delay);
    try {
        const result = await records.updateOne(
            { _id: lease.pairKey, leaseToken: lease.token },
            {
                $inc: { count: 1 },
                $set: {
                    blockedUntil,
                    ...(failures >= LOGIN_PAIR_FAILURE_LIMIT ? { expiresAt: blockedUntil } : {}),
                },
                $unset: { leaseToken: "", leaseUntil: "" },
            },
        );
        if (result.matchedCount !== 1) throw new Error("Login attempt lease was lost");
    } catch (error) {
        throw new LoginRateLimitStorageError(error);
    }
}

export async function clearSuccessfulLogin(
    lease: LoginAttemptLease,
    collection?: LoginRateLimitCollection,
): Promise<void> {
    const records = collection ?? (await loginRateLimits());
    try {
        const removed = await records.deleteOne({ _id: lease.pairKey, leaseToken: lease.token });
        if (removed.deletedCount !== 1) throw new Error("Login attempt lease was lost");
        await records.updateOne({ _id: lease.ipKey, count: { $gt: 0 } }, { $inc: { count: -1 } });
    } catch (error) {
        throw new LoginRateLimitStorageError(error);
    }
}

export async function abandonLoginAttempt(
    lease: LoginAttemptLease,
    collection?: LoginRateLimitCollection,
): Promise<void> {
    const records = collection ?? (await loginRateLimits());
    try {
        const released = await records.updateOne(
            { _id: lease.pairKey, leaseToken: lease.token },
            { $unset: { leaseToken: "", leaseUntil: "" } },
        );
        if (released.matchedCount === 1) {
            await records.updateOne({ _id: lease.ipKey, count: { $gt: 0 } }, { $inc: { count: -1 } });
        }
    } catch (error) {
        throw new LoginRateLimitStorageError(error);
    }
}
