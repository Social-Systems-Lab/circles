import type { Collection, ObjectId } from "mongodb";
import { requireCaptureConfiguration } from "./capture-config";

export const DEFAULT_CAPTURE_TTL_MS = 12 * 60 * 60 * 1000;
export const PASSWORD_RESET_CAPTURE_TTL_MS = 60 * 60 * 1000;
export const CAPTURED_EMAIL_LIST_LIMIT = 50;

export type CapturedEmailDocument = {
    _id?: ObjectId;
    to: string;
    templateAlias: string;
    displayName?: string;
    actionUrl?: string;
    createdAt: Date;
    expiresAt: Date;
};

export type CaptureEmailInput = {
    to: string;
    templateAlias: string;
    templateModel: Record<string, unknown>;
};

const cleanDisplayValue = (value: unknown, maximumLength = 120): string | undefined => {
    if (typeof value !== "string") return undefined;
    const cleaned = value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, maximumLength);
    return cleaned || undefined;
};

const TOKEN_EMAIL_ALIASES = new Map([
    ["email-verification", "/verify-email"],
    ["password-reset", "/reset-password"],
]);
const DISALLOWED_NON_TOKEN_QUERY_KEYS = new Set([
    "token",
    "redirect",
    "redirect_uri",
    "returnto",
    "next",
    "url",
    "callback",
]);

export function approvedCapturedActionUrl(
    templateAlias: string,
    candidate: unknown,
    origin: string,
): string | undefined {
    if (typeof candidate !== "string" || !candidate.trim()) return undefined;

    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        if (TOKEN_EMAIL_ALIASES.has(templateAlias)) throw new Error("Captured account-action URL is invalid.");
        return undefined;
    }

    const hasUnsafeAuthority = Boolean(parsed.username || parsed.password);
    const requiredPath = TOKEN_EMAIL_ALIASES.get(templateAlias);
    if (requiredPath) {
        const queryKeys = [...parsed.searchParams.keys()];
        const token = parsed.searchParams.get("token");
        if (
            parsed.origin !== origin ||
            hasUnsafeAuthority ||
            parsed.hash ||
            parsed.pathname !== requiredPath ||
            queryKeys.length !== 1 ||
            queryKeys[0] !== "token" ||
            !token
        ) {
            throw new Error("Captured account-action URL is not an approved staging token URL.");
        }
        return parsed.toString();
    }

    const hasUnsafeQuery = [...parsed.searchParams.keys()].some((key) =>
        DISALLOWED_NON_TOKEN_QUERY_KEYS.has(key.toLowerCase()),
    );
    if (parsed.origin !== origin || hasUnsafeAuthority || parsed.hash || hasUnsafeQuery) return undefined;
    return parsed.toString();
}

export function buildCapturedEmailDocument(input: CaptureEmailInput, now = new Date()): CapturedEmailDocument {
    const { origin } = requireCaptureConfiguration();
    const candidateActionUrl = input.templateModel.actionUrl ?? input.templateModel.action_url;
    const templateAlias = cleanDisplayValue(input.templateAlias, 100);
    const to = cleanDisplayValue(input.to, 320);
    if (!templateAlias || !to) throw new Error("Captured email requires a recipient and template alias.");
    const actionUrl = approvedCapturedActionUrl(templateAlias, candidateActionUrl, origin);
    const ttl = templateAlias === "password-reset" ? PASSWORD_RESET_CAPTURE_TTL_MS : DEFAULT_CAPTURE_TTL_MS;
    return {
        to,
        templateAlias,
        displayName: cleanDisplayValue(input.templateModel.name),
        actionUrl,
        createdAt: now,
        expiresAt: new Date(now.getTime() + ttl),
    };
}

export async function storeCapturedEmailInCollection(
    emails: Collection<CapturedEmailDocument>,
    input: CaptureEmailInput,
    now = new Date(),
    ensureIndex = true,
): Promise<void> {
    requireCaptureConfiguration();
    try {
        if (ensureIndex) {
            await emails.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "captured_email_expiry" });
        }
        await emails.insertOne(buildCapturedEmailDocument(input, now));
    } catch {
        throw new Error("Captured email persistence failed.");
    }
}

export async function listUnexpiredCapturedEmails(
    emails: Collection<CapturedEmailDocument>,
    now = new Date(),
): Promise<CapturedEmailDocument[]> {
    return emails
        .find({ expiresAt: { $gt: now } })
        .sort({ createdAt: -1 })
        .limit(CAPTURED_EMAIL_LIST_LIMIT)
        .toArray();
}
