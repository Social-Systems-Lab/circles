import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getPublicPushConfig, getVapidConfig, isWebPushDispatchEnabled, isWebPushEnabled } from "./config";
import { assertSameOriginMutation } from "./csrf";
import { extractEmailPreferences, normalizePushPreferences, parseNotificationPreferencesPatch } from "./preferences";
import { RateLimiter } from "./rate-limit";
import {
    getActivePushSubscriptionDocsForUser,
    listActivePushSubscriptionsForUser,
    revokePushSubscriptionForUser,
    upsertPushSubscription,
    type PushSubscriptionStore,
} from "./subscriptions";
import type { PushSubscriptionDoc } from "./types";
import {
    hashPushEndpoint,
    isAllowedPushEndpointHostname,
    validatePushEndpointUrl,
    validatePushSubscriptionPayload,
} from "./validation";
import { classifyWebPushError } from "./web-push-adapter";

function makeBase64UrlBytes(length: number, fillByte = 4): string {
    return Buffer.alloc(length, fillByte).toString("base64url");
}

function createMemorySubscriptionStore(): {
    store: PushSubscriptionStore;
    docs: Map<string, PushSubscriptionDoc>;
    cancelledJobs: Array<{ subscriptionId: string; reason: string }>;
} {
    const docs = new Map<string, PushSubscriptionDoc>();
    const cancelledJobs: Array<{ subscriptionId: string; reason: string }> = [];
    let seq = 1;

    const store: PushSubscriptionStore = {
        async findByEndpointHash(endpointHash) {
            for (const doc of docs.values()) {
                if (doc.endpointHash === endpointHash) {
                    return { ...doc };
                }
            }
            return null;
        },
        async insert(doc) {
            const id = crypto.createHash("md5").update(`sub-${seq++}`).digest("hex").slice(0, 24);
            docs.set(id, { ...doc, _id: id });
            return id;
        },
        async updateById(id, fields) {
            const existing = docs.get(String(id));
            if (!existing) return;
            const next: PushSubscriptionDoc = {
                ...existing,
                ...(fields.userDid !== undefined ? { userDid: fields.userDid } : {}),
                ...(fields.endpoint !== undefined ? { endpoint: fields.endpoint } : {}),
                ...(fields.keys !== undefined ? { keys: fields.keys } : {}),
                ...(fields.userAgentSummary !== undefined ? { userAgentSummary: fields.userAgentSummary } : {}),
                ...(fields.lastSeenAt !== undefined ? { lastSeenAt: fields.lastSeenAt } : {}),
            };
            if (fields.clearRevoked) {
                delete next.revokedAt;
                delete next.revokeReason;
            }
            docs.set(String(id), next);
        },
        async cancelPendingJobsForSubscription(subscriptionId, reason) {
            cancelledJobs.push({ subscriptionId: String(subscriptionId), reason });
            return 1;
        },
        async findActiveByUser(userDid) {
            return [...docs.values()].filter((doc) => doc.userDid === userDid && !doc.revokedAt);
        },
        async findOwnedByUser(userDid, filter) {
            for (const doc of docs.values()) {
                if (doc.userDid !== userDid || doc.revokedAt) continue;
                if (filter.subscriptionId && String(doc._id) === filter.subscriptionId) return { ...doc };
                if (filter.endpointHash && doc.endpointHash === filter.endpointHash) return { ...doc };
            }
            return null;
        },
        async revokeById(id, reason, now) {
            const existing = docs.get(String(id));
            if (!existing || existing.revokedAt) return false;
            docs.set(String(id), { ...existing, revokedAt: now, revokeReason: reason });
            return true;
        },
    };

    return { store, docs, cancelledJobs };
}

