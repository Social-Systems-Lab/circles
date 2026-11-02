import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ObjectId } from "mongodb";
import {
    authorizePendingRegistrationChallenge,
    beginPendingRegistration,
    correctPendingRegistrationEmail,
    hashPendingRegistrationSecret,
    PENDING_REGISTRATION_LIFETIME_MS,
    provisionPendingRegistration,
    reservePendingRegistrationDid,
    resendPendingRegistrationVerification,
    resumePendingRegistration,
    validatePendingRedirect,
    verifyPendingRegistrationEmail,
    type PendingRegistration,
    type PendingRegistrationCollections,
    type PendingRegistrationDependencies,
    type ProvisionedPendingAccount,
} from "@/lib/auth/pending-registration";

process.env.PENDING_REGISTRATION_TOKEN_HMAC_KEY = "pending-registration-test-secret";

const valueAt = (value: any, path: string) => path.split(".").reduce((current, key) => current?.[key], value);
const equal = (left: any, right: any) =>
    left instanceof ObjectId || right instanceof ObjectId ? String(left) === String(right) : left === right;
const matches = (record: any, filter: any): boolean =>
    Object.entries(filter).every(([key, expected]: [string, any]) => {
        if (key === "$or") return expected.some((clause: any) => matches(record, clause));
        if (key === "$and") return expected.every((clause: any) => matches(record, clause));
        const actual = valueAt(record, key);
        if (key === "$in") return expected.includes(actual);
        if (
            expected &&
            typeof expected === "object" &&
            !(expected instanceof Date) &&
            !(expected instanceof ObjectId)
        ) {
            if ("$gt" in expected && !(actual > expected.$gt)) return false;
            if ("$lte" in expected && !(actual <= expected.$lte)) return false;
            if ("$lt" in expected && !(actual < expected.$lt)) return false;
            if ("$type" in expected && expected.$type === "string" && typeof actual !== "string") return false;
            return true;
        }
        return equal(actual, expected);
    });

