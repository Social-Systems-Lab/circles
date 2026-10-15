import assert from "node:assert/strict";

process.env.IS_BUILD = "true";
process.env.ALTCHA_HMAC_KEY = "test-signup-secret-with-sufficient-entropy";

async function main() {
    const { createChallenge, solveChallenge } = await import("altcha-lib");
    const { deriveKey } = await import("altcha-lib/algorithms/pbkdf2");
    const { storeAltchaChallenge, verifyAltchaPayload } = await import("./altcha");
    const {
        SIGNUP_FORM_MIN_AGE_MS,
        SIGNUP_FORM_MAX_AGE_MS,
        SIGNUP_EMAIL_LIMIT,
        SIGNUP_IP_LIMIT,
        consumeSignupRateLimits,
        guardPilotSignup,
        issueSignupFormToken,
        normalizeEmailForComparison,
        reserveSignupEmail,
        verifySignupFormToken,
        withSignupEmailReservation,
    } = await import("./signup-security");

    const challengeRecords = new Map<string, { challengeHash: string; expiresAt: Date }>();
    const challengeCollection = {
        createIndex: async () => "test-index",
        insertOne: async (record: { challengeHash: string; expiresAt: Date }) => {
            challengeRecords.set(record.challengeHash, record);
            return {} as never;
        },
        findOneAndDelete: async (filter: { challengeHash: string; expiresAt: { $gt: Date } }) => {
            const record = challengeRecords.get(filter.challengeHash);
            if (!record || record.expiresAt <= filter.expiresAt.$gt) return null;
            challengeRecords.delete(filter.challengeHash);
            return record;
        },
    } as any;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const challenge = await createChallenge({
        algorithm: "PBKDF2/SHA-256",
        cost: 100,
        deriveKey,
        expiresAt,
        hmacSignatureSecret: process.env.ALTCHA_HMAC_KEY!,
    });
    const solution = await solveChallenge({ challenge, deriveKey });
    assert.ok(solution, "test challenge is solvable");
    const payload = Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");
    await storeAltchaChallenge(challenge, expiresAt, challengeCollection);
    assert.equal(await verifyAltchaPayload(payload, challengeCollection), true, "valid ALTCHA succeeds once");
    assert.equal(await verifyAltchaPayload(payload, challengeCollection), false, "ALTCHA replay fails");

    assert.equal(normalizeEmailForComparison(" First.Last+tag@GoogleMail.com "), "firstlast@gmail.com");
    assert.equal(normalizeEmailForComparison(" First.Last+tag@example.com "), "first.last+tag@example.com");

    const issuedAt = Date.now();
    const formToken = issueSignupFormToken(issuedAt);
    const [tokenBody, tokenSignature] = formToken.split(".");
    assert.equal(verifySignupFormToken(`${tokenBody}x.${tokenSignature}`, issuedAt + SIGNUP_FORM_MIN_AGE_MS), false);
    assert.equal(verifySignupFormToken(formToken, issuedAt - 1), false, "future form token is rejected");
    assert.equal(
        verifySignupFormToken(formToken, issuedAt + SIGNUP_FORM_MAX_AGE_MS + 1),
        false,
        "expired form token is rejected",
    );
    const baseValues = {
        name: "Test Person",
        handle: "test-person",
        _email: "Test.Person+pilot@gmail.com",
        _password: "correct horse battery staple",
        altcha: "valid",
        website: "",
        formToken,
        onboardingFlow: "pilot-quick-signup",
    };
    let altchaCalls = 0;
    let limitCalls = 0;
    let accountCreations = 0;
    let verificationEmails = 0;
    const guard = (values: Record<string, unknown>, now = issuedAt + SIGNUP_FORM_MIN_AGE_MS) =>
        guardPilotSignup(values, "203.0.113.8", {
            now,
            verifyAltcha: async () => {
                altchaCalls += 1;
                return true;
            },
            consumeLimits: async () => {
                limitCalls += 1;
                return true;
            },
        });
    const guardedCreate = async (values: Record<string, unknown>, now?: number) => {
        await guard(values, now);
        accountCreations += 1;
        verificationEmails += 1;
    };

    await assert.rejects(guardedCreate({ ...baseValues, website: "https://spam.invalid" }), /signup/i);
    assert.equal(altchaCalls, 0, "honeypot rejects before ALTCHA");
    await assert.rejects(guardedCreate(baseValues, issuedAt + SIGNUP_FORM_MIN_AGE_MS - 1), /signup/i);
    assert.equal(altchaCalls, 0, "too-fast form rejects before ALTCHA");
    await assert.rejects(guardedCreate({ ...baseValues, metadata: { isAdmin: true } }), /signup/i);
    assert.equal(altchaCalls, 0, "unexpected metadata rejects before ALTCHA");
    assert.equal(accountCreations, 0, "rejected anti-abuse requests cannot create an account");
    assert.equal(verificationEmails, 0, "rejected anti-abuse requests cannot send verification email");
    assert.equal(limitCalls, 0, "early anti-abuse rejections do not consume rate limits");

    const rateRecords = new Map<string, { _id: string; count: number; expiresAt: Date }>();
    const rateCollection = {
        createIndex: async () => "test-index",
        findOneAndUpdate: async (filter: { _id: string; count: { $lt: number } }, update: any) => {
            const existing = rateRecords.get(filter._id);
            if (existing && existing.count >= filter.count.$lt)
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            const next = existing ?? { _id: filter._id, count: 0, expiresAt: update.$setOnInsert.expiresAt };
            next.count += update.$inc.count;
            rateRecords.set(filter._id, next);
            return next;
        },
        updateOne: async (filter: { _id: string; count: { $gt: number } }, update: any) => {
            const existing = rateRecords.get(filter._id);
            if (existing && existing.count > filter.count.$gt) existing.count += update.$inc.count;
            return {} as never;
        },
    } as any;
    for (let attempt = 0; attempt < SIGNUP_IP_LIMIT; attempt += 1) {
        assert.equal(
            await consumeSignupRateLimits("198.51.100.7", `person-${attempt}@example.com`, rateCollection),
            true,
        );
    }
    assert.equal(
        await consumeSignupRateLimits("198.51.100.7", "blocked@example.com", rateCollection),
        false,
        "per-IP signup rate limit blocks after its threshold",
    );
    assert.equal(
        [...rateRecords.values()].reduce((total, record) => total + record.count, 0),
        SIGNUP_IP_LIMIT * 2,
        "an exhausted IP limit does not consume a fresh email allowance",
    );
    assert.equal(
        [...rateRecords.values()].filter((record) => record.count === 0).length,
        1,
        "the fresh email counter is atomically restored after the IP rejection",
    );

    const emailRateRecords = new Map<string, { _id: string; count: number; expiresAt: Date }>();
    const emailRateCollection = {
        ...rateCollection,
        findOneAndUpdate: async (filter: { _id: string; count: { $lt: number } }, update: any) => {
            const existing = emailRateRecords.get(filter._id);
            if (existing && existing.count >= filter.count.$lt)
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            const next = existing ?? { _id: filter._id, count: 0, expiresAt: update.$setOnInsert.expiresAt };
            next.count += update.$inc.count;
            emailRateRecords.set(filter._id, next);
            return next;
        },
        updateOne: async (filter: { _id: string; count: { $gt: number } }, update: any) => {
            const existing = emailRateRecords.get(filter._id);
            if (existing && existing.count > filter.count.$gt) existing.count += update.$inc.count;
            return {} as never;
        },
    } as any;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        assert.equal(
            await consumeSignupRateLimits(`198.51.100.${attempt}`, "same@example.com", emailRateCollection),
            true,
        );
    }
    assert.equal(
        await consumeSignupRateLimits("198.51.100.99", "same@example.com", emailRateCollection),
        false,
        "per-email signup rate limit blocks after its threshold",
    );
    assert.equal(emailRateRecords.size, 4, "an exhausted email limit does not consume a new IP allowance");
    assert.equal(
        [...emailRateRecords.values()].reduce((total, record) => total + record.count, 0),
        SIGNUP_EMAIL_LIMIT * 2,
        "an exhausted email limit leaves the fresh IP bucket unchanged",
    );

    const concurrentRateRecords = new Map<string, { _id: string; count: number; expiresAt: Date }>();
    const concurrentRateCollection = {
        createIndex: async () => "test-index",
        findOneAndUpdate: async (filter: { _id: string; count: { $lt: number } }, update: any) => {
            const existing = concurrentRateRecords.get(filter._id);
            if (existing && existing.count >= filter.count.$lt)
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            const next = existing ?? { _id: filter._id, count: 0, expiresAt: update.$setOnInsert.expiresAt };
            next.count += update.$inc.count;
            concurrentRateRecords.set(filter._id, next);
            return next;
        },
        updateOne: async (filter: { _id: string; count: { $gt: number } }, update: any) => {
            const existing = concurrentRateRecords.get(filter._id);
            if (existing && existing.count > filter.count.$gt) existing.count += update.$inc.count;
            return {} as never;
        },
    } as any;
    const concurrentRateResults = await Promise.all(
        Array.from({ length: SIGNUP_IP_LIMIT + 3 }, (_, attempt) =>
            consumeSignupRateLimits("192.0.2.44", `concurrent-${attempt}@example.com`, concurrentRateCollection),
        ),
    );
    assert.equal(
        concurrentRateResults.filter(Boolean).length,
        SIGNUP_IP_LIMIT,
        "concurrent requests cannot exceed the atomic IP threshold",
    );

    type ReservationRecord = { _id: string; token: string; expiresAt: Date };
    const reservationRecords = new Map<string, ReservationRecord>();
    const reservationCollection = {
        createIndex: async () => "test-index",
        findOneAndUpdate: async (filter: { _id: string; expiresAt: { $lte: Date } }, update: any) => {
            const existing = reservationRecords.get(filter._id);
            if (existing && existing.expiresAt > filter.expiresAt.$lte)
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            const next = { _id: filter._id, ...update.$set } as ReservationRecord;
            reservationRecords.set(filter._id, next);
            return next;
        },
        deleteOne: async (filter: { _id: string; token: string }) => {
            const existing = reservationRecords.get(filter._id);
            if (existing?.token === filter.token) reservationRecords.delete(filter._id);
            return {} as never;
        },
    } as any;
    let reservedAccountCreations = 0;
    let reservedVerificationEmails = 0;
    const attemptReservedSignup = async (email: string) => {
        try {
            return await withSignupEmailReservation(
                email,
                async () => {
                    reservedAccountCreations += 1;
                    reservedVerificationEmails += 1;
                    return true;
                },
                reservationCollection,
            );
        } catch {
            return false;
        }
    };
    const duplicateResults = await Promise.all([
        attemptReservedSignup("First.Last+one@gmail.com"),
        attemptReservedSignup("firstlast+two@googlemail.com"),
    ]);
    assert.equal(duplicateResults.filter(Boolean).length, 1, "Gmail variants collide on one atomic reservation");
    assert.equal(reservedAccountCreations, 1, "concurrent duplicates cannot both reach account creation");
    assert.equal(reservedVerificationEmails, 1, "concurrent duplicates cannot both reach verification email sending");

    await assert.rejects(
        withSignupEmailReservation(
            "retry@example.com",
            async () => {
                throw new Error("account creation failed");
            },
            reservationCollection,
        ),
        /account creation failed/,
    );
    assert.ok(
        await reserveSignupEmail("retry@example.com", reservationCollection),
        "a failed account-creation path can release its reservation for retry",
    );

    const concurrentEmailRecords = new Map<string, { _id: string; count: number; expiresAt: Date }>();
    const concurrentEmailCollection = {
        ...concurrentRateCollection,
        findOneAndUpdate: async (filter: { _id: string; count: { $lt: number } }, update: any) => {
            const existing = concurrentEmailRecords.get(filter._id);
            if (existing && existing.count >= filter.count.$lt)
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            const next = existing ?? { _id: filter._id, count: 0, expiresAt: update.$setOnInsert.expiresAt };
            next.count += update.$inc.count;
            concurrentEmailRecords.set(filter._id, next);
            return next;
        },
        updateOne: async (filter: { _id: string; count: { $gt: number } }, update: any) => {
            const existing = concurrentEmailRecords.get(filter._id);
            if (existing && existing.count > filter.count.$gt) existing.count += update.$inc.count;
            return {} as never;
        },
    } as any;
    const concurrentEmailResults = await Promise.all(
        Array.from({ length: SIGNUP_EMAIL_LIMIT + 3 }, (_, attempt) =>
            consumeSignupRateLimits(`203.0.113.${attempt}`, "threshold@example.com", concurrentEmailCollection),
        ),
    );
    assert.equal(
        concurrentEmailResults.filter(Boolean).length,
        SIGNUP_EMAIL_LIMIT,
        "concurrent requests cannot exceed the atomic email threshold",
    );

    console.log("signup security tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