describe("Web Push feature flags and config", () => {
    const validEnv = {
        WEB_PUSH_ENABLED: "true",
        WEB_PUSH_DISPATCH_ENABLED: "true",
        WEB_PUSH_VAPID_SUBJECT: "mailto:hello@socialsystems.io",
        WEB_PUSH_VAPID_PUBLIC_KEY: "BPublicKeyExample",
        WEB_PUSH_VAPID_PRIVATE_KEY: "PrivateKeyExample",
    };

    it("stays disabled when flags are off or VAPID keys are missing", () => {
        assert.equal(isWebPushEnabled({}), false);
        assert.equal(isWebPushEnabled({ ...validEnv, WEB_PUSH_ENABLED: "false" }), false);
        assert.equal(isWebPushEnabled({ ...validEnv, WEB_PUSH_VAPID_PRIVATE_KEY: "" }), false);
        assert.equal(isWebPushEnabled({ ...validEnv, WEB_PUSH_VAPID_SUBJECT: "http://insecure" }), false);
        assert.equal(isWebPushDispatchEnabled({ ...validEnv, WEB_PUSH_DISPATCH_ENABLED: "false" }), false);

        assert.deepEqual(getPublicPushConfig({ ...validEnv, WEB_PUSH_ENABLED: "false" }), {
            enabled: false,
            dispatchEnabled: false,
            vapidPublicKey: null,
        });
    });

    it("exposes public key only when enabled and never exposes private key", () => {
        assert.equal(isWebPushEnabled(validEnv), true);
        assert.equal(isWebPushDispatchEnabled(validEnv), true);
        assert.equal(getVapidConfig(validEnv)?.privateKey, "PrivateKeyExample");

        const publicConfig = getPublicPushConfig(validEnv);
        assert.deepEqual(publicConfig, {
            enabled: true,
            dispatchEnabled: true,
            vapidPublicKey: "BPublicKeyExample",
        });
        assert.equal("privateKey" in publicConfig, false);
    });
});

describe("Push subscription validation and SSRF protection", () => {
    it("accepts valid Web Push key lengths and strips control chars in userAgentSummary", () => {
        const res = validatePushSubscriptionPayload({
            endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
            keys: {
                p256dh: makeBase64UrlBytes(65),
                auth: makeBase64UrlBytes(16),
            },
            userAgentSummary: "Chrome\n130",
        });

        assert.equal(res.ok, true);
        if (res.ok) {
            assert.equal(res.value.userAgentSummary, "Chrome 130");
        }
    });

    it("rejects malformed or wrong-length keys", () => {
        const badP256 = validatePushSubscriptionPayload({
            endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
            keys: { p256dh: makeBase64UrlBytes(32), auth: makeBase64UrlBytes(16) },
        });
        assert.equal(badP256.ok, false);

        const badAuth = validatePushSubscriptionPayload({
            endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
            keys: { p256dh: makeBase64UrlBytes(65), auth: "not!base64url" },
        });
        assert.equal(badAuth.ok, false);
    });

    it("enforces HTTPS, provider hostname allowlist, and public DNS resolution", async () => {
        assert.equal(isAllowedPushEndpointHostname("fcm.googleapis.com"), true);
        assert.equal(isAllowedPushEndpointHostname("updates.push.services.mozilla.com"), true);
        assert.equal(isAllowedPushEndpointHostname("web.push.apple.com"), true);
        assert.equal(isAllowedPushEndpointHostname("wns2-bl2p.notify.windows.com"), true);
        assert.equal(isAllowedPushEndpointHostname("evil-fcm.googleapis.com.attacker.tld"), false);

        const publicResolve = async () => [{ address: "142.250.74.14", family: 4 as const }];
        const privateResolve = async () => [{ address: "127.0.0.1", family: 4 as const }];

        assert.equal(
            (await validatePushEndpointUrl("https://fcm.googleapis.com/fcm/send/token", { resolve: publicResolve })).ok,
            true,
        );
        assert.equal(
            (await validatePushEndpointUrl("http://fcm.googleapis.com/fcm/send/token", { resolve: publicResolve })).ok,
            false,
        );
        assert.equal(
            (await validatePushEndpointUrl("https://fcm.googleapis.com:8443/fcm/send/token", { resolve: publicResolve }))
                .ok,
            false,
        );
        assert.equal(
            (await validatePushEndpointUrl("https://142.250.74.14/fcm/send/token", { resolve: publicResolve })).ok,
            false,
        );
        assert.equal(
            (await validatePushEndpointUrl("https://internal.local/push", { resolve: publicResolve })).ok,
            false,
        );
        assert.equal(
            (await validatePushEndpointUrl("https://fcm.googleapis.com/fcm/send/token", { resolve: privateResolve })).ok,
            false,
        );
    });
});

