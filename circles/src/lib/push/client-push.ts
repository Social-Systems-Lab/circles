import type { PublicPushConfig } from "./config";
import type { PushSubscriptionSummary } from "./types";

export const PUSH_SUBSCRIPTION_ID_STORAGE_KEY = "kamooni_push_subscription_id_v1";

export type ClientPushCapability = "ready" | "ios_requires_install" | "denied" | "unsupported";

export type BrowserPushSubscriptionLike = {
    endpoint: string;
    options?: {
        applicationServerKey?: ArrayBuffer | ArrayBufferView | null;
    };
    toJSON: () => {
        endpoint?: string;
        keys?: {
            p256dh?: string;
            auth?: string;
        };
    };
    unsubscribe: () => Promise<boolean>;
};

export type StorageLike = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
};

export function urlBase64ToUint8Array(base64UrlString: string): Uint8Array<ArrayBuffer> {
    const trimmed = base64UrlString.trim();
    const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
    const base64 = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const outputArray = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) {
        return false;
    }
    for (let i = 0; i < a.byteLength; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView | null | undefined): Uint8Array | null {
    if (!value) {
        return null;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return null;
}

export function detectClientPushCapability(input: {
    isSecureContext: boolean;
    hasServiceWorker: boolean;
    hasPushManager: boolean;
    hasNotification: boolean;
    isIos: boolean;
    isStandalone: boolean;
    notificationPermission: NotificationPermission | "unsupported";
}): ClientPushCapability {
    if (!input.isSecureContext || !input.hasServiceWorker) {
        return "unsupported";
    }

    if (input.isIos && !input.isStandalone) {
        return "ios_requires_install";
    }

    if (!input.hasPushManager || !input.hasNotification) {
        return "unsupported";
    }

    if (input.notificationPermission === "denied") {
        return "denied";
    }

    return "ready";
}

export function getClientUserAgentSummary(userAgent?: string): string | undefined {
    const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")).trim();
    if (!ua) {
        return undefined;
    }

    let browser = "Browser";
    if (/Edg\//i.test(ua)) browser = "Edge";
    else if (/CriOS\//i.test(ua) || (/Chrome\//i.test(ua) && !/Edg\//i.test(ua))) browser = "Chrome";
    else if (/FxiOS\//i.test(ua) || /Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua)) browser = "Safari";

    let os = "";
    if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/Windows/i.test(ua)) os = "Windows";
    else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";

    const summary = os ? `${browser} on ${os}` : browser;
    return summary.slice(0, 160);
}

function getSafeStorage(override?: StorageLike | null): StorageLike | null {
    if (override !== undefined) {
        return override;
    }
    if (typeof window === "undefined") {
        return null;
    }
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readStoredSubscriptionId(storage: StorageLike | null): string | null {
    if (!storage) return null;
    try {
        const val = storage.getItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY);
        return val && val.trim() ? val.trim() : null;
    } catch {
        return null;
    }
}

function writeStoredSubscriptionId(storage: StorageLike | null, id: string | null): void {
    if (!storage) return;
    try {
        if (id) {
            storage.setItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY, id);
        } else {
            storage.removeItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY);
        }
    } catch {
        // Ignore storage errors in restricted contexts.
    }
}

export async function fetchPushConfig(fetchFn: typeof fetch = fetch): Promise<PublicPushConfig> {
    try {
        const response = await fetchFn("/api/push/config", {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
        });
        if (!response.ok) {
            return { enabled: false, dispatchEnabled: false, vapidPublicKey: null };
        }
        const data = (await response.json()) as Partial<PublicPushConfig>;
        return {
            enabled: data.enabled === true,
            dispatchEnabled: data.dispatchEnabled === true,
            vapidPublicKey: typeof data.vapidPublicKey === "string" ? data.vapidPublicKey : null,
        };
    } catch {
        return { enabled: false, dispatchEnabled: false, vapidPublicKey: null };
    }
}

export async function fetchMyPushSubscriptions(
    fetchFn: typeof fetch = fetch,
): Promise<{ enabled: boolean; subscriptions: PushSubscriptionSummary[] }> {
    const response = await fetchFn("/api/push/subscriptions", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch push subscriptions (${response.status})`);
    }
    const data = (await response.json()) as {
        enabled?: boolean;
        subscriptions?: PushSubscriptionSummary[];
    };
    return {
        enabled: data.enabled === true,
        subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
    };
}

async function getReadyServiceWorkerRegistration(timeoutMs = 2500): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return null;
    }

    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing?.active) {
        return existing;
    }

    const registered = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
    });
    if (registered.active) {
        return registered;
    }

    return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), timeoutMs);
        }),
    ]);
}

export async function getExistingPushSubscription(): Promise<BrowserPushSubscriptionLike | null> {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        return null;
    }
    try {
        const existing = await navigator.serviceWorker.getRegistration("/");
        const registration =
            existing ??
            (await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<null>((resolve) => {
                    setTimeout(() => resolve(null), 1500);
                }),
            ]));
        if (!registration || !("pushManager" in registration)) {
            return null;
        }
        return (await registration.pushManager.getSubscription()) as BrowserPushSubscriptionLike | null;
    } catch {
        return null;
    }
}

async function postPushSubscription(
    subscription: BrowserPushSubscriptionLike,
    fetchFn: typeof fetch,
    userAgent?: string,
): Promise<string> {
    const json = subscription.toJSON();
    const endpoint = json.endpoint || subscription.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
        throw new Error("Browser returned an incomplete push subscription.");
    }

    const response = await fetchFn("/api/push/subscriptions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            endpoint,
            keys: { p256dh, auth },
            userAgentSummary: getClientUserAgentSummary(userAgent),
        }),
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Failed to save push subscription (${response.status})`);
    }

    const data = (await response.json()) as { subscriptionId?: string };
    if (!data.subscriptionId) {
        throw new Error("Server did not return a subscription ID.");
    }
    return data.subscriptionId;
}

