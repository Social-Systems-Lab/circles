import type { ParticipationBlockReason } from "@/lib/profile-completion";

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
