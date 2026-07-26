import type { ParticipationBlockReason } from "@/lib/profile-completion";
import { getEmailVerificationSettingsHref } from "@/lib/auth/email-verification-recovery";

export type CommunityComposerState = "hidden" | "guarded" | "enabled";

export type CommunityParticipationStateInput = {
    hasPostPermission: boolean;
    canParticipate: boolean;
    participationBlockReason: ParticipationBlockReason | null;
};

export const getCommunityComposerState = ({
    hasPostPermission,
    canParticipate,
    participationBlockReason,
}: CommunityParticipationStateInput): CommunityComposerState => {
    if (!hasPostPermission) {
        return "hidden";
    }

    if (!canParticipate || participationBlockReason) {
        return "guarded";
    }

    return "enabled";
};

export const shouldGuardCommunityInteractions = ({
    hasPostPermission,
    canParticipate,
    participationBlockReason,
}: CommunityParticipationStateInput): boolean => {
    return hasPostPermission && (!canParticipate || participationBlockReason !== null);
};

export const getCommunityReadinessHref = (reason: ParticipationBlockReason, userHandle?: string | null): string => {
    if (reason === "email_unverified") {
        return getEmailVerificationSettingsHref(userHandle);
    }

    return userHandle ? `/circles/${userHandle}/home` : "/circles";
};
