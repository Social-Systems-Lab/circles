"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import {
    ensurePersonalOnboardingState,
    hasActiveRealPersonAttestation,
    persistOnboardingCompletionAcknowledgement,
    persistOnboardingNavigation,
    persistOnboardingSkip,
} from "@/lib/data/resumable-onboarding";
import { getNextOnboardingCard, getOnboardingCardStatuses, isOnboardingCardId } from "@/lib/onboarding/resumable-state";
import { revalidatePath } from "next/cache";
import { getCircleDefaultPath } from "@/lib/utils/circle-routes";

export type OnboardingNavigationResult = { success: boolean; card?: string; redirectTo?: string; message?: string };

const loadOwnOnboarding = async () => {
    const did = await getAuthenticatedUserDid();
    if (!did) return null;
    const hasPoH = await hasActiveRealPersonAttestation(did);
    const result = await ensurePersonalOnboardingState(did, hasPoH);
    return result ? { did, ...result, hasPoH } : null;
};

export async function navigateOnboardingCard(cardValue: unknown): Promise<OnboardingNavigationResult> {
    if (!isOnboardingCardId(cardValue)) return { success: false, message: "That onboarding step is unavailable." };
    const own = await loadOwnOnboarding();
    if (!own) return { success: false, message: "Please sign in to continue onboarding." };
    const saved = await persistOnboardingNavigation(own.did, cardValue);
    if (!saved) return { success: false, message: "Your onboarding progress could not be saved." };
    revalidatePath("/onboarding");
    return { success: true, card: cardValue };
}

export async function skipOnboardingCard(cardValue: unknown): Promise<OnboardingNavigationResult> {
    if (!isOnboardingCardId(cardValue)) return { success: false, message: "That onboarding step is unavailable." };
    const own = await loadOwnOnboarding();
    if (!own) return { success: false, message: "Please sign in to continue onboarding." };
    const status = getOnboardingCardStatuses(own.profile, own.hasPoH).find((item) => item.id === cardValue);
    if (!status || status.complete) return { success: false, message: "That step is already complete or unavailable." };
    const skipped = Array.from(new Set([...own.state.skippedCards, cardValue]));
    const nextCard = getNextOnboardingCard(cardValue, own.profile, skipped, own.hasPoH);
    const saved = await persistOnboardingSkip(own.did, cardValue, nextCard);
    if (!saved) return { success: false, message: "Your onboarding progress could not be saved." };
    revalidatePath("/onboarding");
    return { success: true, card: nextCard };
}

export async function acknowledgeOnboardingCompletion(): Promise<OnboardingNavigationResult> {
    const own = await loadOwnOnboarding();
    if (!own) return { success: false, message: "Please sign in to continue onboarding." };
    const saved = await persistOnboardingCompletionAcknowledgement(own.did);
    if (!saved) return { success: false, message: "Your progress could not be saved." };
    revalidatePath("/onboarding");
    return { success: true, redirectTo: getCircleDefaultPath(own.profile) };
}
