import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    detectClientPushCapability,
    getClientUserAgentSummary,
    PUSH_SUBSCRIPTION_ID_STORAGE_KEY,
    reconcilePushSubscriptionForAuthenticatedUser,
    revokePushSubscriptionOnLogout,
    urlBase64ToUint8Array,
    type BrowserPushSubscriptionLike,
    type StorageLike,
} from "./client-push";

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
    const map = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
}

function makeFakeSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/test-device"): {
    sub: BrowserPushSubscriptionLike;
    getUnsubscribed: () => boolean;
} {
    let unsubscribed = false;
    return {
        sub: {
            endpoint,
            toJSON: () => ({
                endpoint,
                keys: {
                    p256dh: Buffer.alloc(65, 5).toString("base64url"),
                    auth: Buffer.alloc(16, 7).toString("base64url"),
                },
            }),
            unsubscribe: async () => {
                unsubscribed = true;
                return true;
            },
        },
        getUnsubscribed: () => unsubscribed,
    };
}

describe("Client push capability and key decoding", () => {
    it("decodes base64url VAPID public keys into exact byte arrays", () => {
        const expected = new Uint8Array(65);
        expected[0] = 0x04;
        expected[64] = 0xfe;
        const base64url = Buffer.from(expected).toString("base64url");

        const decoded = urlBase64ToUint8Array(base64url);
        assert.equal(decoded.byteLength, 65);
        assert.equal(decoded[0], 0x04);
        assert.equal(decoded[64], 0xfe);
    });

    it("detects browser capabilities accurately across desktop, Android, and iOS", () => {
        assert.equal(
            detectClientPushCapability({
                isSecureContext: true,
                hasServiceWorker: true,
                hasPushManager: true,
                hasNotification: true,
                isIos: false,
                isStandalone: false,
                notificationPermission: "default",
            }),
            "ready",
        );

        // iOS Safari browser tab hides PushManager until added to Home Screen.
        assert.equal(
            detectClientPushCapability({
                isSecureContext: true,
                hasServiceWorker: true,
                hasPushManager: false,
                hasNotification: false,
                isIos: true,
                isStandalone: false,
                notificationPermission: "unsupported",
            }),
            "ios_requires_install",
        );

        // iOS Home Screen standalone app with PushManager ready.
        assert.equal(
            detectClientPushCapability({
                isSecureContext: true,
                hasServiceWorker: true,
                hasPushManager: true,
                hasNotification: true,
                isIos: true,
                isStandalone: true,
                notificationPermission: "default",
            }),
            "ready",
        );

        assert.equal(
            detectClientPushCapability({
                isSecureContext: true,
                hasServiceWorker: true,
                hasPushManager: true,
                hasNotification: true,
                isIos: false,
                isStandalone: false,
                notificationPermission: "denied",
            }),
            "denied",
        );

        assert.equal(
            detectClientPushCapability({
                isSecureContext: false,
                hasServiceWorker: true,
                hasPushManager: true,
                hasNotification: true,
                isIos: false,
                isStandalone: false,
                notificationPermission: "default",
            }),
            "unsupported",
        );
    });

    it("formats concise privacy-safe browser summaries", () => {
        assert.equal(
            getClientUserAgentSummary(
                "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
            ),
            "Chrome on Android",
        );
        assert.equal(
            getClientUserAgentSummary(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
            ),
            "Safari on iOS",
        );
    });
});

describe("Push reconciliation and logout revocation", () => {
    it("reconciles active browser subscription when granted and enabled, and skips when disabled or ungranted", async () => {
        const storage = createMemoryStorage();
        const { sub } = makeFakeSubscription();
        const calls: Array<{ url: string; method: string }> = [];

        const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = init?.method ?? "GET";
            calls.push({ url, method });

            if (url === "/api/push/config") {
                return new Response(
                    JSON.stringify({ enabled: true, dispatchEnabled: true, vapidPublicKey: "BPubKey" }),
                    { status: 200 },
                );
            }
            if (url === "/api/push/subscriptions" && method === "POST") {
                return new Response(JSON.stringify({ subscriptionId: "sub_123" }), { status: 200 });
            }
            return new Response("Not Found", { status: 404 });
        }) as typeof fetch;

        const skipped = await reconcilePushSubscriptionForAuthenticatedUser({
            fetchFn: mockFetch,
            storage,
            getPermission: () => "default",
            getSubscription: async () => sub,
        });
        assert.equal(skipped.reconciled, false);
        assert.equal(calls.length, 0);

        const ok = await reconcilePushSubscriptionForAuthenticatedUser({
            fetchFn: mockFetch,
            storage,
            getPermission: () => "granted",
            getSubscription: async () => sub,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0",
        });
        assert.deepEqual(ok, { reconciled: true, subscriptionId: "sub_123" });
        assert.equal(storage.getItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY), "sub_123");
    });

    it("revokes subscription server-side before unsubscribing browser on logout and never throws on errors", async () => {
        const storage = createMemoryStorage({ [PUSH_SUBSCRIPTION_ID_STORAGE_KEY]: "sub_999" });
        const { sub, getUnsubscribed } = makeFakeSubscription();
        const events: string[] = [];

        const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            events.push(`${init?.method ?? "GET"}:${String(input)}`);
            return new Response(JSON.stringify({ revoked: true }), { status: 200 });
        }) as typeof fetch;

        const wrappedSub: BrowserPushSubscriptionLike = {
            ...sub,
            unsubscribe: async () => {
                events.push("browser:unsubscribe");
                return sub.unsubscribe();
            },
        };

        await revokePushSubscriptionOnLogout({
            fetchFn: mockFetch,
            storage,
            getSubscription: async () => wrappedSub,
        });

        assert.deepEqual(events, ["DELETE:/api/push/subscriptions/sub_999", "browser:unsubscribe"]);
        assert.equal(getUnsubscribed(), true);
        assert.equal(storage.getItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY), null);

        // Network failure during logout still resolves cleanly.
        const failingFetch = (async () => {
            throw new Error("offline");
        }) as unknown as typeof fetch;
        await revokePushSubscriptionOnLogout({
            fetchFn: failingFetch,
            storage: createMemoryStorage({ [PUSH_SUBSCRIPTION_ID_STORAGE_KEY]: "sub_offline" }),
            getSubscription: async () => sub,
        });
    });
});
