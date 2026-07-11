import type { Circle } from "@/models/models";
import { isCommunityGuidelinesCompleted } from "@/lib/community-guidelines";

export const DEFAULT_PROFILE_IMAGE_PATHS = new Set(["/images/default-user-picture.png", "/images/default-picture.png"]);

export type ProfileCompletionRequirements = {
    hasRealProfileImage: boolean;
    hasAboutText: boolean;
    hasAcceptedCommunityGuidelines: boolean;
};

const getImagePathname = (url: string): string | null => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        return null;
    }

    try {
        return new URL(trimmedUrl).pathname;
    } catch {
        try {
            return new URL(trimmedUrl, "https://kamooni.local").pathname;
        } catch {
            return null;
        }
    }
};

export const hasRealProfileImageUrl = (url?: string | null): boolean => {
    const pathname = url ? getImagePathname(url) : null;
    return Boolean(pathname && !DEFAULT_PROFILE_IMAGE_PATHS.has(pathname));
};

export const hasRealProfileImage = (circle?: Partial<Circle> | null): boolean => {
    return hasRealProfileImageUrl(circle?.picture?.url);
};

export const hasProfileAboutText = (circle?: Partial<Circle> | null): boolean => {
    return Boolean(circle?.description?.trim() || circle?.content?.trim());
};

export const hasCompletedCommunityGuidelines = (circle?: Partial<Circle> | null): boolean => {
    return isCommunityGuidelinesCompleted(circle?.communityGuidelinesAcceptance);
};

export const getProfileCompletionRequirements = (circle?: Partial<Circle> | null): ProfileCompletionRequirements => ({
    hasRealProfileImage: hasRealProfileImage(circle),
    hasAboutText: hasProfileAboutText(circle),
    hasAcceptedCommunityGuidelines: hasCompletedCommunityGuidelines(circle),
});

export const isProfileComplete = (circle?: Partial<Circle> | null): boolean => {
    if (circle?.circleType !== "user") {
        return false;
    }

    const requirements = getProfileCompletionRequirements(circle);
    return requirements.hasRealProfileImage && requirements.hasAboutText && requirements.hasAcceptedCommunityGuidelines;
};
