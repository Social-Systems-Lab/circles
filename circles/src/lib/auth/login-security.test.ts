import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
    abandonLoginAttempt,
    beginLoginAttempt,
    clearSuccessfulLogin,
    GENERIC_INVALID_CREDENTIALS,
    LOGIN_BACKOFF_MS,
    LOGIN_IP_FAILURE_LIMIT,
    LOGIN_PAIR_FAILURE_LIMIT,
    LOGIN_TEMPORARILY_UNAVAILABLE,
    LOGIN_WINDOW_MS,
    LoginRateLimitStorageError,
    LoginThrottledError,
    loginLimiterKeys,
    normalizeLoginIdentifier,
    recordFailedLogin,
    trustedLoginClientIp,
    verifyDummyLoginPassword,
} from "./login-security";

type RecordValue = {
    _id: string;
    kind: "pair" | "ip";
    count: number;
    blockedUntil: Date;
    expiresAt: Date;
    leaseToken?: string;
    leaseUntil?: Date;
};

function matches(record: RecordValue | undefined, filter: any): boolean {
    if (!record) return false;
    if (filter._id && typeof filter._id === "string" && record._id !== filter._id) return false;
    if (filter.count?.$lt !== undefined && !(record.count < filter.count.$lt)) return false;
    if (filter.count?.$gt !== undefined && !(record.count > filter.count.$gt)) return false;
    if (filter.blockedUntil?.$lte && !(record.blockedUntil <= filter.blockedUntil.$lte)) return false;
    if (filter.leaseToken !== undefined && record.leaseToken !== filter.leaseToken) return false;
    if (filter.$or) {
        const leaseMatches = filter.$or.some((condition: any) =>
            condition.leaseUntil?.$exists === false
                ? record.leaseUntil === undefined
                : condition.leaseUntil?.$lte &&
                  record.leaseUntil !== undefined &&
                  record.leaseUntil <= condition.leaseUntil.$lte,
        );
        if (!leaseMatches) return false;
    }
    return true;
}

class MemoryCollection {
    records = new Map<string, RecordValue>();
    fail = false;

    async createIndex() {
        if (this.fail) throw new Error("mongo unavailable");
        return "expiresAt_1";
    }

    async deleteMany(filter: any) {
        if (this.fail) throw new Error("mongo unavailable");
        for (const id of filter._id.$in as string[]) {
            const record = this.records.get(id);
            if (record && record.expiresAt <= filter.expiresAt.$lte) this.records.delete(id);
        }
        return { deletedCount: 0 };
    }

    async findOneAndUpdate(filter: any, update: any) {
        if (this.fail) throw new Error("mongo unavailable");
        const existing = this.records.get(filter._id);
        if (existing && !matches(existing, filter))
            throw Object.assign(new Error(`duplicate key: ${JSON.stringify({ existing, filter })}`), { code: 11000 });
        const record = existing ?? ({ _id: filter._id, ...update.$setOnInsert } as RecordValue);
        if (update.$inc) {
            for (const [key, amount] of Object.entries(update.$inc))
                (record as any)[key] = ((record as any)[key] ?? 0) + (amount as number);
        }
        if (update.$set) Object.assign(record, update.$set);
        this.records.set(record._id, record);
        return { ...record };
    }

    async updateOne(filter: any, update: any) {
        if (this.fail) throw new Error("mongo unavailable");
        const record = this.records.get(filter._id);
        if (!record || !matches(record, filter)) return { matchedCount: 0, modifiedCount: 0 };
        if (update.$inc) {
            for (const [key, amount] of Object.entries(update.$inc)) (record as any)[key] += amount as number;
        }
        if (update.$set) Object.assign(record, update.$set);
        if (update.$unset) {
            for (const key of Object.keys(update.$unset)) delete (record as any)[key];
        }
        return { matchedCount: 1, modifiedCount: 1 };
    }

    async deleteOne(filter: any) {
        if (this.fail) throw new Error("mongo unavailable");
        const record = this.records.get(filter._id);
        if (!matches(record, filter)) return { deletedCount: 0 };
        this.records.delete(filter._id);
        return { deletedCount: 1 };
    }
}

const secret = "test-login-limiter-secret-with-sufficient-entropy";
const start = new Date("2026-01-01T00:00:00.000Z");

async function failAttempt(collection: MemoryCollection, ip: string, email: string, now: Date) {
    const lease = await beginLoginAttempt(ip, normalizeLoginIdentifier(email), collection as any, now, secret);
    await recordFailedLogin(lease, collection as any, now);
    return lease;
}