describe("Same-origin CSRF guard and rate limiting", () => {
    it("allows same-origin requests matching CIRCLES_URL and rejects cross-site requests", () => {
        const env = { CIRCLES_URL: "https://staging.kamooni.org", NODE_ENV: "production" };

        const validReq = new Request("https://staging.kamooni.org/api/push/subscriptions", {
            method: "POST",
            headers: {
                origin: "https://staging.kamooni.org",
                "sec-fetch-site": "same-origin",
            },
        });
        assert.equal(assertSameOriginMutation(validReq, env).ok, true);

        const crossSiteReq = new Request("https://staging.kamooni.org/api/push/subscriptions", {
            method: "POST",
            headers: {
                origin: "https://staging.kamooni.org",
                "sec-fetch-site": "cross-site",
            },
        });
        assert.equal(assertSameOriginMutation(crossSiteReq, env).ok, false);

        const wrongOriginReq = new Request("https://staging.kamooni.org/api/push/subscriptions", {
            method: "POST",
            headers: {
                origin: "https://evil.example",
                "sec-fetch-site": "same-origin",
            },
        });
        assert.equal(assertSameOriginMutation(wrongOriginReq, env).ok, false);

        const missingOriginReq = new Request("https://staging.kamooni.org/api/push/subscriptions", {
            method: "POST",
        });
        assert.equal(assertSameOriginMutation(missingOriginReq, env).ok, false);
    });

    it("enforces sliding-window rate limits", () => {
        let now = 1_000_000;
        const limiter = new RateLimiter({ now: () => now });

        assert.equal(limiter.check("u1", 2, 60_000).allowed, true);
        assert.equal(limiter.check("u1", 2, 60_000).allowed, true);
        const blocked = limiter.check("u1", 2, 60_000);
        assert.equal(blocked.allowed, false);
        assert.ok(blocked.retryAfterSeconds >= 1);

        now += 61_000;
        assert.equal(limiter.check("u1", 2, 60_000).allowed, true);
    });
});

