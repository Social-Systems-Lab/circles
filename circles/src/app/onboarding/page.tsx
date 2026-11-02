import { redirect } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import {
    ensurePersonalOnboardingState,
    hasActiveRealPersonAttestation,
    persistOnboardingNavigation,
} from "@/lib/data/resumable-onboarding";
import {
    getOnboardingCardStatuses,
    getOnboardingNavigationTarget,
    getPreviousOnboardingCard,
    isOnboardingCardId,
} from "@/lib/onboarding/resumable-state";
import OnboardingShell from "@/components/onboarding/resumable-onboarding-shell";

export const dynamic = "force-dynamic";

type OnboardingPageProps = {
    searchParams: Promise<{ card?: string }>;
};

export default async function ResumableOnboardingPage({ searchParams }: OnboardingPageProps) {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) redirect("/login?redirectTo=%2Fonboarding");

    const hasPoH = await hasActiveRealPersonAttestation(userDid);
    const result = await ensurePersonalOnboardingState(userDid, hasPoH);
    if (!result) redirect("/explore");

    const params = await searchParams;
    if (params.card && !isOnboardingCardId(params.card)) redirect("/onboarding");

    const statuses = getOnboardingCardStatuses(result.profile, hasPoH);
    const requestedCard = isOnboardingCardId(params.card) ? params.card : undefined;
    const currentCard = getOnboardingNavigationTarget(requestedCard, result.profile, result.state, hasPoH);

    let navigationSaveFailed = false;
    if (currentCard !== result.state.currentCard) {
        try {
            navigationSaveFailed = !(await persistOnboardingNavigation(userDid, currentCard));
        } catch {
            navigationSaveFailed = true;
        }
    }

    return (
        <OnboardingShell
            currentCard={currentCard}
            statuses={statuses}
            skippedCards={result.state.skippedCards}
            completionAcknowledged={
                Boolean(result.state.completionAcknowledgedAt) && !requestedCard && !navigationSaveFailed
            }
            previousCard={getPreviousOnboardingCard(currentCard)}
            navigationSaveFailed={navigationSaveFailed}
        />
    );
}
