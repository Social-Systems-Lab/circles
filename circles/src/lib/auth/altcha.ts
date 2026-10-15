import { verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import type { Payload } from "altcha-lib/types";
import crypto from "crypto";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/data/db";

type AltchaChallengeRecord = { challengeHash: string; expiresAt: Date };
export const ALTCHA_COST = 10_000;
export type AltchaChallengeCollection = Pick<
    Collection<AltchaChallengeRecord>,
    "findOneAndDelete" | "insertOne" | "createIndex"
>;

async function challengeCollection(): Promise<AltchaChallengeCollection> {
    const collection = (await getDb()).collection<AltchaChallengeRecord>("signupAltchaChallenges");
    await collection.createIndex({ challengeHash: 1 }, { unique: true });
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return collection;
}

function challengeHash(challenge: Payload["challenge"]): string {
    return crypto.createHash("sha256").update(JSON.stringify(challenge)).digest("hex");
}

export async function storeAltchaChallenge(
    challenge: Payload["challenge"],
    expiresAt: Date,
    collection?: AltchaChallengeCollection,
) {
    const records = collection ?? (await challengeCollection());
    await records.insertOne({ challengeHash: challengeHash(challenge), expiresAt });
}

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

export async function verifyAltchaPayload(
    payload: string | undefined,
    collection?: AltchaChallengeCollection,
    now = new Date(),
): Promise<boolean> {
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
        if (!result.verified) return false;
        const records = collection ?? (await challengeCollection());
        const consumed = await records.findOneAndDelete({
            challengeHash: challengeHash(parsed.challenge),
            expiresAt: { $gt: now },
        });
        return Boolean(consumed);
    } catch (err) {
        console.error("[ALTCHA] verify failed:", err);
        return false;
    }
}