export async function subscribeCurrentBrowserToPush(
    vapidPublicKey: string,
    deps?: {
        fetchFn?: typeof fetch;
        storage?: StorageLike | null;
    },
): Promise<
    | { ok: true; subscriptionId: string }
    | { ok: false; reason: "denied" | "dismissed" | "unsupported" | "error"; message: string }
> {
    if (
        typeof window === "undefined" ||
        !window.isSecureContext ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
    ) {
        return {
            ok: false,
            reason: "unsupported",
            message: "Push notifications are not supported on this browser.",
        };
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
            return {
                ok: false,
                reason: "denied",
                message: "Notifications are blocked in your browser settings for Kamooni.",
            };
        }
        if (permission !== "granted") {
            return {
                ok: false,
                reason: "dismissed",
                message: "Notification permission was dismissed.",
            };
        }

        const registration = await getReadyServiceWorkerRegistration();
        if (!registration || !("pushManager" in registration)) {
            return {
                ok: false,
                reason: "unsupported",
                message: "Service worker is not ready on this browser.",
            };
        }

        const expectedKey = urlBase64ToUint8Array(vapidPublicKey);
        let subscription = (await registration.pushManager.getSubscription()) as BrowserPushSubscriptionLike | null;
        if (subscription) {
            const currentKey = toUint8Array(subscription.options?.applicationServerKey);
            if (currentKey && !uint8ArraysEqual(currentKey, expectedKey)) {
                await subscription.unsubscribe();
                subscription = null;
            }
        }

        if (!subscription) {
            subscription = (await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: expectedKey,
            })) as BrowserPushSubscriptionLike;
        }

        const fetchFn = deps?.fetchFn ?? fetch;
        const storage = getSafeStorage(deps?.storage);
        const subscriptionId = await postPushSubscription(subscription, fetchFn);
        writeStoredSubscriptionId(storage, subscriptionId);
        return { ok: true, subscriptionId };
    } catch (error) {
        return {
            ok: false,
            reason: "error",
            message: error instanceof Error ? error.message : "Could not enable push notifications.",
        };
    }
}

export async function unsubscribeCurrentBrowserFromPush(deps?: {
    fetchFn?: typeof fetch;
    storage?: StorageLike | null;
    getSubscription?: () => Promise<BrowserPushSubscriptionLike | null>;
}): Promise<void> {
    const fetchFn = deps?.fetchFn ?? fetch;
    const storage = getSafeStorage(deps?.storage);
    const getSub = deps?.getSubscription ?? getExistingPushSubscription;

    const storedId = readStoredSubscriptionId(storage);
    const subscription = await getSub();

    if (storedId) {
        await fetchFn(`/api/push/subscriptions/${encodeURIComponent(storedId)}`, {
            method: "DELETE",
            credentials: "same-origin",
        }).catch(() => undefined);
    } else if (subscription?.endpoint) {
        await fetchFn("/api/push/subscriptions", {
            method: "DELETE",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => undefined);
    }

    if (subscription) {
        await subscription.unsubscribe().catch(() => undefined);
    }

    writeStoredSubscriptionId(storage, null);
}

export async function reconcilePushSubscriptionForAuthenticatedUser(deps?: {
    fetchFn?: typeof fetch;
    storage?: StorageLike | null;
    getPermission?: () => NotificationPermission | "unsupported";
    getSubscription?: () => Promise<BrowserPushSubscriptionLike | null>;
    userAgent?: string;
}): Promise<{ reconciled: boolean; subscriptionId?: string }> {
    const permission =
        deps?.getPermission?.() ??
        (typeof Notification !== "undefined" ? Notification.permission : ("unsupported" as const));

    if (permission !== "granted") {
        return { reconciled: false };
    }

    const fetchFn = deps?.fetchFn ?? fetch;
    const getSub = deps?.getSubscription ?? getExistingPushSubscription;

    const [config, subscription] = await Promise.all([fetchPushConfig(fetchFn), getSub()]);
    if (!config.enabled || !subscription) {
        return { reconciled: false };
    }

    try {
        const subscriptionId = await postPushSubscription(subscription, fetchFn, deps?.userAgent);
        writeStoredSubscriptionId(getSafeStorage(deps?.storage), subscriptionId);
        return { reconciled: true, subscriptionId };
    } catch {
        return { reconciled: false };
    }
}

export async function revokePushSubscriptionOnLogout(deps?: {
    fetchFn?: typeof fetch;
    storage?: StorageLike | null;
    getSubscription?: () => Promise<BrowserPushSubscriptionLike | null>;
    timeoutMs?: number;
}): Promise<void> {
    const timeoutMs = deps?.timeoutMs ?? 3000;
    try {
        await Promise.race([
            unsubscribeCurrentBrowserFromPush({
                fetchFn: deps?.fetchFn,
                storage: deps?.storage,
                getSubscription: deps?.getSubscription,
            }),
            new Promise<void>((resolve) => {
                setTimeout(resolve, timeoutMs);
            }),
        ]);
    } catch {
        // Logout must never fail or block if push cleanup encounters an error.
    }
}
