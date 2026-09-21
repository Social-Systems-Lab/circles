import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createChallenge, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { setEnv, snapshotEnv } from "@/test/env";
import { silenceConsole } from "@/test/hooks";
import { verifyAltchaPayload } from "./altcha";

const HMAC_KEY = "test-hmac-key";
const restoreEnv = snapshotEnv("ALTCHA_HMAC_KEY");

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

// A minimal cost keeps the real proof-of-work quick while exercising the real verification path.
const buildPayload = async ({ hmacKey = HMAC_KEY, expiresAt }: { hmacKey?: string; expiresAt?: Date } = {}) => {
    const challenge = await createChallenge({
        algorithm: "PBKDF2/SHA-256",
        cost: 2,
        deriveKey,
        expiresAt,
        hmacSignatureSecret: hmacKey,
    });
    const solution = await solveChallenge({ challenge, deriveKey });
    expect(solution).not.toBeNull();
    return { challenge, solution };
};

const consoleSpy = silenceConsole("error");

beforeEach(() => {
    setEnv("ALTCHA_HMAC_KEY", HMAC_KEY);
});

afterEach(() => {
    restoreEnv();
});

describe("verifyAltchaPayload", () => {
    test("accepts a correctly solved challenge signed with the server key", async () => {
        const payload = encode(await buildPayload());
        expect(await verifyAltchaPayload(payload)).toBe(true);
    });

    test("rejects when the server has no HMAC key configured", async () => {
        const payload = encode(await buildPayload());
        setEnv("ALTCHA_HMAC_KEY", undefined);

        expect(await verifyAltchaPayload(payload)).toBe(false);
    });

    test("rejects when the HMAC key is empty", async () => {
        const payload = encode(await buildPayload());
        setEnv("ALTCHA_HMAC_KEY", "");

        expect(await verifyAltchaPayload(payload)).toBe(false);
    });

    test("rejects a missing or empty payload", async () => {
        expect(await verifyAltchaPayload(undefined)).toBe(false);
        expect(await verifyAltchaPayload("")).toBe(false);
    });

    test("rejects a challenge signed with a different key", async () => {
        const payload = encode(await buildPayload({ hmacKey: "someone-elses-key" }));
        expect(await verifyAltchaPayload(payload)).toBe(false);
    });

    test("rejects an expired challenge", async () => {
        const payload = encode(await buildPayload({ expiresAt: new Date(Date.now() - 60_000) }));
        expect(await verifyAltchaPayload(payload)).toBe(false);
    });

    test("accepts a challenge that has not expired yet", async () => {
        const payload = encode(await buildPayload({ expiresAt: new Date(Date.now() + 60_000) }));
        expect(await verifyAltchaPayload(payload)).toBe(true);
    });

    test("rejects a wrong solution", async () => {
        const { challenge, solution } = await buildPayload();
        const wrong = { ...solution, counter: (solution?.counter ?? 0) + 1 };

        expect(await verifyAltchaPayload(encode({ challenge, solution: wrong }))).toBe(false);
    });

    test("rejects a tampered challenge", async () => {
        const { challenge, solution } = await buildPayload();
        const tampered = { ...challenge, parameters: { ...challenge.parameters, cost: 1 } };

        expect(await verifyAltchaPayload(encode({ challenge: tampered, solution }))).toBe(false);
    });

    test("rejects payloads that are not base64 encoded JSON", async () => {
        expect(await verifyAltchaPayload("not base64 json")).toBe(false);
        expect(await verifyAltchaPayload(Buffer.from("plain text").toString("base64"))).toBe(false);
    });

    test.each([
        ["null", null],
        ["a string", "text"],
        ["an array", []],
        ["an empty object", {}],
        ["a missing solution", { challenge: { parameters: {} } }],
        ["a missing challenge", { solution: { counter: 1 } }],
    ])("rejects a payload that is %s", async (_label, value) => {
        expect(await verifyAltchaPayload(encode(value))).toBe(false);
    });

    test("logs and rejects when verification itself throws", async () => {
        const payload = encode({ challenge: "not-an-object-with-parameters", solution: { counter: 1 } });

        expect(await verifyAltchaPayload(payload)).toBe(false);
        expect(consoleSpy.error).toHaveBeenCalled();
        expect(consoleSpy.error.mock.calls[0][0]).toBe("[ALTCHA] verify failed:");
    });
});
