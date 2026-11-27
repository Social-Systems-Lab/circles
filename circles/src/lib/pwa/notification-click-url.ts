export const ALLOWED_NOTIFICATION_ROUTE_PREFIXES = [
    "/chat",
    "/circles/",
    "/secret-invitations/",
    "/admin",
    "/explore",
    "/foryou",
    "/bookmarks",
    "/onboarding",
] as const;

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/**
 * Validates that a notification click target stays on the current origin and
 * points only to an allowlisted application route.
 */
export function resolveSafeNotificationUrl(rawUrl: unknown, origin: string): string {
    if (typeof rawUrl !== "string") {
        return "/";
    }

    const trimmed = rawUrl.trim();
    if (!trimmed || CONTROL_CHARS_RE.test(trimmed) || trimmed.startsWith("//")) {
        return "/";
    }

    let base: URL;
    try {
        base = new URL(origin);
    } catch {
        return "/";
    }

    try {
        const candidate = new URL(trimmed, base);
        if (candidate.origin !== base.origin) {
            return "/";
        }

        const { pathname } = candidate;
        const isAllowed =
            pathname === "/" ||
            ALLOWED_NOTIFICATION_ROUTE_PREFIXES.some((prefix) =>
                prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
            );

        if (!isAllowed) {
            return "/";
        }

        return `${pathname}${candidate.search}${candidate.hash}`;
    } catch {
        return "/";
    }
}
