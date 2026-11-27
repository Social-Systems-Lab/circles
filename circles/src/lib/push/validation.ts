import crypto from "node:crypto";
import { isIP } from "node:net";
import { resolvePublicDestination, type ResolvedAddress } from "../link-preview-security";
import type { PushSubscriptionKeys } from "./types";

export const ALLOWED_PUSH_HOST_SUFFIXES = [
    "fcm.googleapis.com",
    "android.googleapis.com",
    ".push.services.mozilla.com",
    ".push.apple.com",
    ".notify.windows.com",
    ".push.samsungosp.com",
] as const;

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_USER_AGENT_SUMMARY_LENGTH = 160;
const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;

export type ValidatedPushSubscriptionInput = {
    endpoint: string;
    keys: PushSubscriptionKeys;
    userAgentSummary?: string;
};

export function hashPushEndpoint(endpoint: string): string {
    return crypto.createHash("sha256").update(endpoint).digest("hex");
}

export function isAllowedPushEndpointHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase().replace(/\.+$/, "");
    if (!normalized) {
        return false;
    }

    return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => {
        if (suffix.startsWith(".")) {
            return normalized.endsWith(suffix) && normalized.length > suffix.length;
        }
        return normalized === suffix || normalized.endsWith(`.${suffix}`);
    });
}

function decodeBase64UrlExactBytes(value: unknown, expectedBytes: number, fieldName: string): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 256 || !BASE64URL_RE.test(value)) {
        throw new Error(`Invalid push key format: ${fieldName}`);
    }
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length !== expectedBytes) {
        throw new Error(`Invalid push key length: ${fieldName}`);
    }
    return value;
}

export function validatePushSubscriptionPayload(
    input: unknown,
): { ok: true; value: ValidatedPushSubscriptionInput } | { ok: false; error: string } {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, error: "Invalid subscription payload" };
    }

    const record = input as Record<string, unknown>;
    const rawEndpoint = record.endpoint;
    if (typeof rawEndpoint !== "string") {
        return { ok: false, error: "Subscription endpoint is required" };
    }
    const endpoint = rawEndpoint.trim();
    if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) {
        return { ok: false, error: "Subscription endpoint is invalid or too long" };
    }

    const keys = record.keys;
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
        return { ok: false, error: "Subscription keys are required" };
    }
    const keysRecord = keys as Record<string, unknown>;

    let p256dh: string;
    let auth: string;
    try {
        p256dh = decodeBase64UrlExactBytes(keysRecord.p256dh, 65, "p256dh");
        auth = decodeBase64UrlExactBytes(keysRecord.auth, 16, "auth");
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Invalid subscription keys" };
    }

    let userAgentSummary: string | undefined;
    if (typeof record.userAgentSummary === "string") {
        const cleaned = record.userAgentSummary.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
        if (cleaned) {
            userAgentSummary = cleaned.slice(0, MAX_USER_AGENT_SUMMARY_LENGTH);
        }
    }

    return {
        ok: true,
        value: {
            endpoint,
            keys: { p256dh, auth },
            ...(userAgentSummary ? { userAgentSummary } : {}),
        },
    };
}

export async function validatePushEndpointUrl(
    rawEndpoint: string,
    deps?: { resolve?: (hostname: string) => Promise<ResolvedAddress[]> },
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
    let url: URL;
    try {
        url = new URL(rawEndpoint);
    } catch {
        return { ok: false, error: "Malformed push endpoint URL" };
    }

    if (url.protocol !== "https:") {
        return { ok: false, error: "Push endpoint must use HTTPS" };
    }
    if (url.username || url.password) {
        return { ok: false, error: "Push endpoint must not include credentials" };
    }
    if (url.port !== "") {
        return { ok: false, error: "Push endpoint must use the default HTTPS port" };
    }

    const bareHost = url.hostname.replace(/^\[|\]$/g, "");
    if (!bareHost || isIP(bareHost) !== 0) {
        return { ok: false, error: "Push endpoint must use a provider hostname" };
    }

    if (!isAllowedPushEndpointHostname(bareHost)) {
        return { ok: false, error: "Unsupported push service host" };
    }

    try {
        await resolvePublicDestination(url, deps?.resolve);
    } catch {
        return { ok: false, error: "Push endpoint did not resolve to a public destination" };
    }

    return { ok: true, url };
}
