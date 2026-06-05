export const WELCOME_BANNER_KEY = "welcome_banner" as const;

export const PLATFORM_BANNER_TYPES = ["alert", "announcement", "cta"] as const;

export type PlatformBannerType = (typeof PLATFORM_BANNER_TYPES)[number];

export const DEFAULT_WELCOME_BANNER_TEXT =
    "Kamooni is currently in active development during our Test Pilot phase. You may encounter occasional bugs while we improve the platform together.";
