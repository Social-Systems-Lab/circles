import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { verifyAltchaPayload } from "@/lib/auth/altcha";
import { setEnv, snapshotEnv } from "@/test/env";
import { GET } from "./route";

const restoreEnv = snapshotEnv("ALTCHA_HMAC_KEY");

beforeEach(() => setEnv("ALTCHA_HMAC_KEY", "challenge-test-key"));
afterEach(() => {
    setSystemTime();
    restoreEnv();
});

describe("GET /api/altcha/challenge", () => {
    test("fails with a 500 when ALTCHA is not configured", async () => {
        setEnv("ALTCHA_HMAC_KEY", undefined);

        const response = await GET();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "ALTCHA not configured" });
    });

    test("treats an empty key as not configured", async () => {
        setEnv("ALTCHA_HMAC_KEY", "");

        expect((await GET()).status).toBe(500);
    });

    test("issues a signed PBKDF2/SHA-256 challenge", async () => {
        const response = await GET();
        const challenge = await response.json();

        expect(response.status).toBe(200);
        expect(challenge.parameters).toMatchObject({ algorithm: "PBKDF2/SHA-256", cost: 5000, keyLength: 32 });
        expect(challenge.parameters.nonce).toMatch(/^[0-9a-f]+$/);
        expect(challenge.parameters.salt).toMatch(/^[0-9a-f]+$/);
        expect(challenge.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    test("expires the challenge ten minutes from now", async () => {
        const now = new Date("2026-06-15T12:00:00.000Z");
        setSystemTime(now);

        const { parameters } = await (await GET()).json();

        expect(parameters.expiresAt).toBe(Math.floor((now.getTime() + 10 * 60 * 1000) / 1000));
    });

    test("issues a fresh challenge each time", async () => {
        const first = await (await GET()).json();
        const second = await (await GET()).json();

        expect(first.parameters.nonce).not.toBe(second.parameters.nonce);
        expect(first.signature).not.toBe(second.signature);
    });

    test("issues a challenge that verifyAltchaPayload accepts once solved", async () => {
        const challenge = await (await GET()).json();
        const solution = await solveChallenge({ challenge, deriveKey });
        expect(solution).not.toBeNull();

        const payload = Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");

        expect(await verifyAltchaPayload(payload)).toBe(true);
    });

    test("issues a challenge that is rejected when the server key changes afterwards", async () => {
        const challenge = await (await GET()).json();
        const solution = await solveChallenge({ challenge, deriveKey });
        setEnv("ALTCHA_HMAC_KEY", "a-different-key");

        const payload = Buffer.from(JSON.stringify({ challenge, solution })).toString("base64");

        expect(await verifyAltchaPayload(payload)).toBe(false);
    });
});