async function main() {
    assert.equal(normalizeLoginIdentifier("  Person@Example.COM "), "person@example.com");
    assert.equal(trustedLoginClientIp("203.0.113.9"), "203.0.113.9");
    assert.equal(trustedLoginClientIp(null), "missing-or-invalid-x-real-ip");
    assert.equal(trustedLoginClientIp("spoofed, 203.0.113.9"), "missing-or-invalid-x-real-ip");
    assert.notEqual(
        trustedLoginClientIp(null),
        "198.51.100.4",
        "an X-Forwarded-For value cannot influence the trusted-IP helper",
    );

    const keys = loginLimiterKeys("203.0.113.9", "person@example.com", secret);
    assert.doesNotMatch(keys.ipKey, /203\.0\.113\.9/);
    assert.doesNotMatch(keys.pairKey, /person@example\.com/);
    assert.notEqual(keys.pairKey, loginLimiterKeys("203.0.113.10", "person@example.com", secret).pairKey);

    const dummyStarted = process.hrtime.bigint();
    verifyDummyLoginPassword("submitted-password");
    const dummyElapsedMs = Number(process.hrtime.bigint() - dummyStarted) / 1_000_000;
    assert.ok(dummyElapsedMs >= 10, "unknown-account verification performs expensive password derivation");

    const progressive = new MemoryCollection();
    let now = start;
    for (let failure = 1; failure <= 8; failure += 1) {
        const lease = await failAttempt(progressive, "203.0.113.1", "person@example.com", now);
        const pair = progressive.records.get(lease.pairKey)!;
        assert.equal(pair.count, failure);
        assert.equal(pair.blockedUntil.getTime() - now.getTime(), LOGIN_BACKOFF_MS[failure - 1]);
        now = new Date(pair.blockedUntil.getTime());
    }

    const blockedPair = new MemoryCollection();
    now = start;
    for (let failure = 1; failure <= LOGIN_PAIR_FAILURE_LIMIT; failure += 1) {
        const lease = await failAttempt(blockedPair, "203.0.113.2", "person@example.com", now);
        if (failure < LOGIN_PAIR_FAILURE_LIMIT) now = new Date(blockedPair.records.get(lease.pairKey)!.blockedUntil);
    }
    await assert.rejects(
        beginLoginAttempt("203.0.113.2", "person@example.com", blockedPair as any, now, secret),
        LoginThrottledError,
    );

    const concurrent = new MemoryCollection();
    const concurrentResults = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
            beginLoginAttempt("203.0.113.3", "person@example.com", concurrent as any, start, secret),
        ),
    );
    assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);

    const abandoned = new MemoryCollection();
    const abandonedLease = await beginLoginAttempt(
        "203.0.113.31",
        "person@example.com",
        abandoned as any,
        start,
        secret,
    );
    const replacementLease = await beginLoginAttempt(
        "203.0.113.31",
        "person@example.com",
        abandoned as any,
        new Date(start.getTime() + 30_001),
        secret,
    );
    await abandonLoginAttempt(abandonedLease, abandoned as any);
    assert.equal(
        abandoned.records.get(replacementLease.pairKey)?.leaseToken,
        replacementLease.token,
        "stale cleanup cannot release a replacement lease",
    );
    assert.equal(
        abandoned.records.get(replacementLease.ipKey)?.count,
        2,
        "stale cleanup cannot release another IP slot",
    );
    await abandonLoginAttempt(replacementLease, abandoned as any);
    assert.equal(abandoned.records.get(replacementLease.ipKey)?.count, 1);

    const concurrentIp = new MemoryCollection();
    const concurrentIpResults = await Promise.allSettled(
        Array.from({ length: LOGIN_IP_FAILURE_LIMIT + 5 }, (_, attempt) =>
            beginLoginAttempt("203.0.113.30", `concurrent-${attempt}@example.com`, concurrentIp as any, start, secret),
        ),
    );
    assert.equal(
        concurrentIpResults.filter((result) => result.status === "fulfilled").length,
        LOGIN_IP_FAILURE_LIMIT,
        "concurrent account combinations cannot bypass the IP ceiling",
    );

    const ipWide = new MemoryCollection();
    for (let attempt = 0; attempt < LOGIN_IP_FAILURE_LIMIT; attempt += 1) {
        await failAttempt(ipWide, "203.0.113.4", `person-${attempt}@example.com`, start);
    }
    await assert.rejects(
        beginLoginAttempt("203.0.113.4", "another@example.com", ipWide as any, start, secret),
        LoginThrottledError,
    );
    const otherIpLease = await beginLoginAttempt("203.0.113.5", "another@example.com", ipWide as any, start, secret);
    assert.ok(otherIpLease, "a separate account/IP combination remains independent");

    const success = new MemoryCollection();
    const successLease = await beginLoginAttempt("203.0.113.6", "valid@example.com", success as any, start, secret);
    const did = "unchanged-user-did";
    let sessionDid: string | undefined;
    await clearSuccessfulLogin(successLease, success as any);
    sessionDid = did;
    assert.equal(sessionDid, did, "successful cleanup does not alter the DID used for session creation");
    assert.equal(success.records.has(successLease.pairKey), false, "success clears pair failures");
    assert.equal(success.records.get(successLease.ipKey)?.count, 0, "success safely reduces the IP count");

    const throttledCorrectPassword = new MemoryCollection();
    const activeLease = await beginLoginAttempt(
        "203.0.113.7",
        "valid@example.com",
        throttledCorrectPassword as any,
        start,
        secret,
    );
    let passwordChecks = 0;
    await assert.rejects(
        beginLoginAttempt("203.0.113.7", "valid@example.com", throttledCorrectPassword as any, start, secret),
        LoginThrottledError,
    );
    assert.equal(passwordChecks, 0, "temporary throttling happens before expensive password verification");
    await clearSuccessfulLogin(activeLease, throttledCorrectPassword as any);
    passwordChecks += 1;
    assert.equal(passwordChecks, 1, "correct credentials work after the temporary throttle clears");

    const expiration = new MemoryCollection();
    await failAttempt(expiration, "203.0.113.8", "person@example.com", start);
    const recovered = await beginLoginAttempt(
        "203.0.113.8",
        "person@example.com",
        expiration as any,
        new Date(start.getTime() + LOGIN_WINDOW_MS + 1),
        secret,
    );
    assert.equal(recovered.priorPairFailures, 0, "expired state recovers even before Mongo TTL cleanup runs");

    const exactlyOnce = new MemoryCollection();
    const exactlyOnceLease = await beginLoginAttempt(
        "203.0.113.32",
        "person@example.com",
        exactlyOnce as any,
        start,
        secret,
    );
    await recordFailedLogin(exactlyOnceLease, exactlyOnce as any, start);
    await assert.rejects(recordFailedLogin(exactlyOnceLease, exactlyOnce as any, start), LoginRateLimitStorageError);
    assert.equal(exactlyOnce.records.get(exactlyOnceLease.pairKey)?.count, 1, "a leased failure is recorded once");

    const unavailable = new MemoryCollection();
    unavailable.fail = true;
    await assert.rejects(
        beginLoginAttempt("203.0.113.9", "person@example.com", unavailable as any, start, secret),
        LoginRateLimitStorageError,
    );
    assert.notEqual(LOGIN_TEMPORARILY_UNAVAILABLE, GENERIC_INVALID_CREDENTIALS);

    const actionSource = fs.readFileSync(path.join(process.cwd(), "src/components/forms/login/actions.ts"), "utf8");
    assert.ok(actionSource.indexOf("beginLoginAttempt") < actionSource.indexOf("Circles.findOne"));
    assert.ok(actionSource.indexOf("beginLoginAttempt") < actionSource.indexOf("authenticateUser("));
    assert.ok(actionSource.indexOf("beginLoginAttempt") < actionSource.indexOf("verifyDummyLoginPassword(password)"));
    assert.ok(
        actionSource.indexOf("verifyDummyLoginPassword(password)") <
            actionSource.indexOf("await recordFailedLogin(failedLease)"),
    );
    assert.ok(actionSource.indexOf("clearSuccessfulLogin") < actionSource.indexOf("createUserSession("));
    assert.match(actionSource, /createUserSession\(privateUser, user\.did!\)/);
    assert.doesNotMatch(actionSource, /get\(["']x-forwarded-for["']\)/i);
    assert.doesNotMatch(actionSource, /console\.(?:log|error)[^\n]*(?:normalizedEmail|values\.email|emailInput)/);
    assert.equal(
        (actionSource.match(/message: GENERIC_INVALID_CREDENTIALS/g) ?? []).length,
        3,
        "unknown accounts and wrong passwords have exactly the same public error",
    );

    console.log("login security tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