describe("Push subscription lifecycle and shared-browser isolation", () => {
    it("atomically rebinds endpoint across users, cancels prior pending jobs, and enforces ownership on revoke", async () => {
        const { store, docs, cancelledJobs } = createMemorySubscriptionStore();
        const endpoint = "https://updates.push.services.mozilla.com/wpush/v2/device-1";

        const first = await upsertPushSubscription(
            {
                userDid: "did:user:alice",
                endpoint,
                keys: { p256dh: makeBase64UrlBytes(65, 1), auth: makeBase64UrlBytes(16, 2) },
            },
            store,
            new Date("2026-11-27T10:00:00Z"),
        );
        assert.equal(first.reboundFromOtherUser, false);
        assert.equal((await getActivePushSubscriptionDocsForUser("did:user:alice", store)).length, 1);

        // Bob logs into the same browser profile and subscribes with the same endpoint.
        const second = await upsertPushSubscription(
            {
                userDid: "did:user:bob",
                endpoint,
                keys: { p256dh: makeBase64UrlBytes(65, 3), auth: makeBase64UrlBytes(16, 4) },
            },
            store,
            new Date("2026-11-27T11:00:00Z"),
        );
        assert.equal(second.subscriptionId, first.subscriptionId);
        assert.equal(second.reboundFromOtherUser, true);
        assert.equal(cancelledJobs.length, 1);
        assert.equal(cancelledJobs[0]?.reason, "subscription_rebound");
        assert.equal((await getActivePushSubscriptionDocsForUser("did:user:alice", store)).length, 0);
        assert.equal((await getActivePushSubscriptionDocsForUser("did:user:bob", store)).length, 1);

        // Alice cannot revoke Bob's subscription.
        const unauthorizedRevoke = await revokePushSubscriptionForUser(
            { userDid: "did:user:alice", subscriptionId: second.subscriptionId },
            store,
        );
        assert.equal(unauthorizedRevoke.revoked, false);

        // Sanitized summary omits endpoint and encryption keys.
        const bobSummaries = await listActivePushSubscriptionsForUser("did:user:bob", store);
        assert.equal(bobSummaries.length, 1);
        assert.equal("endpoint" in (bobSummaries[0] as Record<string, unknown>), false);
        assert.equal("keys" in (bobSummaries[0] as Record<string, unknown>), false);

        // Bob can revoke his own subscription by endpoint on logout.
        const bobRevoke = await revokePushSubscriptionForUser(
            { userDid: "did:user:bob", endpoint, reason: "logout" },
            store,
        );
        assert.equal(bobRevoke.revoked, true);
        assert.equal(docs.get(second.subscriptionId)?.endpointHash, hashPushEndpoint(endpoint));
        assert.equal((await getActivePushSubscriptionDocsForUser("did:user:bob", store)).length, 0);
    });
});

describe("Notification preferences and Web Push error classification", () => {
    it("normalizes push and email preferences and validates PATCH payloads", () => {
        const defaults = normalizePushPreferences(undefined);
        assert.equal(defaults.enabled, true);
        assert.equal(defaults.categories.messages, true);

        const partial = normalizePushPreferences({ enabled: false, categories: { events: false, bogus: false } });
        assert.equal(partial.enabled, false);
        assert.equal(partial.categories.events, false);
        assert.equal(partial.categories.tasks, true);

        assert.deepEqual(extractEmailPreferences({ emailMissedMessages: false, emailTaskAssigned: true }), {
            emailMissedMessages: false,
            emailTaskAssigned: true,
            emailTaskUpdates: false,
            emailVerificationUpdates: false,
        });

        assert.equal(
            parseNotificationPreferencesPatch({ push: { enabled: true, categories: { messages: false } } }).ok,
            true,
        );
        assert.equal(parseNotificationPreferencesPatch({ push: { categories: { unknown: true } } }).ok, false);
        assert.equal(parseNotificationPreferencesPatch({}).ok, false);
    });

    it("classifies 404/410 as permanent revoke, 429/5xx as retryable, and 401/403 as config_error", () => {
        assert.deepEqual(classifyWebPushError({ statusCode: 410 }), {
            outcome: "permanent_revoke",
            statusCode: 410,
            errorCode: "http_410",
        });
        assert.deepEqual(classifyWebPushError({ statusCode: 404 }), {
            outcome: "permanent_revoke",
            statusCode: 404,
            errorCode: "http_404",
        });
        assert.deepEqual(classifyWebPushError({ statusCode: 429, headers: { "retry-after": "120" } }), {
            outcome: "retryable",
            statusCode: 429,
            retryAfterSeconds: 120,
            errorCode: "http_429",
        });
        assert.deepEqual(classifyWebPushError({ statusCode: 503 }), {
            outcome: "retryable",
            statusCode: 503,
            errorCode: "http_503",
        });
        assert.deepEqual(classifyWebPushError({ statusCode: 401 }), {
            outcome: "config_error",
            statusCode: 401,
            errorCode: "http_401",
        });
        assert.deepEqual(classifyWebPushError({ code: "ECONNRESET" }), {
            outcome: "retryable",
            errorCode: "ECONNRESET",
        });
    });
});
