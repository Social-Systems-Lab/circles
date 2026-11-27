import { sendNotification } from "web-push";
import { getVapidConfig, type PushEnv } from "./config";
import type { PushNotificationPayload, PushSubscriptionKeys } from "./types";
import { validatePushEndpointUrl } from "./validation";

export type WebPushSendOutcome =
    | { outcome: "accepted"; statusCode: number }
    | { outcome: "permanent_revoke"; statusCode: number; errorCode: string }
    | { outcome: "retryable"; statusCode?: number; retryAfterSeconds?: number; errorCode: string }
    | { outcome: "config_error"; statusCode?: number; errorCode: string };

function parseRetryAfterSeconds(headers: Record<string, unknown> | undefined): number | undefined {
    if (!headers) {
        return undefined;
    }

    const raw = headers["retry-after"] ?? headers["Retry-After"];
    if (typeof raw !== "string" && typeof raw !== "number") {
        return undefined;
    }

    const text = String(raw).trim();
    if (/^\d+$/.test(text)) {
        const seconds = Number(text);
        return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86_400) : undefined;
    }

    const targetTime = Date.parse(text);
    if (!Number.isNaN(targetTime)) {
        const diffSeconds = Math.ceil((targetTime - Date.now()) / 1000);
        return diffSeconds > 0 ? Math.min(diffSeconds, 86_400) : undefined;
    }

    return undefined;
}

export function classifyWebPushError(error: unknown): Exclude<WebPushSendOutcome, { outcome: "accepted" }> {
    const errObj = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
    const statusCode = typeof errObj.statusCode === "number" ? errObj.statusCode : undefined;
    const headers =
        errObj.headers && typeof errObj.headers === "object"
            ? (errObj.headers as Record<string, unknown>)
            : undefined;
    const rawCode = typeof errObj.code === "string" ? errObj.code : undefined;

    if (statusCode === 404 || statusCode === 410) {
        return {
            outcome: "permanent_revoke",
            statusCode,
            errorCode: `http_${statusCode}`,
        };
    }

    if (statusCode === 429) {
        return {
            outcome: "retryable",
            statusCode,
            retryAfterSeconds: parseRetryAfterSeconds(headers),
            errorCode: "http_429",
        };
    }

    if (statusCode !== undefined && statusCode >= 500 && statusCode <= 599) {
        return {
            outcome: "retryable",
            statusCode,
            errorCode: `http_${statusCode}`,
        };
    }

    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
        return {
            outcome: "config_error",
            statusCode,
            errorCode: `http_${statusCode}`,
        };
    }

    return {
        outcome: "retryable",
        errorCode: rawCode && /^[A-Za-z0-9_-]{1,40}$/.test(rawCode) ? rawCode : "network_error",
    };
}

export async function sendWebPushNotification(
    subscription: { endpoint: string; keys: PushSubscriptionKeys },
    payload: PushNotificationPayload,
    options?: {
        ttlSeconds?: number;
        env?: PushEnv;
        resolve?: (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
    },
): Promise<WebPushSendOutcome> {
    const vapid = getVapidConfig(options?.env);
    if (!vapid) {
        return { outcome: "config_error", errorCode: "vapid_not_configured" };
    }

    const endpointCheck = await validatePushEndpointUrl(subscription.endpoint, {
        resolve: options?.resolve,
    });
    if (!endpointCheck.ok) {
        return { outcome: "config_error", errorCode: "invalid_push_endpoint" };
    }

    try {
        const result = await sendNotification(
            {
                endpoint: endpointCheck.url.toString(),
                keys: subscription.keys,
            },
            JSON.stringify(payload),
            {
                TTL: options?.ttlSeconds ?? 3600,
                vapidDetails: {
                    subject: vapid.subject,
                    publicKey: vapid.publicKey,
                    privateKey: vapid.privateKey,
                },
            },
        );
        return {
            outcome: "accepted",
            statusCode: typeof result?.statusCode === "number" ? result.statusCode : 201,
        };
    } catch (error) {
        return classifyWebPushError(error);
    }
}
