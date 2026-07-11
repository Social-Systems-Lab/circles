"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { acceptCommunityGuidelineAction } from "@/components/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    COMMUNITY_GUIDELINE_RULES,
    CommunityGuidelineRuleId,
    createEmptyCommunityGuidelineAgreementState,
    getAcceptedCommunityGuidelineCount,
    hasAcceptedAllCommunityGuidelines,
    isAcceptedCommunityGuidelineRule,
    isCommunityGuidelinesCompleted,
    normalizeCommunityGuidelineAgreementState,
} from "@/lib/community-guidelines";
import { cn } from "@/lib/utils";
import { UserPrivate } from "@/models/models";

const SCREEN_ORDER = ["welcome", "why", ...COMMUNITY_GUIDELINE_RULES.map((rule) => rule.id), "confirmation"] as const;
const CONFIRMATION_SCREEN_INDEX = SCREEN_ORDER.indexOf("confirmation");

const COMMUNITY_GUIDELINES_FLOW_COPY = {
    verification: {
        badge: "Account Verification",
        title: "Kamooni's core community rules",
        welcomeKicker: "Before verification",
        welcomeTitle: "Verification starts with a shared standard.",
        welcomeBody:
            "To request account verification, you first need to actively agree to Kamooni's five core community rules.",
        welcomeNote:
            "This takes less than a minute. It is not legal fine print. It is a clear human commitment to how we work together.",
        whyTitle: "Trust comes before verification.",
        whyBody:
            "Verification signals credibility on Kamooni. These rules set the baseline for honest participation, respect, privacy, and responsible behavior.",
        confirmationTitle: "You're confirmed.",
        confirmationBody:
            "You have actively agreed to all five of Kamooni's core community rules. Your verification request is ready to continue.",
        completingLabel: "Finishing the guidelines step...",
        confirmationButton: "Continue to verification",
    },
    profileCompletion: {
        badge: "Kamooni Rules",
        title: "Kamooni's core community rules",
        welcomeKicker: "Profile completion",
        welcomeTitle: "A shared standard for taking part.",
        welcomeBody:
            "To take part in Kamooni, actively agree to the five core community rules that guide how we work together.",
        welcomeNote:
            "This takes less than a minute. It is not legal fine print. It is a clear human commitment to how we work together.",
        whyTitle: "Trust makes participation possible.",
        whyBody:
            "These rules set the baseline for honest participation, respect, privacy, and responsible behavior.",
        confirmationTitle: "You're all set.",
        confirmationBody: "You have actively agreed to all five of Kamooni's core community rules.",
        completingLabel: "Finishing the rules step...",
        confirmationButton: "Done",
    },
} as const;

const formatAcceptedAt = (value: Date | null) => {
    if (!value) {
        return null;
    }

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(value);
};

export type CommunityGuidelinesFlowResult = {
    success: boolean;
    message?: string;
};

type CommunityGuidelinesAgreementFlowProps = {
    user: UserPrivate | null | undefined;
    onUserChange?: (user: UserPrivate) => void;
    onComplete?: (user: UserPrivate) => Promise<CommunityGuidelinesFlowResult | void>;
    context?: "verification" | "profileCompletion";
};

