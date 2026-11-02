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

type Props = {
    currentCard: OnboardingCardId;
    statuses: OnboardingCardStatus[];
    skippedCards: OnboardingCardId[];
    completionAcknowledged: boolean;
    previousCard: OnboardingCardId | null;
    navigationSaveFailed: boolean;
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
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState("");
    const cardIndex = ONBOARDING_CARDS.findIndex((card) => card.id === currentCard);
    const current = statuses.find((card) => card.id === currentCard);
    const participation = useMemo(() => statuses.filter((card) => card.kind === "participation"), [statuses]);
    const optional = useMemo(() => statuses.filter((card) => card.kind === "optional"), [statuses]);
    const participationComplete = participation.filter((card) => card.complete).length;
    const optionalComplete = optional.filter((card) => card.complete).length;
    const allRemainingSkipped = statuses.every((card) => card.complete || skippedCards.includes(card.id));
    const firstUnskippedIncomplete = statuses.find((card) => !card.complete && !skippedCards.includes(card.id));

    const go = (operation: () => Promise<{ success: boolean; card?: string; message?: string }>) => {
        setError("");
        startTransition(async () => {
            try {
                const result = await operation();
                if (!result.success) {
                    setError(result.message ?? "Your progress could not be saved. Please try again.");
                    return;
                }
                if (result.card) router.push(`/onboarding?card=${encodeURIComponent(result.card)}`);
                else router.refresh();
            } catch {
                setError("We couldn’t save your onboarding progress. Please try again.");
            }
        });
    };

    const next = getNextOnboardingCardInSequence(currentCard);

    if (completionAcknowledged) {
        return (
            <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center justify-center p-4 sm:p-6">
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
                                <StepLink key={step.id} step={step} current={false} />
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
        <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:flex-row">
            <aside className="w-full shrink-0 space-y-4 lg:w-72" aria-label="Onboarding progress">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Participation readiness</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            {participationComplete} of 3 required steps complete
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {participation.map((step) => (
                            <StepLink key={step.id} step={step} current={step.id === currentCard} />
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Optional profile improvements</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            {optionalComplete} of {optional.length} complete
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {optional.map((step) => (
                            <StepLink key={step.id} step={step} current={step.id === currentCard} />
                        ))}
                    </CardContent>
                </Card>
            </aside>

            <Card className="w-full self-start">
                <CardHeader>
                    <p className="text-sm font-medium text-muted-foreground">
                        Step {cardIndex + 1} of {ONBOARDING_CARDS.length}
                    </p>
                    <CardTitle className="text-2xl">{current?.title}</CardTitle>
                    <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
                        {current?.kind === "participation" ? "Required for participation" : "Optional"}
                    </span>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-base leading-7">{STEP_COPY[currentCard]}</p>
                    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        Your progress is saved to your profile. The individual onboarding editors will be added in a
                        later milestone; you can browse Kamooni in the meantime.
                    </p>
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
                            disabled={pending || !previousCard}
                            onClick={() => previousCard && go(() => navigateOnboardingCard(previousCard))}
                        >
                            Back
                        </Button>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            {current && !current.complete && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="min-h-11"
                                    disabled={pending}
                                    onClick={() => go(() => skipOnboardingCard(currentCard))}
                                >
                                    Skip for now
                                </Button>
                            )}
                            {next ? (
                                <Button
                                    type="button"
                                    className="min-h-11"
                                    disabled={pending}
                                    onClick={() => go(() => navigateOnboardingCard(next))}
                                >
                                    {pending ? "Saving…" : "Continue"}
                                </Button>
                            ) : allRemainingSkipped ? (
                                <Button
                                    type="button"
                                    className="min-h-11"
                                    disabled={pending}
                                    onClick={() => go(acknowledgeOnboardingCompletion)}
                                >
                                    {pending ? "Saving…" : "Finish for now"}
                                </Button>
                            ) : firstUnskippedIncomplete && firstUnskippedIncomplete.id !== currentCard ? (
                                <Button
                                    type="button"
                                    className="min-h-11"
                                    disabled={pending}
                                    onClick={() => go(() => navigateOnboardingCard(firstUnskippedIncomplete.id))}
                                >
                                    Review remaining steps
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    );
}

function StepLink({ step, current }: { step: OnboardingCardStatus; current: boolean }) {
    return (
        <Link
            href={`/onboarding?card=${encodeURIComponent(step.id)}`}
            aria-current={current ? "step" : undefined}
            className={`flex min-h-10 items-center rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current ? "bg-muted font-semibold" : ""}`}
        >
            <span>{step.title}</span>
            {step.complete && <span className="ml-auto text-xs text-muted-foreground">Done</span>}
        </Link>
    );
}
