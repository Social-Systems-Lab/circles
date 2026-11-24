// Mirrors personal-profile signup validation in signup-form, pilot-signup-form, and onboarding-signup-flow.
const HANDLE_PATTERN = /^[a-z0-9-]{3,20}$/;
const KAMOONI_HOSTS = new Set(["kamooni.org", "www.kamooni.org"]);

type ProfileLinkOptions = { additionalOrigin?: string; allowHome?: boolean };

export function resolveKamooniProfileHandle(input: string, options?: ProfileLinkOptions): string | null {
    const value = input.trim();
    if (!value) return null;
    if (value.startsWith("@")) return normalizeHandle(value.slice(1));
    if (/^https?:\/\//i.test(value)) return normalizeKamooniProfileUrl(value, options);
    if (value.includes("/") || value.includes(".") || value.includes(":")) return null;
    return normalizeHandle(value);
}

function normalizeKamooniProfileUrl(input: string, options?: ProfileLinkOptions): string | null {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        return null;
    }
    const isKnownOrigin = KAMOONI_HOSTS.has(url.hostname.toLowerCase()) || url.origin === options?.additionalOrigin;
    if (url.protocol !== "https:" || !isKnownOrigin || url.username || url.password) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const isProfileHome = options?.allowHome && /^\/circles\/[^/]+\/home\/?$/.test(url.pathname);
    if (parts[0] !== "circles" || (parts.length !== 2 && !isProfileHome)) return null;
    return normalizeHandle(parts[1]);
}

function normalizeHandle(handle: string): string | null {
    const normalized = handle.trim().toLowerCase();
    return HANDLE_PATTERN.test(normalized) ? normalized : null;
}