export function CommunityGuidelinesAgreementFlow({
    user,
    onUserChange,
    onComplete,
    context = "verification",
}: CommunityGuidelinesAgreementFlowProps) {
    const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
    const [acceptanceState, setAcceptanceState] = useState(createEmptyCommunityGuidelineAgreementState);
    const [isSubmittingRule, setIsSubmittingRule] = useState<CommunityGuidelineRuleId | null>(null);
    const [isCompleting, setIsCompleting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const acceptedCount = useMemo(() => getAcceptedCommunityGuidelineCount(acceptanceState), [acceptanceState]);
    const allRulesAccepted = useMemo(() => hasAcceptedAllCommunityGuidelines(acceptanceState), [acceptanceState]);
    const copy = COMMUNITY_GUIDELINES_FLOW_COPY[context];

    useEffect(() => {
        const normalizedState = normalizeCommunityGuidelineAgreementState(user?.communityGuidelinesAcceptance);
        const nextAcceptedCount = getAcceptedCommunityGuidelineCount(normalizedState);

        setAcceptanceState(normalizedState);
        setErrorMessage(null);

        if (!user?._id) {
            setCurrentScreenIndex(0);
            return;
        }

        if (isCommunityGuidelinesCompleted(user.communityGuidelinesAcceptance)) {
            setCurrentScreenIndex(CONFIRMATION_SCREEN_INDEX);
            return;
        }

        if (nextAcceptedCount === 0) {
            setCurrentScreenIndex(0);
            return;
        }

        const nextRuleIndex = COMMUNITY_GUIDELINE_RULES.findIndex(
            (rule) => !isAcceptedCommunityGuidelineRule(normalizedState[rule.id]),
        );
        if (nextRuleIndex === -1) {
            setCurrentScreenIndex(CONFIRMATION_SCREEN_INDEX);
            return;
        }

        setCurrentScreenIndex(SCREEN_ORDER.indexOf(COMMUNITY_GUIDELINE_RULES[nextRuleIndex].id));
    }, [user]);

    const currentScreen = SCREEN_ORDER[currentScreenIndex];
    const currentRule =
        currentScreen !== "welcome" && currentScreen !== "why" && currentScreen !== "confirmation"
            ? COMMUNITY_GUIDELINE_RULES.find((rule) => rule.id === currentScreen)
            : null;

    const goToNextScreen = () => {
        setErrorMessage(null);
        setCurrentScreenIndex((prev) => Math.min(prev + 1, SCREEN_ORDER.length - 1));
    };

    const goToPreviousScreen = () => {
        setErrorMessage(null);
        setCurrentScreenIndex((prev) => Math.max(prev - 1, 0));
    };

    const continueAfterCompletion = async (nextUser: UserPrivate) => {
        if (!onComplete) {
            return;
        }

        setIsCompleting(true);
        setErrorMessage(null);

        try {
            const response = await onComplete(nextUser);
            if (response && response.success === false) {
                setErrorMessage(response.message || "Could not continue.");
            }
        } finally {
            setIsCompleting(false);
        }
    };

    const handleRuleAction = async (ruleId: CommunityGuidelineRuleId) => {
        if (isAcceptedCommunityGuidelineRule(acceptanceState[ruleId])) {
            goToNextScreen();
            return;
        }

        setErrorMessage(null);
        setIsSubmittingRule(ruleId);

        try {
            const response = await acceptCommunityGuidelineAction(ruleId);
            if (!response.success || !response.user) {
                setErrorMessage(response.message || "Could not save your agreement.");
                return;
            }

            const nextState = normalizeCommunityGuidelineAgreementState(response.user.communityGuidelinesAcceptance);
            setAcceptanceState(nextState);
            onUserChange?.(response.user);

            if (hasAcceptedAllCommunityGuidelines(nextState)) {
                setCurrentScreenIndex(CONFIRMATION_SCREEN_INDEX);
                await continueAfterCompletion(response.user);
                return;
            }

            setCurrentScreenIndex((prev) => Math.min(prev + 1, SCREEN_ORDER.length - 1));
        } finally {
            setIsSubmittingRule(null);
        }
    };

    const handleConfirmationAction = async () => {
        if (!user) {
            return;
        }

        await continueAfterCompletion(user);
    };

    return (
        <Card className="w-full overflow-hidden rounded-[28px] border border-white/70 bg-[#fffaf0] shadow-[0_28px_80px_rgba(39,27,13,0.22)]">
            <CardContent className="p-0">
                <div className="border-b border-[#ead8b8] bg-[#f7e4ba] px-6 py-5 sm:px-8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[#8a5822]">
                                <ShieldCheck className="h-5 w-5" />
                                <span className="text-xs font-semibold uppercase tracking-[0.24em]">
                                    {copy.badge}
                                </span>
                            </div>
                            <h2 className="text-2xl font-semibold text-[#2d2116] sm:text-[2rem]">
                                {copy.title}
                            </h2>
                        </div>
                        <div className="min-w-[160px] text-right">
                            <div className="text-sm font-medium text-[#6e573d]">
                                Screen {currentScreenIndex + 1} of {SCREEN_ORDER.length}
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
                                <div
                                    className="h-full rounded-full bg-[#b8672c] transition-all"
                                    style={{ width: `${((currentScreenIndex + 1) / SCREEN_ORDER.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8 px-6 py-6 sm:px-8 sm:py-8">
                    <div className="rounded-[22px] border border-[#ecdab7] bg-white px-5 py-4 sm:px-6 sm:py-5">
                        {currentScreen === "welcome" && (
                            <div className="space-y-4">
                                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9d6b2f]">
                                    {copy.welcomeKicker}
                                </p>
                                <h3 className="text-3xl font-semibold leading-tight text-[#2d2116]">
                                    {copy.welcomeTitle}
                                </h3>
                                <p className="text-base leading-7 text-[#4c3b29]">
                                    {copy.welcomeBody}
                                </p>
                                <p className="text-base leading-7 text-[#4c3b29]">
                                    {copy.welcomeNote}
                                </p>
                            </div>
                        )}

                        {currentScreen === "why" && (
                            <div className="space-y-4">
                                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9d6b2f]">
                                    Why this matters
                                </p>
                                <h3 className="text-3xl font-semibold leading-tight text-[#2d2116]">
                                    {copy.whyTitle}
                                </h3>
                                <p className="text-base leading-7 text-[#4c3b29]">
                                    {copy.whyBody}
                                </p>
                                <p className="text-base leading-7 text-[#4c3b29]">
                                    You will agree to each rule one by one. Each agreement is saved with its own
                                    timestamp.
                                </p>
                            </div>
                        )}

                        {currentRule && (
                            <div className="space-y-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="rounded-full bg-[#f8ecd5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8a5822]">
                                        Rule {COMMUNITY_GUIDELINE_RULES.findIndex((rule) => rule.id === currentRule.id) + 1} of 5
                                    </span>
                                    <span className="rounded-full border border-[#ead3ac] px-3 py-1 text-xs font-medium text-[#6e573d]">
                                        ID: {currentRule.id}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-3xl font-semibold leading-tight text-[#2d2116]">
                                        {currentRule.title}
                                    </h3>
                                    <p className="text-lg leading-8 text-[#4c3b29]">{currentRule.body}</p>
                                </div>

                                <div
                                    className={cn(
                                        "rounded-2xl border px-4 py-3 text-sm",
                                        isAcceptedCommunityGuidelineRule(acceptanceState[currentRule.id])
                                            ? "border-[#cfe4cc] bg-[#f1faf0] text-[#2c6b2f]"
                                            : "border-[#eadab9] bg-[#fcf6ea] text-[#6e573d]",
                                    )}
                                >
                                    {isAcceptedCommunityGuidelineRule(acceptanceState[currentRule.id]) ? (
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <span>
                                                Agreed
                                                {formatAcceptedAt(acceptanceState[currentRule.id].acceptedAt)
                                                    ? ` on ${formatAcceptedAt(acceptanceState[currentRule.id].acceptedAt)}`
                                                    : ""}
                                                .
                                            </span>
                                        </div>
                                    ) : (
                                        <span>This rule must be accepted before you can continue.</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {currentScreen === "confirmation" && (
                            <div className="space-y-5">
                                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9d6b2f]">
                                    Final confirmation
                                </p>
                                <h3 className="text-3xl font-semibold leading-tight text-[#2d2116]">
                                    {copy.confirmationTitle}
                                </h3>
                                <p className="text-base leading-7 text-[#4c3b29]">
                                    {copy.confirmationBody}
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {COMMUNITY_GUIDELINE_RULES.map((rule) => (
                                        <div
                                            key={rule.id}
                                            className="rounded-2xl border border-[#eadab9] bg-[#fcf6ea] px-4 py-3"
                                        >
                                            <div className="text-sm font-semibold text-[#2d2116]">{rule.title}</div>
                                            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#8a5822]">
                                                {rule.id}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {isCompleting && (
                                    <div className="flex items-center gap-2 rounded-2xl border border-[#d8e6d4] bg-[#f3faf1] px-4 py-3 text-sm text-[#2c6b2f]">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>{copy.completingLabel}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between rounded-[22px] border border-[#ecdab7] bg-[#fff7e7] px-5 py-4">
                        <div>
                            <div className="text-sm font-medium text-[#6e573d]">Accepted so far</div>
                            <div className="text-2xl font-semibold text-[#2d2116]">
                                {acceptedCount} / {COMMUNITY_GUIDELINE_RULES.length}
                            </div>
                        </div>
                        <div className="text-right text-sm leading-6 text-[#6e573d]">
                            <div>Readable in under 60 seconds.</div>
                            <div>Each rule is recorded separately.</div>
                        </div>
                    </div>

                    {errorMessage && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    )}

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            {currentScreenIndex > 0 && currentScreen !== "confirmation" && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-11 px-0 text-[#6e573d] hover:bg-transparent hover:text-[#2d2116]"
                                    onClick={goToPreviousScreen}
                                    disabled={Boolean(isSubmittingRule) || isCompleting}
                                >
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Back
                                </Button>
                            )}
                        </div>

                        <div className="flex gap-3">
                            {currentScreen === "welcome" && (
                                <Button
                                    type="button"
                                    className="h-12 bg-[#b8672c] px-6 text-base text-white hover:bg-[#9d5928]"
                                    onClick={goToNextScreen}
                                >
                                    Continue
                                </Button>
                            )}

                            {currentScreen === "why" && (
                                <Button
                                    type="button"
                                    className="h-12 bg-[#b8672c] px-6 text-base text-white hover:bg-[#9d5928]"
                                    onClick={goToNextScreen}
                                >
                                    Read the first rule
                                </Button>
                            )}

                            {currentRule && (
                                <Button
                                    type="button"
                                    className="h-12 bg-[#b8672c] px-6 text-base text-white hover:bg-[#9d5928]"
                                    onClick={() => handleRuleAction(currentRule.id)}
                                    disabled={isSubmittingRule === currentRule.id || isCompleting}
                                >
                                    {isSubmittingRule === currentRule.id && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {isAcceptedCommunityGuidelineRule(acceptanceState[currentRule.id])
                                        ? "Continue"
                                        : "I agree to this rule"}
                                </Button>
                            )}

                            {currentScreen === "confirmation" && !isCompleting && onComplete && (
                                <Button
                                    type="button"
                                    className="h-12 bg-[#2d6a45] px-6 text-base text-white hover:bg-[#25563a]"
                                    onClick={handleConfirmationAction}
                                    disabled={!allRulesAccepted}
                                >
                                    {copy.confirmationButton}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
