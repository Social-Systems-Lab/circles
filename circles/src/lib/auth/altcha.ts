import { verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import type { Payload } from "altcha-lib/types";

function parseAltchaPayload(payload: string): Payload | null {
    try {
        const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
        if (!parsed || typeof parsed !== "object" || !parsed.challenge || !parsed.solution) {
            return null;
        }
        return parsed as Payload;
    } catch {
        return null;
    }
}

export async function verifyAltchaPayload(payload: string | undefined): Promise<boolean> {
    const hmacKey = process.env.ALTCHA_HMAC_KEY;
    if (!hmacKey || !payload) return false;
    try {
        const parsed = parseAltchaPayload(payload);
        if (!parsed) return false;
        const result = await verifySolution({
            challenge: parsed.challenge,
            deriveKey,
            hmacSignatureSecret: hmacKey,
            solution: parsed.solution,
        });
        return result.verified;
    } catch (err) {
        console.error("[ALTCHA] verify failed:", err);
        return false;
    }
}