function applyUpdate(record: any, update: any, inserting = false) {
    if (inserting && update.$setOnInsert) Object.assign(record, update.$setOnInsert);
    if (update.$set) Object.assign(record, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete record[key];
    for (const [key, amount] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + Number(amount);
}

function createHarness(now = new Date("2026-11-01T12:00:00.000Z")) {
    const registrations: PendingRegistration[] = [];
    const rates: any[] = [];
    const audits: any[] = [];
    const sent: Array<{ to: string; verificationUrl: string }> = [];
    const accounts = new Map<string, ProvisionedPendingAccount>();
    let provisionCalls = 0;
    let finalizeCalls = 0;
    let permanentExists = false;
    let provisioningFailure:
        | "none"
        | "before_did_reservation"
        | "after_credentials"
        | "after_mongo"
        | "after_membership" = "none";
    const reservedDids = new Map<string, string>();
    const credentialDirectories = new Set<string>();
    const memberships = new Set<string>();

    const registrationCollection = {
        async createIndex() {
            return "index";
        },
        async insertOne(record: PendingRegistration) {
            if (
                registrations.some(
                    (item) =>
                        item.normalizedEmail === record.normalizedEmail ||
                        item.requestedHandle === record.requestedHandle,
                )
            ) {
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            }
            registrations.push({ ...record });
            return { acknowledged: true, insertedId: record._id };
        },
        async findOne(filter: any) {
            return registrations.find((item) => matches(item, filter)) || null;
        },
        async findOneAndUpdate(filter: any, update: any, options: any) {
            const record = registrations.find((item) => matches(item, filter));
            if (!record) return null;
            if (
                update.$set?.normalizedEmail &&
                registrations.some((item) => item !== record && item.normalizedEmail === update.$set.normalizedEmail)
            ) {
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            }
            applyUpdate(record, update);
            return options?.returnDocument === "after" ? { ...record } : null;
        },
        async updateOne(filter: any, update: any) {
            const record = registrations.find((item) => matches(item, filter));
            if (!record) return { matchedCount: 0 };
            applyUpdate(record, update);
            return { matchedCount: 1 };
        },
    };
    const rateCollection = {
        async createIndex() {
            return "index";
        },
        async findOneAndUpdate(filter: any, update: any) {
            let record = rates.find((item) => item._id === filter._id);
            if (record && !matches(record, filter)) return null;
            if (!record) {
                record = { _id: filter._id, count: 0 };
                applyUpdate(record, update, true);
                rates.push(record);
            } else applyUpdate(record, update);
            return structuredClone(record);
        },
    };
    const auditCollection = {
        async createIndex() {
            return "index";
        },
        async insertOne(record: any) {
            audits.push(structuredClone(record));
            return { acknowledged: true, insertedId: new ObjectId() };
        },
    };
    const collections = {
        registrations: registrationCollection,
        rateLimits: rateCollection,
        auditEvents: auditCollection,
    } as unknown as PendingRegistrationCollections;
    const deps: PendingRegistrationDependencies = {
        collections,
        baseUrl: "https://staging.kamooni.example",
        now: () => now,
        sendVerificationEmail: async ({ to, verificationUrl }) => {
            sent.push({ to, verificationUrl });
        },
        permanentAccountExists: async () => permanentExists,
        findAccountByPendingRegistrationId: async (id) => accounts.get(id) || null,
        provisionAccount: async ({ pendingRegistrationId }) => {
            if (provisioningFailure === "before_did_reservation") throw new Error("interrupted before DID generation");
            provisionCalls += 1;
            const generatedDid = `did-${pendingRegistrationId}-${provisionCalls}`;
            const reservedDid = reservedDids.get(pendingRegistrationId);
            if (reservedDid && reservedDid !== generatedDid) {
                throw new Error("retry must not replace a reserved identity");
            }
            reservedDids.set(pendingRegistrationId, generatedDid);
            credentialDirectories.add(generatedDid);
            if (provisioningFailure === "after_credentials") throw new Error("interrupted after credentials");
            const account = { accountId: `account-${pendingRegistrationId}`, did: generatedDid };
            if (provisioningFailure === "after_mongo" || provisioningFailure === "after_membership") {
                accounts.set(pendingRegistrationId, account);
                if (provisioningFailure === "after_membership") memberships.add(account.accountId);
                throw new Error(`interrupted ${provisioningFailure}`);
            }
            accounts.set(pendingRegistrationId, account);
            memberships.add(account.accountId);
            return account;
        },
        finalizeAccount: async (account) => {
            finalizeCalls += 1;
            memberships.add(account.accountId);
        },
    };
    return {
        deps,
        registrations,
        sent,
        audits,
        accounts,
        reservedDids,
        credentialDirectories,
        memberships,
        get provisionCalls() {
            return provisionCalls;
        },
        get finalizeCalls() {
            return finalizeCalls;
        },
        setPermanentExists(value: boolean) {
            permanentExists = value;
        },
        setProvisioningFailure(value: typeof provisioningFailure) {
            provisioningFailure = value;
        },
        advance(ms: number) {
            now = new Date(now.getTime() + ms);
        },
    };
}

const validInput = {
    name: "Pending Person",
    email: "pending@example.invalid",
    requestedHandle: "pending-person",
    redirectTo: "/circles/example/community?compose=1",
    clientIp: "203.0.113.10",
    altcha: "valid-altcha",
};

const tokenFrom = (url: string) => new URL(url).searchParams.get("token")!;

async function createPending(harness: ReturnType<typeof createHarness>, overrides: Partial<typeof validInput> = {}) {
    const result = await beginPendingRegistration({ ...validInput, ...overrides }, harness.deps, {
        enabled: true,
        registrationModeAllows: async () => true,
        verifyAltcha: async () => true,
    });
    if (!result.enabled) throw new Error("Pending registration test harness unexpectedly disabled registration");
    return result;
}

async function main() {
    const activeSignupSource = readFileSync("src/components/forms/signup/actions.ts", "utf8");
    assert.doesNotMatch(
        activeSignupSource,
        /pending-registration/,
        "disabled backend is not wired into the current production signup action",
    );
    assert.equal(validatePendingRedirect("/safe/path?next=1"), "/safe/path?next=1");
    for (const unsafe of ["https://evil.example/", "//evil.example/", "javascript:alert(1)", "/\\evil"]) {
        assert.equal(validatePendingRedirect(unsafe), null, `unsafe redirect is rejected: ${unsafe}`);
    }

    {
        const harness = createHarness();
        const disabled = await beginPendingRegistration(validInput, harness.deps, {
            enabled: false,
            verifyAltcha: async () => {
                throw new Error("must not run");
            },
        });
        assert.deepEqual(disabled, { enabled: false }, "disabled flag leaves the new backend inert");
        assert.equal(harness.registrations.length, 0);
    }

    {
        const routedToLegacy = createHarness();
        const disabled = await beginPendingRegistration(validInput, routedToLegacy.deps, {
            enabled: true,
            registrationModeAllows: async () => false,
            verifyAltcha: async () => {
                throw new Error("ALTCHA must not run for an inactive route");
            },
        });
        assert.deepEqual(disabled, { enabled: false }, "legacy routing keeps pending registration inert");
        assert.equal(routedToLegacy.registrations.length, 0);
    }

    {
        const harness = createHarness();
        await beginPendingRegistration(validInput, harness.deps, {
            enabled: true,
            registrationModeAllows: async () => true,
            verifyAltcha: async () => false,
        });
        assert.equal(harness.registrations.length, 0, "ALTCHA rejection creates no pending record");
        assert.equal(harness.provisionCalls, 0, "ALTCHA rejection creates no permanent account");
    }

    const harness = createHarness();
    const started = await createPending(harness);
    assert.equal(started.enabled, true);
    assert.equal(harness.registrations.length, 1, "successful start creates one lightweight pending record");
    assert.equal(harness.provisionCalls, 0, "pending signup creates no permanent account");
    assert.equal(
        JSON.stringify(harness.registrations).includes("password"),
        false,
        "pending record contains no password field",
    );
    assert.equal(
        harness.registrations[0].expiresAt!.getTime() - harness.registrations[0].createdAt.getTime(),
        PENDING_REGISTRATION_LIFETIME_MS,
        "pending registration expires after 48 hours",
    );
    assert.equal(
        await resumePendingRegistration(started.pendingRegistrationId, started.continuationSecret, harness.deps).then(
            (r) => r.success,
        ),
        true,
    );

    const firstToken = tokenFrom(harness.sent[0].verificationUrl);
    harness.advance(61_000);
    await resendPendingRegistrationVerification(
        {
            pendingRegistrationId: started.pendingRegistrationId,
            continuationSecret: started.continuationSecret,
            clientIp: validInput.clientIp,
        },
        harness.deps,
    );
    const secondToken = tokenFrom(harness.sent[1].verificationUrl);
    assert.notEqual(secondToken, firstToken, "resend rotates the verification token");
    assert.equal(
        (await verifyPendingRegistrationEmail(firstToken, harness.deps)).success,
        false,
        "rotated token is invalid",
    );

    await correctPendingRegistrationEmail(
        {
            pendingRegistrationId: started.pendingRegistrationId,
            continuationSecret: started.continuationSecret,
            newEmail: "corrected@example.invalid",
            clientIp: validInput.clientIp,
        },
        harness.deps,
    );
    const correctedToken = tokenFrom(harness.sent[2].verificationUrl);
    assert.equal(
        (await verifyPendingRegistrationEmail(secondToken, harness.deps)).success,
        false,
        "email correction invalidates prior links",
    );
    const verified = await verifyPendingRegistrationEmail(correctedToken, harness.deps);
    assert.equal(verified.success, true);
    assert.equal(
        (await verifyPendingRegistrationEmail(correctedToken, harness.deps)).success,
        false,
        "verification token is single-use",
    );

    const [firstProvision, concurrentProvision] = await Promise.all([
        provisionPendingRegistration(
            {
                pendingRegistrationId: verified.pendingRegistrationId!,
                verifiedContinuationSecret: verified.verifiedContinuationSecret!,
                password: "secure-password",
            },
            harness.deps,
        ),
        provisionPendingRegistration(
            {
                pendingRegistrationId: verified.pendingRegistrationId!,
                verifiedContinuationSecret: verified.verifiedContinuationSecret!,
                password: "secure-password",
            },
            harness.deps,
        ),
    ]);
    assert.equal(firstProvision.success || concurrentProvision.success, true);
    assert.equal(harness.provisionCalls, 1, "concurrent provisioning creates exactly one permanent account");
    assert.ok(harness.finalizeCalls >= 1, "the provisioned account is finalized");
    const retry = await provisionPendingRegistration(
        {
            pendingRegistrationId: verified.pendingRegistrationId!,
            verifiedContinuationSecret: verified.verifiedContinuationSecret!,
            password: "secure-password",
        },
        harness.deps,
    );
    assert.equal(retry.success, false, "consumed continuation cannot authorize a repeated completion request");

    {
        const reservation = createHarness();
        const pending = await createPending(reservation, {
            email: "reservation@example.invalid",
            requestedHandle: "reservation-test",
        });
        const proof = await verifyPendingRegistrationEmail(
            tokenFrom(reservation.sent[0].verificationUrl),
            reservation.deps,
        );
        const record = reservation.registrations[0];
        record.status = "provisioning";
        assert.equal(
            await reservePendingRegistrationDid(proof.pendingRegistrationId!, "reserved-did", reservation.deps),
            true,
        );
        assert.equal(record.reservedDid, "reserved-did");
        assert.equal(record.expiresAt, undefined, "reserved identities are excluded from TTL cleanup");
        assert.ok(record.reconciliationRequiredAt, "reserved identities are marked for operator reconciliation");
        assert.equal(
            await reservePendingRegistrationDid(proof.pendingRegistrationId!, "reserved-did", reservation.deps),
            true,
            "reserving the same DID is idempotent",
        );
        assert.equal(
            await reservePendingRegistrationDid(proof.pendingRegistrationId!, "different-did", reservation.deps),
            false,
            "a retry cannot replace a reserved DID",
        );
        assert.equal(record.reservedDid, "reserved-did");
    }

    for (const failure of ["before_did_reservation", "after_credentials"] as const) {
        const orphaned = createHarness();
        const pending = await createPending(orphaned, {
            email: `${failure}@example.invalid`,
            requestedHandle: failure === "after_credentials" ? "after-credentials" : "before-reserve",
        });
        const proof = await verifyPendingRegistrationEmail(tokenFrom(orphaned.sent[0].verificationUrl), orphaned.deps);
        orphaned.setProvisioningFailure(failure);
        assert.equal(
            (
                await provisionPendingRegistration(
                    {
                        pendingRegistrationId: proof.pendingRegistrationId!,
                        verifiedContinuationSecret: proof.verifiedContinuationSecret!,
                        password: "secure-password",
                    },
                    orphaned.deps,
                )
            ).success,
            false,
        );
        assert.equal(
            orphaned.reservedDids.size,
            failure === "before_did_reservation" ? 0 : 1,
            `${failure} has the expected DID reservation boundary`,
        );
        assert.equal(
            orphaned.credentialDirectories.size,
            failure === "after_credentials" ? 1 : 0,
            `${failure} has the expected filesystem boundary`,
        );
        orphaned.setProvisioningFailure("none");
        orphaned.advance(2 * 60 * 1000 + 1);
        assert.equal(
            (
                await provisionPendingRegistration(
                    {
                        pendingRegistrationId: proof.pendingRegistrationId!,
                        verifiedContinuationSecret: proof.verifiedContinuationSecret!,
                        password: "secure-password",
                    },
                    orphaned.deps,
                )
            ).success,
            false,
            `${failure} retry fails closed instead of silently creating a different DID`,
        );
        assert.equal(orphaned.accounts.size, 0, `${failure} creates no mismatched permanent account`);
        assert.equal(
            orphaned.reservedDids.size,
            failure === "before_did_reservation" ? 0 : 1,
            `${failure} preserves the reservation boundary`,
        );
    }

    for (const failure of ["after_mongo", "after_membership"] as const) {
        const interrupted = createHarness();
        const pending = await createPending(interrupted, {
            email: `${failure}@example.invalid`,
            requestedHandle: failure.replaceAll("_", "-"),
        });
        const proof = await verifyPendingRegistrationEmail(
            tokenFrom(interrupted.sent[0].verificationUrl),
            interrupted.deps,
        );
        interrupted.setProvisioningFailure(failure);
        const first = await provisionPendingRegistration(
            {
                pendingRegistrationId: proof.pendingRegistrationId!,
                verifiedContinuationSecret: proof.verifiedContinuationSecret!,
                password: "secure-password",
            },
            interrupted.deps,
        );
        assert.equal(first.success, false);
        const originalDid = interrupted.accounts.get(proof.pendingRegistrationId!)!.did;
        interrupted.setProvisioningFailure("none");
        const replay = await provisionPendingRegistration(
            {
                pendingRegistrationId: proof.pendingRegistrationId!,
                verifiedContinuationSecret: proof.verifiedContinuationSecret!,
                password: "secure-password",
            },
            interrupted.deps,
        );
        assert.equal(replay.success, false, `${failure} cannot replay the consumed continuation`);
        assert.equal(interrupted.provisionCalls, 1, `${failure} replay does not create a second account`);
        assert.equal(interrupted.accounts.get(proof.pendingRegistrationId!)!.did, originalDid);
        assert.equal(
            interrupted.memberships.has(`account-${proof.pendingRegistrationId}`),
            failure === "after_membership",
            `${failure} records the observed membership boundary without granting replay recovery`,
        );
        assert.equal(
            await verifyPendingRegistrationEmail(tokenFrom(interrupted.sent[0].verificationUrl), interrupted.deps).then(
                (result) => result.success,
            ),
            false,
            `${failure} cannot reuse the consumed original verification link`,
        );
    }

    {
        const restart = createHarness();
        const pending = await createPending(restart, {
            email: "fresh-recovery@example.invalid",
            requestedHandle: "fresh-recovery",
        });
        const originalToken = tokenFrom(restart.sent[0].verificationUrl);
        const firstVerification = await verifyPendingRegistrationEmail(originalToken, restart.deps);
        assert.equal(firstVerification.success, true);
        restart.setProvisioningFailure("before_did_reservation");
        const interrupted = await provisionPendingRegistration(
            {
                pendingRegistrationId: firstVerification.pendingRegistrationId!,
                verifiedContinuationSecret: firstVerification.verifiedContinuationSecret!,
                password: "secure-password",
            },
            restart.deps,
        );
        assert.equal(interrupted.success, false);
        const attemptsBeforeRetry = restart.provisionCalls;
        assert.equal(
            restart.reservedDids.has(firstVerification.pendingRegistrationId!),
            false,
            "pre-DID injected interruption reserves no identity",
        );
        assert.equal(restart.accounts.has(firstVerification.pendingRegistrationId!), false);
        restart.setProvisioningFailure("none");
        restart.advance(2 * 60 * 1000 + 61_000);
        await resendPendingRegistrationVerification(
            {
                pendingRegistrationId: pending.pendingRegistrationId,
                continuationSecret: pending.continuationSecret,
                clientIp: validInput.clientIp,
            },
            restart.deps,
        );
        assert.equal(restart.sent.length, 2, "fresh email authorization sends a new verification link");
        assert.equal((await verifyPendingRegistrationEmail(originalToken, restart.deps)).success, false);
        const freshVerification = await verifyPendingRegistrationEmail(
            tokenFrom(restart.sent[1].verificationUrl),
            restart.deps,
        );
        assert.equal(freshVerification.success, true);
        assert.equal(restart.finalizeCalls, 0, "email verification alone creates no session/finalization");
        const completed = await provisionPendingRegistration(
            {
                pendingRegistrationId: freshVerification.pendingRegistrationId!,
                verifiedContinuationSecret: freshVerification.verifiedContinuationSecret!,
                password: "secure-password",
            },
            restart.deps,
        );
        assert.equal(completed.success, true, "unreserved expired attempt may restart after fresh verification");
        assert.equal(restart.provisionCalls, attemptsBeforeRetry + 1, "fresh authorization invokes provisioning once");
        assert.equal(restart.accounts.size, 1, "fresh authorization creates exactly one permanent account");
        assert.equal(restart.reservedDids.size, 1, "successful retry reserves exactly one DID");
    }

    {
        const resendStates = createHarness();
        const pending = await createPending(resendStates, {
            email: "resend-states@example.invalid",
            requestedHandle: "resend-states",
        });
        await resendPendingRegistrationVerification(
            {
                pendingRegistrationId: pending.pendingRegistrationId,
                continuationSecret: pending.continuationSecret,
                clientIp: "192.0.2.8",
            },
            resendStates.deps,
        );
        assert.equal(resendStates.sent.length, 1, "resend cooldown blocks immediate resend");
        resendStates.advance(61_000);
        await resendPendingRegistrationVerification(
            {
                pendingRegistrationId: pending.pendingRegistrationId,
                continuationSecret: pending.continuationSecret,
                clientIp: "192.0.2.8",
            },
            resendStates.deps,
        );
        assert.equal(resendStates.sent.length, 2, "resend becomes available after cooldown");
        const proof = await verifyPendingRegistrationEmail(
            tokenFrom(resendStates.sent[1].verificationUrl),
            resendStates.deps,
        );
        resendStates.registrations[0].status = "provisioning";
        resendStates.registrations[0].reservedDid = "reserved-did";
        resendStates.advance(2 * 60 * 1000);
        await resendPendingRegistrationVerification(
            {
                pendingRegistrationId: pending.pendingRegistrationId,
                continuationSecret: pending.continuationSecret,
                clientIp: "192.0.2.8",
            },
            resendStates.deps,
        );
        assert.equal(resendStates.sent.length, 2, "reserved-DID state cannot be reset by resend");
        assert.equal(proof.success, true);
    }

    {
        const duplicates = createHarness();
        await Promise.all([createPending(duplicates), createPending(duplicates)]);
        assert.equal(duplicates.registrations.length, 1, "duplicate email/handle race creates one pending record");
        duplicates.setPermanentExists(true);
        const response = await createPending(duplicates, {
            email: "existing@example.invalid",
            requestedHandle: "existing-person",
        });
        assert.equal(response.enabled, true, "existing-account response remains generic");
        assert.equal(duplicates.registrations.length, 1, "existing account creates no pending record");

        const handleRace = createHarness();
        await Promise.all([
            createPending(handleRace, { email: "first@example.invalid", requestedHandle: "shared-handle" }),
            createPending(handleRace, { email: "second@example.invalid", requestedHandle: "shared-handle" }),
        ]);
        assert.equal(handleRace.registrations.length, 1, "duplicate handle race creates one pending record");
    }

    {
        const limited = createHarness();
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await createPending(limited, {
                email: `person-${attempt}@example.invalid`,
                requestedHandle: `person-${attempt}`,
            });
        }
        await createPending(limited, { email: "blocked@example.invalid", requestedHandle: "blocked-person" });
        assert.equal(limited.registrations.length, 5, "distributed IP rate limit blocks excess starts");

        const challenges = createHarness();
        for (let attempt = 0; attempt < 20; attempt += 1) {
            assert.equal(await authorizePendingRegistrationChallenge("192.0.2.55", challenges.deps), true);
        }
        assert.equal(
            await authorizePendingRegistrationChallenge("192.0.2.55", challenges.deps),
            false,
            "challenge issuance has a distributed IP limit",
        );

        const corrections = createHarness();
        const pending = await createPending(corrections, {
            email: "correction-rate@example.invalid",
            requestedHandle: "correction-rate",
        });
        assert.equal(pending.enabled, true);
        for (let attempt = 0; attempt < 4; attempt += 1) {
            await correctPendingRegistrationEmail(
                {
                    pendingRegistrationId: pending.pendingRegistrationId,
                    continuationSecret: pending.continuationSecret,
                    newEmail: `corrected-${attempt}@example.invalid`,
                    clientIp: "192.0.2.80",
                },
                corrections.deps,
            );
        }
        assert.equal(
            corrections.sent.length,
            4,
            "correction limit allows three correction emails after the initial email",
        );
    }

    {
        const expired = createHarness();
        const pending = await createPending(expired, {
            email: "expired@example.invalid",
            requestedHandle: "expired-person",
        });
        assert.equal(pending.enabled, true);
        const token = tokenFrom(expired.sent[0].verificationUrl);
        expired.advance(31 * 60 * 1000);
        assert.equal(
            (await verifyPendingRegistrationEmail(token, expired.deps)).success,
            false,
            "expired verification token fails",
        );
        assert.equal(
            (await resumePendingRegistration(pending.pendingRegistrationId, "wrong-secret", expired.deps)).success,
            false,
            "resume requires possession secret",
        );
    }

    assert.ok(
        harness.audits.every((event) => !JSON.stringify(event).includes("secure-password")),
        "audit events contain no password",
    );
    assert.ok(
        harness.audits.every((event) => !JSON.stringify(event).includes(correctedToken)),
        "audit events contain no raw token",
    );
    console.log("pending-registration tests passed");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
