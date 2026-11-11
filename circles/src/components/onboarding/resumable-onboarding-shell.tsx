"use client";

import Image from "next/image";
import Link from "next/link";
import { Montserrat, Noto_Serif } from "next/font/google";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import styles from "./resumable-onboarding.module.css";

const montserrat = Montserrat({
    subsets: ["latin"],
    variable: "--font-onboarding-sans",
});

const notoSerif = Noto_Serif({
    subsets: ["latin"],
    variable: "--font-onboarding-serif",
});

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

function OnboardingBrand() {
    return (
        <div className={styles.brand}>
            <div className={styles.brandMark}>
                <Image src="/images/kamooni_logo.png" alt="" fill sizes="54px" className="object-contain p-2" />
            </div>
            <div>
                <p className={styles.brandName}>Kamooni</p>
                <p className={styles.brandTagline}>Find the others</p>
            </div>
            <div className={styles.brandArt} aria-hidden="true">
                <Image
                    src="/images/landing/hero-illustration.png"
                    alt=""
                    fill
                    sizes="(min-width: 640px) 108px, 84px"
                    className="object-cover"
                />
            </div>
        </div>
    );
}

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
    const requiredStepsComplete = participationComplete === participation.length;
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
            <main className={cn(montserrat.variable, notoSerif.variable, styles.surface)}>
                <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-[calc(5rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pb-6 sm:pt-[calc(5rem+env(safe-area-inset-top,0px))]">
                    <div className={styles.frame}>
                        <OnboardingBrand />
                        <Card className={styles.completionCard}>
                            <CardContent className={styles.completionContent}>
                                <div className={styles.completionMark}>
                                    <Image
                                        src="/images/kamooni_logo.png"
                                        alt=""
                                        fill
                                        sizes="80px"
                                        className="object-contain p-4"
                                    />
                                </div>
                                <h1 className={styles.completionTitle}>Welcome to Kamooni.</h1>
                                <p className={styles.completionCopy}>
                                    Your onboarding is saved. You can return any time to keep building your profile.
                                </p>
                                {participationComplete < participation.length && (
                                    <p role="status" className={cn("p-3", styles.statusPanel)}>
                                        You can browse Kamooni. Some participation features stay unavailable until the
                                        required steps are complete.
                                    </p>
                                )}
                                {statuses.length > 0 && (
                                    <div className="mt-4">
                                        <Button asChild variant="outline" className={styles.secondaryAction}>
                                            <Link
                                                href={`/onboarding?card=${encodeURIComponent(
                                                    statuses.find((step) => !step.complete)?.id ?? currentCard,
                                                )}`}
                                            >
                                                Return to an unfinished step
                                            </Link>
                                        </Button>
                                    </div>
                                )}
                                <details className={styles.completionSteps}>
                                    <summary>Review your steps</summary>
                                    <nav aria-label="Review onboarding steps" className="grid gap-2 sm:grid-cols-2">
                                        {statuses.map((step) => (
                                            <StepLink key={step.id} step={step} current={false} onSelect={navigate} />
                                        ))}
                                    </nav>
                                </details>
                                <div className="mt-5">
                                    <Button asChild className={styles.primaryAction}>
                                        <Link href="/explore">Continue to Kamooni</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className={cn(montserrat.variable, notoSerif.variable, styles.surface)}>
            <div className="mx-auto flex min-h-[70vh] w-full flex-col gap-4 px-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-[calc(5rem+env(safe-area-inset-top,0px))] sm:gap-5 sm:px-6 sm:pb-6 sm:pt-[calc(5rem+env(safe-area-inset-top,0px))]">
                <div className={styles.frame}>
                    <OnboardingBrand />

                    <Card className={styles.progressCard}>
                        <CardContent className={styles.progressContent}>
                            <div className={styles.progressHeader}>
                                <p className={styles.stepLabel}>
                                    Step {cardIndex + 1} of {ONBOARDING_CARDS.length}
                                </p>
                                <p className={styles.progressSummary}>
                                    {participationComplete}/3 required · {optionalComplete}/{optional.length} optional
                                </p>
                            </div>
                            <progress
                                aria-label="Onboarding progress"
                                value={cardIndex + 1}
                                max={ONBOARDING_CARDS.length}
                                className={styles.progress}
                            />
                            <details className={styles.progressDetails}>
                                <summary>View progress</summary>
                                <div className={styles.progressDetailsGrid}>
                                    <section aria-label="Participation readiness">
                                        <h2 className={styles.progressSectionTitle}>Participation readiness</h2>
                                        <p className={styles.progressSectionSummary}>
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
                                        <h2 className={styles.progressSectionTitle}>Optional profile improvements</h2>
                                        <p className={styles.progressSectionSummary}>
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

                    <Card className={styles.contentCard}>
                        <CardHeader className={styles.contentHeader}>
                            <div className={styles.contentTitleRow}>
                                <div>
                                    <p className={styles.eyebrow}>
                                        Step {cardIndex + 1} of {ONBOARDING_CARDS.length}
                                    </p>
                                    <h1 className={styles.contentTitle}>{current?.title}</h1>
                                </div>
                                <span
                                    className={cn(styles.badge, current?.kind === "optional" && styles.badgeOptional)}
                                >
                                    {current?.kind === "participation" ? "Required" : "Optional"}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className={cn("space-y-6", styles.content)}>
                            <p className={styles.lead}>{STEP_COPY[currentCard]}</p>
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
                                <p className={cn("p-4 text-sm", styles.statusPanel)}>
                                    Email verification is handled through the link sent to your inbox. Your other
                                    onboarding steps are still available while you browse.
                                </p>
                            )}
                            {(navigationSaveFailed || error) && (
                                <p role="alert" className={cn("text-sm", styles.alert)}>
                                    {navigationSaveFailed
                                        ? "This step is open, but we couldn’t save your place. Please try again."
                                        : error}
                                </p>
                            )}
                            <div className={styles.actions}>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={styles.secondaryAction}
                                    disabled={pending || cardSaving || !previousCard}
                                    onClick={() => previousCard && navigate(previousCard)}
                                >
                                    Back
                                </Button>
                                <div className={styles.actionGroup}>
                                    {current && !current.complete && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className={styles.ghostAction}
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
                                            className={styles.primaryAction}
                                            disabled={pending || cardSaving}
                                            onClick={() => navigate(next)}
                                        >
                                            {pending ? "Saving…" : "Continue"}
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            className={styles.primaryAction}
                                            disabled={pending || cardSaving}
                                            onClick={() => go(acknowledgeOnboardingCompletion)}
                                        >
                                            {pending
                                                ? "Saving…"
                                                : requiredStepsComplete
                                                  ? "Finish onboarding"
                                                  : "Finish for now"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
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
            className={cn(styles.stepLink, current && styles.stepLinkCurrent)}
        >
            <span>{step.title}</span>
            {step.complete && <span className={styles.stepDone}>Done</span>}
        </Link>
    );
}
