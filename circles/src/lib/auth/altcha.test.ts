import assert from "node:assert/strict";
import { createChallenge, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import type { AltchaChallengeCollection } from "@/lib/auth/altcha";
// @ts-expect-error Bun provides module mocking at runtime; this repository does not install Bun type declarations.
import { mock } from "bun:test";

const originalKey = process.env.ALTCHA_HMAC_KEY;
const hmacKey = "baseline-test-secret";
process.env.ALTCHA_HMAC_KEY = hmacKey;

const encodePayload = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

mock.module("@/lib/data/db", () => ({
    getDb: async () => {
        throw new Error("ALTCHA unit tests must use their injected collection");
    },
}));

async function main() {
    const { storeAltchaChallenge, verifyAltchaPayload } = await import("@/lib/auth/altcha");
    const records = new Map<string, { challengeHash: string; expiresAt: Date }>();
    const collection = {
        async createIndex() {
            return "test-index";
        },
        async insertOne(record: { challengeHash: string; expiresAt: Date }) {
            records.set(record.challengeHash, record);
            return { acknowledged: true };
        },
        async findOneAndDelete(filter: { challengeHash: string; expiresAt: { $gt: Date } }) {
            const record = records.get(filter.challengeHash);
            if (!record || record.expiresAt <= filter.expiresAt.$gt) return null;
            records.delete(filter.challengeHash);
            return record;
        },
    } as unknown as AltchaChallengeCollection;

    assert.equal(await verifyAltchaPayload(undefined), false, "missing payload fails closed");
    assert.equal(await verifyAltchaPayload("not-base64-json"), false, "malformed payload fails closed");
    assert.equal(
        await verifyAltchaPayload(encodePayload({ challenge: {}, solution: null })),
        false,
        "incomplete payload fails closed",
    );

    const challenge = await createChallenge({
        algorithm: "PBKDF2/SHA-256",
        cost: 1,
        counter: 7,
        keyPrefixLength: 2,
        deriveKey,
        expiresAt: new Date(Date.now() + 60_000),
        hmacSignatureSecret: hmacKey,
    });
    const solution = await solveChallenge({ challenge, deriveKey, timeout: 5_000 });
    assert.ok(solution, "the deterministic challenge is solvable");

    const payload = encodePayload({ challenge, solution });
    await storeAltchaChallenge(challenge, new Date(Date.now() + 60_000), collection);
    assert.equal(await verifyAltchaPayload(payload, collection), true, "a signed stored solved challenge succeeds");
    assert.equal(await verifyAltchaPayload(payload, collection), false, "a consumed challenge cannot be replayed");

    const tampered = structuredClone(challenge);
    tampered.parameters.cost += 1;
    assert.equal(
        await verifyAltchaPayload(encodePayload({ challenge: tampered, solution }), collection),
        false,
        "tampering with signed challenge parameters fails",
    );

    process.env.ALTCHA_HMAC_KEY = "wrong-secret";
    assert.equal(await verifyAltchaPayload(payload, collection), false, "a challenge signed with another key fails");

    console.log("ALTCHA tests passed");
}

main()
    .finally(() => {
        if (originalKey === undefined) delete process.env.ALTCHA_HMAC_KEY;
        else process.env.ALTCHA_HMAC_KEY = originalKey;
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
