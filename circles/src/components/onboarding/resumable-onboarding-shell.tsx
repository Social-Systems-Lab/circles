"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingCardId } from "@/models/models";
import type { OnboardingCardStatus } from "@/lib/onboarding/resumable-state";
import { getNextOnboardingCardInSequence, ONBOARDING_CARDS } from "@/lib/onboarding/resumable-state";
import { acknowledgeOnboardingCompletion, navigateOnboardingCard, skipOnboardingCard } from "@/app/onboarding/actions";
import {
    CommunityGuidelinesOnboardingCard,
    HumanVerificationOnboardingCard,
    IntroductionOnboardingCard,
    LocationOnboardingCard,
    ProfilePhotoOnboardingCard,
} from "@/components/onboarding/resumable-onboarding-cards";
import type { CommunityGuidelineAgreementState } from "@/lib/community-guidelines";
import type { Location } from "@/models/models";

type Props = {
    currentCard: OnboardingCardId;
    statuses: OnboardingCardStatus[];
    skippedCards: OnboardingCardId[];
    completionAcknowledged: boolean;
    previousCard: OnboardingCardId | null;
    navigationSaveFailed: boolean;
    profile: {
        circleId?: string;
        handle?: string;
        description?: string;
        content?: string;
        communityGuidelinesAcceptance?: Partial<CommunityGuidelineAgreementState>;
        location?: Location;
        pictureUrl?: string;
    };
    humanVerification: { realPersonCount: number; metInRealLifeCount: number };
};

const STEP_COPY: Record<OnboardingCardId, string> = {
    "email-verification":
        "Email verification is a required participation step. Your account needs a verified email address.",
    introduction: "A short introduction helps people in the community get to know you.",
    "community-guidelines": "Review and accept the Community Guidelines before taking part.",
    location: "Adding a location is optional and helps people discover nearby members.",
    "profile-photo": "A profile picture is optional for participation. You can add one whenever you are ready.",
    "proof-of-humanity": "Human verification is optional in this onboarding phase.",
};

