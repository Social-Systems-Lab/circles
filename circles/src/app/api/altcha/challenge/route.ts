import { createChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { NextResponse } from "next/server";
import { ALTCHA_COST, storeAltchaChallenge } from "@/lib/auth/altcha";

export async function GET() {
    const hmacKey = process.env.ALTCHA_HMAC_KEY;
    if (!hmacKey) {
        return NextResponse.json({ error: "ALTCHA not configured" }, { status: 500 });
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const challenge = await createChallenge({
        algorithm: "PBKDF2/SHA-256",
        cost: ALTCHA_COST,
        deriveKey,
        expiresAt,
        hmacSignatureSecret: hmacKey,
    });
    await storeAltchaChallenge(challenge, expiresAt);
    return NextResponse.json(challenge, { headers: { "Cache-Control": "no-store" } });
}
