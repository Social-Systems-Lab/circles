import type { Media } from "@/models/models";

export const DEFAULT_HERO_IMAGE_URLS = [
    "/images/default-heroes/kamooni-hero-01.webp",
    "/images/default-heroes/kamooni-hero-02.webp",
    "/images/default-heroes/kamooni-hero-03.webp",
    "/images/default-heroes/kamooni-hero-04.webp",
    "/images/default-heroes/kamooni-hero-05.webp",
    "/images/default-heroes/kamooni-hero-06.webp",
    "/images/default-heroes/kamooni-hero-07.webp",
] as const;

const getStableHeroIndex = (stableKey?: string): number => {
    if (!stableKey) {
        return 0;
    }

    let hash = 0;
    for (const char of stableKey) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return hash % DEFAULT_HERO_IMAGE_URLS.length;
};

export const getDefaultHeroImage = (stableKey?: string): Media => {
    const url = DEFAULT_HERO_IMAGE_URLS[getStableHeroIndex(stableKey)];

    return {
        name: url.split("/").pop() ?? "kamooni-default-hero.webp",
        type: "image/webp",
        fileInfo: { url },
    };
};

export const hasCircleImages = (images?: Media[]): boolean => Boolean(images?.length);
