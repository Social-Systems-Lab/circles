import { SocialLink, socialLinkSchema } from "@/models/models";

const PLATFORM_HOSTS: Record<string, string[]> = {
    facebook: ["facebook.com"],
    youtube: ["youtube.com", "youtu.be"],
    instagram: ["instagram.com"],
    linkedin: ["linkedin.com"],
    twitter: ["twitter.com", "x.com"],
};

const hasHostMatch = (hostname: string, domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);

export const normalizeSocialLinkUrl = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return undefined;
        }
        return parsed.toString();
    } catch {
        return undefined;
    }
};

export const inferSocialPlatformFromUrl = (url: string): string | undefined => {
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        for (const [platform, domains] of Object.entries(PLATFORM_HOSTS)) {
            if (domains.some((domain) => hasHostMatch(hostname, domain))) {
                return platform;
            }
        }
    } catch {
        return undefined;
    }

    return undefined;
};

export const sanitizeSocialLinks = (value: unknown): SocialLink[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
            return [];
        }

        const rawPlatform = typeof entry.platform === "string" ? entry.platform.trim().toLowerCase() : "";
        const url = normalizeSocialLinkUrl(entry.url);

        if (!url) {
            return [];
        }

        const platform = rawPlatform || inferSocialPlatformFromUrl(url);
        if (!platform) {
            return [];
        }

        // TODO: tighten accepted social URL patterns if product rules require profile/page-only links.
        const parsed = socialLinkSchema.safeParse({ platform, url });
        return parsed.success ? [parsed.data] : [];
    });
};
