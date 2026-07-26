import type { Circle } from "@/models/models";
import { isCommunityGuidelinesCompleted } from "@/lib/community-guidelines";

export const DEFAULT_PROFILE_IMAGE_PATHS = new Set(["/images/default-user-picture.png", "/images/default-picture.png"]);

export type ProfileCompletionRequirements = {
    hasRealProfileImage: boolean;
    hasAboutText: boolean;
    hasAcceptedCommunityGuidelines: boolean;
};

export type ParticipationBlockReason = "email_unverified" | "profile_incomplete" | "guidelines_incomplete";

type ParticipationSubject = Partial<Circle> | null | undefined;

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

export const canBypassProfileCompletionRequirement = (user: ParticipationSubject): boolean => {
    return user?.isAdmin === true;
};

export const hasConfirmedAccountContactMethod = (user: ParticipationSubject): boolean => {
    // Email verification is the current confirmed account-contact/recovery method for email/password users.
    return user?.isEmailVerified === true;
};

export const canParticipate = (user: ParticipationSubject): boolean => {
    return getParticipationBlockReason(user) === null;
};

export const getParticipationBlockReason = (user: ParticipationSubject): ParticipationBlockReason | null => {
    if (canBypassProfileCompletionRequirement(user)) {
        return null;
    }

    if (!user) {
        return "profile_incomplete";
    }

    if (!hasConfirmedAccountContactMethod(user)) {
        return "email_unverified";
    }

    if (user?.circleType !== "user") {
        return "profile_incomplete";
    }

    const requirements = getProfileCompletionRequirements(user);
    if (!requirements.hasRealProfileImage || !requirements.hasAboutText) {
        return "profile_incomplete";
    }

    if (!requirements.hasAcceptedCommunityGuidelines) {
        return "guidelines_incomplete";
    }

    return null;
};

export const getParticipationRequiredMessage = (action: string, user?: ParticipationSubject): string => {
    const reason = getParticipationBlockReason(user);
    if (reason === "email_unverified") {
        return `Verify your email before you can ${action}.`;
    }
    if (reason === "guidelines_incomplete") {
        return `Accept the Community Guidelines before you can ${action}.`;
    }

    return `Complete your profile before you can ${action}.`;
};
