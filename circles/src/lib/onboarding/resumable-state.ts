import type { Circle, OnboardingCardId, ResumableOnboardingState } from "@/models/models";
import {
    hasCompletedCommunityGuidelines,
    hasProfileAboutText,
    hasRealProfileImage,
    hasSelectedProfileLocation,
} from "@/lib/profile-completion";

export const ONBOARDING_CARDS: ReadonlyArray<{
    id: OnboardingCardId;
    title: string;
    kind: "participation" | "optional";
}> = [
    { id: "email-verification", title: "Verify your email", kind: "participation" },
    { id: "introduction", title: "Introduce yourself", kind: "participation" },
    { id: "community-guidelines", title: "Community Guidelines", kind: "participation" },
    { id: "location", title: "Choose your location", kind: "optional" },
    { id: "profile-photo", title: "Add a profile picture", kind: "optional" },
    { id: "proof-of-humanity", title: "Get human-verified", kind: "optional" },
];

export type OnboardingCardStatus = (typeof ONBOARDING_CARDS)[number] & { complete: boolean };

export const getOnboardingCardStatuses = (
    profile: Partial<Circle>,
    hasQualifyingHumanityAttestation = false,
): OnboardingCardStatus[] =>
    ONBOARDING_CARDS.map((card) => ({
        ...card,
        complete:
            card.id === "email-verification"
                ? profile.isEmailVerified === true
                : card.id === "introduction"
                  ? profile.circleType === "user" && hasProfileAboutText(profile)
                  : card.id === "community-guidelines"
                    ? profile.circleType === "user" && hasCompletedCommunityGuidelines(profile)
                    : card.id === "location"
                      ? hasSelectedProfileLocation(profile)
                      : card.id === "profile-photo"
                        ? hasRealProfileImage(profile)
                        : hasQualifyingHumanityAttestation,
    }));

export const getNextIncompleteOnboardingCard = (
    profile: Partial<Circle>,
    skippedCards: readonly OnboardingCardId[] = [],
    hasQualifyingHumanityAttestation = false,
): OnboardingCardId => {
    const statuses = getOnboardingCardStatuses(profile, hasQualifyingHumanityAttestation);
    return (
        statuses.find((card) => !card.complete && !skippedCards.includes(card.id))?.id ??
        statuses.find((card) => !card.complete)?.id ??
        ONBOARDING_CARDS[ONBOARDING_CARDS.length - 1].id
    );
};

export const getOnboardingNavigationTarget = (
    requestedCard: OnboardingCardId | undefined,
    profile: Partial<Circle>,
    state: ResumableOnboardingState,
    hasQualifyingHumanityAttestation = false,
): OnboardingCardId => {
    const statuses = getOnboardingCardStatuses(profile, hasQualifyingHumanityAttestation);
    if (requestedCard && statuses.some((card) => card.id === requestedCard)) {
        return requestedCard;
    }
    if (!requestedCard) {
        const current = statuses.find((card) => card.id === state.currentCard);
        if (current) return current.id;
    }
    return getNextIncompleteOnboardingCard(profile, state.skippedCards, hasQualifyingHumanityAttestation);
};

export const createInitialOnboardingState = (
    profile: Partial<Circle>,
    now = new Date(),
    hasQualifyingHumanityAttestation = false,
): ResumableOnboardingState => ({
    version: 1,
    currentCard: getNextIncompleteOnboardingCard(profile, [], hasQualifyingHumanityAttestation),
    startedAt: now,
    lastSeenAt: now,
    skippedCards: [],
    completionAcknowledgedAt: null,
});

export const isOnboardingCardId = (value: unknown): value is OnboardingCardId =>
    typeof value === "string" && ONBOARDING_CARDS.some((card) => card.id === value);

export const getNextOnboardingCard = (
    currentCard: OnboardingCardId,
    profile: Partial<Circle>,
    skippedCards: readonly OnboardingCardId[],
    hasQualifyingHumanityAttestation = false,
): OnboardingCardId => {
    const currentIndex = ONBOARDING_CARDS.findIndex((card) => card.id === currentCard);
    const statuses = getOnboardingCardStatuses(profile, hasQualifyingHumanityAttestation);
    const later = statuses.slice(currentIndex + 1).find((card) => !card.complete && !skippedCards.includes(card.id));
    return later?.id ?? statuses.find((card) => !card.complete && !skippedCards.includes(card.id))?.id ?? currentCard;
};

export const getPreviousOnboardingCard = (currentCard: OnboardingCardId): OnboardingCardId | null => {
    const currentIndex = ONBOARDING_CARDS.findIndex((card) => card.id === currentCard);
    return ONBOARDING_CARDS[currentIndex - 1]?.id ?? null;
};

export const getNextOnboardingCardInSequence = (currentCard: OnboardingCardId): OnboardingCardId | null => {
    const currentIndex = ONBOARDING_CARDS.findIndex((card) => card.id === currentCard);
    return ONBOARDING_CARDS[currentIndex + 1]?.id ?? null;
};
