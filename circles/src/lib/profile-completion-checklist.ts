import type { Circle } from "@/models/models";
import {
    getParticipationReadiness,
    getProfileCompletionRequirements,
    isProfileComplete,
} from "@/lib/profile-completion";

export type ProfileCompletionStepId = "profile-image" | "about" | "rules";

export type ProfileCompletionChecklistItem = {
    id: ProfileCompletionStepId;
    label: string;
    description: string;
    complete: boolean;
    actionLabel: string;
    requiredForParticipation: boolean;
};

export type ProfileCompletionChecklistState = {
    items: ProfileCompletionChecklistItem[];
    complete: boolean;
    participationReady: boolean;
};

export const getProfileCompletionChecklistState = (
    profile?: Partial<Circle> | null,
): ProfileCompletionChecklistState => {
    const requirements = getProfileCompletionRequirements(profile);
    const participation = getParticipationReadiness(profile);

    return {
        // Preserve the historical completion/welcome boundary so this milestone does not expand supporter prompts.
        complete: isProfileComplete(profile),
        participationReady: participation.ready,
        items: [
            {
                id: "profile-image",
                label: "Add a profile image",
                description: "Click your current profile image to upload your own.",
                complete: requirements.hasRealProfileImage,
                actionLabel: "Add image",
                requiredForParticipation: false,
            },
            {
                id: "about",
                label: "Introduce yourself",
                description: "Open Settings → About and add a short introduction or About me text.",
                complete: requirements.hasAboutText,
                actionLabel: "Edit About",
                requiredForParticipation: true,
            },
            {
                id: "rules",
                label: "Agree to the Kamooni rules",
                description: "Help us keep Kamooni welcoming, useful and trustworthy.",
                complete: requirements.hasAcceptedCommunityGuidelines,
                actionLabel: "Agree to rules",
                requiredForParticipation: true,
            },
        ],
    };
};