export default function OnboardingShell({
    currentCard,
    statuses,
    skippedCards,
    completionAcknowledged,
    previousCard,
    navigationSaveFailed,
    profile,
    humanVerification,
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [cardSaving, setCardSaving] = useState(false);
    const cardIndex = ONBOARDING_CARDS.findIndex((card) => card.id === currentCard);
    const current = statuses.find((card) => card.id === currentCard);
    const participation = useMemo(() => statuses.filter((card) => card.kind === "participation"), [statuses]);
    const optional = useMemo(() => statuses.filter((card) => card.kind === "optional"), [statuses]);
    const participationComplete = participation.filter((card) => card.complete).length;
    const optionalComplete = optional.filter((card) => card.complete).length;
    const go = (
        operation: () => Promise<{ success: boolean; card?: string; redirectTo?: string; message?: string }>,
    ) => {
        setError("");
        startTransition(async () => {
            try {
                const result = await operation();
                if (!result.success) {
                    setError(result.message ?? "Your progress could not be saved. Please try again.");
                    return;
                }
                if (result.redirectTo) router.push(result.redirectTo);
                else if (result.card) router.push(`/onboarding?card=${encodeURIComponent(result.card)}`);
                else router.refresh();
            } catch {
                setError("We couldn’t save your onboarding progress. Please try again.");
            }
        });
    };

    const navigate = (card: OnboardingCardId) => {
        if (cardSaving) {
            setError("Please wait for this save to finish before changing steps.");
            return;
        }
        if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave this step and discard them?")) return;
        go(() => navigateOnboardingCard(card));
    };

    const next = getNextOnboardingCardInSequence(currentCard);

    if (completionAcknowledged) {
        return (
            <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-[calc(5rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pb-6 sm:pt-[calc(5rem+env(safe-area-inset-top,0px))]">
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle className="text-2xl">Your onboarding is saved</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <p className="text-muted-foreground">You can return here any time to continue your profile.</p>
                        {statuses.length > 0 && (
                            <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
                                <Link
                                    href={`/onboarding?card=${encodeURIComponent(
                                        statuses.find((step) => !step.complete)?.id ?? currentCard,
                                    )}`}
                                >
                                    Return to an unfinished step
                                </Link>
                            </Button>
                        )}
                        <nav aria-label="Review onboarding steps" className="grid gap-2 sm:grid-cols-2">
                            {statuses.map((step) => (
                                <StepLink key={step.id} step={step} current={false} onSelect={navigate} />
                            ))}
                        </nav>
                        {participationComplete < participation.length && (
                            <p role="status" className="rounded-md bg-muted p-3 text-sm">
                                You can browse Kamooni. Some participation features stay unavailable until the required
                                steps are complete.
                            </p>
                        )}
                        <Button asChild className="min-h-11 w-full sm:w-auto">
                            <Link href="/explore">Continue to Kamooni</Link>
                        </Button>
                    </CardContent>
                </Card>
            </main>
        );
    }

    return (
        <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col gap-4 px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-[calc(5rem+env(safe-area-inset-top,0px))] sm:gap-5 sm:px-6 sm:pb-6 sm:pt-[calc(5rem+env(safe-area-inset-top,0px))]">
            <Card className="w-full">
                <CardContent className="space-y-3 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                            Step {cardIndex + 1} of {ONBOARDING_CARDS.length}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {participationComplete}/3 required · {optionalComplete}/{optional.length} optional
                        </p>
                    </div>
                    <progress
                        aria-label="Onboarding progress"
                        value={cardIndex + 1}
                        max={ONBOARDING_CARDS.length}
                        className="h-2 w-full accent-primary"
                    />
                    <details>
                        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            View progress
                        </summary>
                        <div className="grid gap-4 border-t pt-3 sm:grid-cols-2">
                            <section aria-label="Participation readiness">
                                <h2 className="mb-2 text-sm font-semibold">Participation readiness</h2>
                                <p className="mb-2 text-sm text-muted-foreground">
                                    {participationComplete} of 3 required steps complete
                                </p>
                                <div className="space-y-1">
                                    {participation.map((step) => (
                                        <StepLink
                                            key={step.id}
                                            step={step}
                                            current={step.id === currentCard}
                                            onSelect={navigate}
                                        />
                                    ))}
                                </div>
                            </section>
                            <section aria-label="Optional profile improvements">
                                <h2 className="mb-2 text-sm font-semibold">Optional profile improvements</h2>
                                <p className="mb-2 text-sm text-muted-foreground">
                                    {optionalComplete} of {optional.length} complete
                                </p>
                                <div className="space-y-1">
                                    {optional.map((step) => (
                                        <StepLink
                                            key={step.id}
                                            step={step}
                                            current={step.id === currentCard}
                                            onSelect={navigate}
                                        />
                                    ))}
                                </div>
                            </section>
                        </div>
                    </details>
                </CardContent>
            </Card>

            <Card className="w-full self-start">
                <CardHeader>
                    <CardTitle className="text-2xl">{current?.title}</CardTitle>
                    <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
                        {current?.kind === "participation" ? "Required for participation" : "Optional"}
                    </span>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-base leading-7">{STEP_COPY[currentCard]}</p>
                    {currentCard === "introduction" && (
                        <IntroductionOnboardingCard
                            key={currentCard}
                            profile={profile}
                            humanVerification={humanVerification}
                            onUnsavedChange={setHasUnsavedChanges}
                            onSavingChange={setCardSaving}
                            onSaved={() => {
                                setHasUnsavedChanges(false);
                                router.refresh();
                            }}
                        />
                    )}
                    {currentCard === "community-guidelines" && (
                        <CommunityGuidelinesOnboardingCard
                            key={currentCard}
                            profile={profile}
                            humanVerification={humanVerification}
                            onUnsavedChange={setHasUnsavedChanges}
                            onSavingChange={setCardSaving}
                            onSaved={() => {
                                setHasUnsavedChanges(false);
                                router.refresh();
                            }}
                        />
                    )}
                    {currentCard === "location" && (
                        <LocationOnboardingCard
                            key={currentCard}
                            profile={profile}
                            humanVerification={humanVerification}
                            onUnsavedChange={setHasUnsavedChanges}
                            onSavingChange={setCardSaving}
                            onSaved={() => {
                                setHasUnsavedChanges(false);
                                router.refresh();
                            }}
                        />
                    )}
                    {currentCard === "profile-photo" && (
                        <ProfilePhotoOnboardingCard
                            key={currentCard}
                            profile={profile}
                            humanVerification={humanVerification}
                            onUnsavedChange={setHasUnsavedChanges}
                            onSavingChange={setCardSaving}
                            onSaved={() => {
                                setHasUnsavedChanges(false);
                                router.refresh();
                            }}
                        />
                    )}
                    {currentCard === "proof-of-humanity" && (
                        <HumanVerificationOnboardingCard
                            key={currentCard}
                            profile={profile}
                            humanVerification={humanVerification}
                            onUnsavedChange={setHasUnsavedChanges}
                            onSavingChange={setCardSaving}
                            onSaved={() => {
                                setHasUnsavedChanges(false);
                                router.refresh();
                            }}
                        />
                    )}
                    {currentCard === "email-verification" && (
                        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                            Email verification is handled through the link sent to your inbox. Your other onboarding
                            steps are still available while you browse.
                        </p>
                    )}
                    {(navigationSaveFailed || error) && (
                        <p role="alert" className="text-sm text-destructive">
                            {navigationSaveFailed
                                ? "This step is open, but we couldn’t save your place. Please try again."
                                : error}
                        </p>
                    )}
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={pending || cardSaving || !previousCard}
                            onClick={() => previousCard && navigate(previousCard)}
                        >
                            Back
                        </Button>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            {current && !current.complete && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="min-h-11"
                                    disabled={pending || cardSaving}
                                    onClick={() => {
                                        if (
                                            hasUnsavedChanges &&
                                            !window.confirm(
                                                "You have unsaved changes. Skip this step and discard them?",
                                            )
                                        )
                                            return;
                                        go(() => skipOnboardingCard(currentCard));
                                    }}
                                >
                                    Skip for now
                                </Button>
                            )}
                            {next ? (
                                <Button
                                    type="button"
                                    className="min-h-11"
                                    disabled={pending || cardSaving}
                                    onClick={() => navigate(next)}
                                >
                                    {pending ? "Saving…" : "Continue"}
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    className="min-h-11"
                                    disabled={pending || cardSaving}
                                    onClick={() => go(acknowledgeOnboardingCompletion)}
                                >
                                    {pending ? "Saving…" : "Finish for now"}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}

function StepLink({
    step,
    current,
    onSelect,
}: {
    step: OnboardingCardStatus;
    current: boolean;
    onSelect: (card: OnboardingCardId) => void;
}) {
    return (
        <Link
            href={`/onboarding?card=${encodeURIComponent(step.id)}`}
            aria-current={current ? "step" : undefined}
            onClick={(event) => {
                event.preventDefault();
                onSelect(step.id);
            }}
            className={`flex min-h-10 items-center rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current ? "bg-muted font-semibold" : ""}`}
        >
            <span>{step.title}</span>
            {step.complete && <span className="ml-auto text-xs text-muted-foreground">Done</span>}
        </Link>
    );
}
