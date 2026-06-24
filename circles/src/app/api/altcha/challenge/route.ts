import { createChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { NextResponse } from "next/server";

export async function GET() {
    const hmacKey = process.env.ALTCHA_HMAC_KEY;
    if (!hmacKey) {
        return NextResponse.json({ error: "ALTCHA not configured" }, { status: 500 });
    }
    const challenge = await createChallenge({
        algorithm: "PBKDF2/SHA-256",
        cost: 5000,
        deriveKey,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        hmacSignatureSecret: hmacKey,
    });
    return NextResponse.json(challenge);
}
