import { CapturedEmails, type CapturedEmailDoc } from "@/lib/data/db";

export const CAPTURED_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const CAPTURED_EMAIL_LIST_LIMIT = 50;

let indexReady: Promise<unknown> | null = null;

const ensureTtlIndex = (): Promise<unknown> => {
    if (!indexReady) {
        indexReady = CapturedEmails.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {
            indexReady = null;
            throw new Error("Captured email retention initialization failed.");
        });
    }
    return indexReady;
};

export type CapturedEmailInput = Pick<CapturedEmailDoc, "to" | "templateAlias" | "templateModel">;

export const storeCapturedEmail = async (email: CapturedEmailInput, now: Date = new Date()): Promise<string> => {
    await ensureTtlIndex();
    try {
        const result = await CapturedEmails.insertOne({
            ...email,
            createdAt: now,
            expiresAt: new Date(now.getTime() + CAPTURED_EMAIL_TTL_MS),
        });
        return String(result.insertedId);
    } catch {
        throw new Error("Captured email storage failed.");
    }
};

export const listCapturedEmails = async (now: Date = new Date()) =>
    CapturedEmails.find({ createdAt: { $gt: new Date(now.getTime() - CAPTURED_EMAIL_TTL_MS) } })
        .sort({ createdAt: -1 })
        .limit(CAPTURED_EMAIL_LIST_LIMIT)
        .toArray();
