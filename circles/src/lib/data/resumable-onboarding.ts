import "server-only";

import type { Circle, OnboardingCardId, ResumableOnboardingState } from "@/models/models";
import { Circles, HumanityVerifications } from "@/lib/data/db";
import { createInitialOnboardingState } from "@/lib/onboarding/resumable-state";

export type PersonalOnboardingProfile = Pick<
    Circle,
    | "did"
    | "circleType"
    | "isEmailVerified"
    | "description"
    | "content"
    | "communityGuidelinesAcceptance"
    | "location"
    | "picture"
    | "onboardingState"
>;

const ONBOARDING_PROFILE_PROJECTION = {
    did: 1,
    circleType: 1,
    isEmailVerified: 1,
    description: 1,
    content: 1,
    communityGuidelinesAcceptance: 1,
    location: 1,
    picture: 1,
    onboardingState: 1,
};

export const hasActiveRealPersonAttestation = async (subjectDid: string): Promise<boolean> => {
    return Boolean(
        await HumanityVerifications.findOne(
            {
                subjectDid,
                level: "real_person",
                $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
            },
            { projection: { _id: 1 } },
        ),
    );
};

export const getPersonalOnboardingProfile = async (did: string): Promise<PersonalOnboardingProfile | null> => {
    return (await Circles.findOne(
        { did, circleType: "user" },
        { projection: ONBOARDING_PROFILE_PROJECTION },
    )) as PersonalOnboardingProfile | null;
};

export const ensurePersonalOnboardingState = async (
    did: string,
    hasQualifyingHumanityAttestation = false,
): Promise<{ profile: PersonalOnboardingProfile; state: ResumableOnboardingState } | null> => {
    let profile = await getPersonalOnboardingProfile(did);
    if (!profile) return null;

    if (!profile.onboardingState) {
        const initial = createInitialOnboardingState(profile, new Date(), hasQualifyingHumanityAttestation);
        await Circles.updateOne(
            { did, circleType: "user", onboardingState: { $exists: false } },
            { $set: { onboardingState: initial } },
        );
        profile = await getPersonalOnboardingProfile(did);
        if (!profile) return null;
    }

    const state = profile.onboardingState;
    if (!state || state.version !== 1) return null;

    const lastSeenAt = new Date();
    await Circles.updateOne(
        { did, circleType: "user", "onboardingState.version": 1 },
        { $set: { "onboardingState.lastSeenAt": lastSeenAt } },
    );
    state.lastSeenAt = lastSeenAt;
    return { profile, state };
};

export const persistOnboardingNavigation = async (did: string, card: OnboardingCardId): Promise<boolean> => {
    const result = await Circles.updateOne(
        { did, circleType: "user", "onboardingState.version": 1 },
        { $set: { "onboardingState.currentCard": card, "onboardingState.lastSeenAt": new Date() } },
    );
    return result.matchedCount === 1;
};

export const persistOnboardingSkip = async (
    did: string,
    card: OnboardingCardId,
    nextCard: OnboardingCardId,
): Promise<boolean> => {
    const result = await Circles.updateOne(
        { did, circleType: "user", "onboardingState.version": 1 },
        {
            $addToSet: { "onboardingState.skippedCards": card },
            $set: { "onboardingState.currentCard": nextCard, "onboardingState.lastSeenAt": new Date() },
        },
    );
    return result.matchedCount === 1;
};

export const persistOnboardingCompletionAcknowledgement = async (did: string): Promise<boolean> => {
    const result = await Circles.updateOne(
        { did, circleType: "user", "onboardingState.version": 1 },
        {
            $set: {
                "onboardingState.completionAcknowledgedAt": new Date(),
                "onboardingState.lastSeenAt": new Date(),
            },
        },
    );
    return result.matchedCount === 1;
};
