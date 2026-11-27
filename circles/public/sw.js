/* Minimal no-cache service worker for Kamooni PWA & Web Push. */

const ALLOWED_ROUTE_PREFIXES = [
    "/chat",
    "/circles/",
    "/secret-invitations/",
    "/admin",
    "/explore",
    "/foryou",
    "/bookmarks",
    "/onboarding",
];

function resolveSafeTargetUrl(rawUrl) {
    if (typeof rawUrl !== "string") {
        return new URL("/", self.location.origin).href;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed) || trimmed.startsWith("//")) {
        return new URL("/", self.location.origin).href;
    }

    try {
        const candidate = new URL(trimmed, self.location.origin);
        if (candidate.origin !== self.location.origin) {
            return new URL("/", self.location.origin).href;
        }

        const pathname = candidate.pathname;
        const allowed =
            pathname === "/" ||
            ALLOWED_ROUTE_PREFIXES.some((prefix) =>
                prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
            );

        if (!allowed) {
            return new URL("/", self.location.origin).href;
        }

        return candidate.href;
    } catch {
        return new URL("/", self.location.origin).href;
    }
}

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {};
    }

    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Kamooni";
    const body =
        typeof data.body === "string" && data.body.trim()
            ? data.body.trim()
            : "You have a new update on Kamooni.";
    const safeUrl = resolveSafeTargetUrl(data.url);
    const notificationId = typeof data.notificationId === "string" ? data.notificationId : undefined;
    const tag = typeof data.tag === "string" && data.tag.trim() ? data.tag.trim() : notificationId;

    const options = {
        body,
        icon: "/icons/192.png",
        badge: "/icons/badge-96.png",
        data: {
            url: safeUrl,
            ...(notificationId ? { notificationId } : {}),
        },
        ...(tag ? { tag } : {}),
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetHref = resolveSafeTargetUrl(event.notification?.data?.url);

    event.waitUntil(
        (async () => {
            const windowClients = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            for (const client of windowClients) {
                try {
                    const clientUrl = new URL(client.url);
                    if (clientUrl.origin === self.location.origin) {
                        if ("focus" in client) {
                            await client.focus();
                        }
                        if ("navigate" in client && clientUrl.href !== targetHref) {
                            await client.navigate(targetHref);
                        }
                        return;
                    }
                } catch {
                    // Ignore malformed client URL and continue searching.
                }
            }

            if (self.clients.openWindow) {
                await self.clients.openWindow(targetHref);
            }
        })(),
    );
});
