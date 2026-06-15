import type { Media } from "@/models/models";

export const DEFAULT_HERO_IMAGE_URLS = [
    "/peerify/artist.jpg",
    "/peerify/fans.jpg",
    "/peerify/hosts.jpg",
    "/peerify/everyone.jpg",
    "/peerify/about.jpg",
    "/peerify/contact.jpg",
    "/peerify/involved.jpg",
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
        name: url.split("/").pop() ?? "peerify-default-hero.jpg",
        type: "image/jpeg",
        fileInfo: { url },
    };
};

export const hasCircleImages = (images?: Media[]): boolean => Boolean(images?.length);
