import type { Circle } from "@/models/models";
import { isCommunityGuidelinesCompleted } from "@/lib/community-guidelines";

export const DEFAULT_PROFILE_IMAGE_PATHS = new Set(["/images/default-user-picture.png", "/images/default-picture.png"]);

export type ProfileCompletionRequirements = {
    hasRealProfileImage: boolean;
    hasAboutText: boolean;
    hasAcceptedCommunityGuidelines: boolean;
};

export type ParticipationRequirementId = "verified-email" | "introduction" | "community-guidelines";

export type ParticipationReadiness = {
    ready: boolean;
    requirements: Record<ParticipationRequirementId, boolean>;
    missingRequirements: ParticipationRequirementId[];
};

export type OptionalProfileImprovementId = "profile-image" | "location" | "proof-of-humanity";

export type OptionalProfileImprovements = {
    completed: Record<OptionalProfileImprovementId, boolean>;
    missing: OptionalProfileImprovementId[];
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

export const hasSelectedProfileLocation = (circle?: Partial<Circle> | null): boolean => {
    const location = circle?.location;
    const lng = location?.lngLat?.lng;
    const lat = location?.lngLat?.lat;
    const precision = location?.precision;

    return Boolean(
        Number.isInteger(precision) &&
            Number(precision) >= 0 &&
            Number(precision) <= 4 &&
            Number.isFinite(lng) &&
            Number(lng) >= -180 &&
            Number(lng) <= 180 &&
            Number.isFinite(lat) &&
            Number(lat) >= -90 &&
            Number(lat) <= 90,
    );
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

export const getParticipationReadiness = (user: ParticipationSubject): ParticipationReadiness => {
    const requirements: Record<ParticipationRequirementId, boolean> = {
        "verified-email": hasConfirmedAccountContactMethod(user),
        introduction: user?.circleType === "user" && hasProfileAboutText(user),
        "community-guidelines": user?.circleType === "user" && hasCompletedCommunityGuidelines(user),
    };
    const missingRequirements = (Object.keys(requirements) as ParticipationRequirementId[]).filter(
        (requirement) => !requirements[requirement],
    );

    return {
        ready: canBypassProfileCompletionRequirement(user) || missingRequirements.length === 0,
        requirements,
        missingRequirements,
    };
};

export const getOptionalProfileImprovements = (
    profile: ParticipationSubject,
    options: { hasProofOfHumanity?: boolean } = {},
): OptionalProfileImprovements => {
    const completed: Record<OptionalProfileImprovementId, boolean> = {
        "profile-image": hasRealProfileImage(profile),
        location: hasSelectedProfileLocation(profile),
        "proof-of-humanity": options.hasProofOfHumanity === true,
    };

    return {
        completed,
        missing: (Object.keys(completed) as OptionalProfileImprovementId[]).filter((item) => !completed[item]),
    };
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

    const readiness = getParticipationReadiness(user);
    if (!readiness.requirements.introduction) {
        return "profile_incomplete";
    }

    if (!readiness.requirements["community-guidelines"]) {
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
