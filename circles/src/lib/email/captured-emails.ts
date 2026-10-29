import type { Collection } from "mongodb";
import { getDb } from "@/lib/data/db";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { requireCaptureConfiguration } from "./capture-config";
import {
    buildCapturedEmailDocument,
    listUnexpiredCapturedEmails,
    type CapturedEmailDocument,
    type CaptureEmailInput,
} from "./captured-email-storage";

export * from "./captured-email-storage";

export const CAPTURED_EMAIL_COLLECTION = "stagingCapturedEmails";
async function collection(): Promise<Collection<CapturedEmailDocument>> {
    const db = await getDb();
    return db.collection<CapturedEmailDocument>(CAPTURED_EMAIL_COLLECTION);
}

let captureIndexReady: Promise<string> | undefined;

async function ensureDefaultCaptureIndex(emails: Collection<CapturedEmailDocument>): Promise<void> {
    captureIndexReady ??= emails
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "captured_email_expiry" })
        .catch((error) => {
            captureIndexReady = undefined;
            throw error;
        });
    await captureIndexReady;
}

export async function storeCapturedEmail(input: CaptureEmailInput): Promise<void> {
    requireCaptureConfiguration();
    const emails = await collection();
    try {
        await ensureDefaultCaptureIndex(emails);
        await emails.insertOne(buildCapturedEmailDocument(input));
    } catch {
        throw new Error("Captured email persistence failed.");
    }
}

export async function listCapturedEmails(now = new Date()): Promise<CapturedEmailDocument[]> {
    requireCaptureConfiguration();
    await requireSuperAdmin();
    const emails = await collection();
    return listUnexpiredCapturedEmails(emails, now);
}
