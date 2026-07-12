"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { CheckCircle2, Circle as CircleIcon } from "lucide-react";
import { CodeOfConductAgreement } from "@/components/auth/code-of-conduct-agreement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { completeProfileCompletionWelcomeStep, saveDonationIntentAction } from "@/components/onboarding/actions";
import { userAtom } from "@/lib/data/atoms";
import { getProfileCompletionChecklistState } from "@/lib/profile-completion-checklist";
import { cn } from "@/lib/utils";
import type { Circle, UserPrivate } from "@/models/models";

const SUPPORTER_OPTIONS = [
    { amount: "1", label: "€1/month" },
    { amount: "2", label: "€2/month" },
    { amount: "5", label: "€5/month" },
    { amount: "10", label: "€10/month" },
] as const;

type ProfileCompletionChecklistProps = {
    profile: Circle;
};

export function ProfileCompletionChecklist({ profile }: ProfileCompletionChecklistProps) {
    const [user, setUser] = useAtom(userAtom);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [completionDismissed, setCompletionDismissed] = useState(false);
    const [supportSkipped, setSupportSkipped] = useState(false);
    const [pendingSupportAmount, setPendingSupportAmount] = useState<string | null>(null);
    const [isSavingSupportPreference, setIsSavingSupportPreference] = useState(false);
    const router = useRouter();
    const { toast } = useToast();
    const currentProfile = useMemo(
        () => (user?.did && user.did === profile.did ? { ...profile, ...user } : profile),
        [profile, user],
    );
    const hasAuthoritativeOwnProfile = Boolean(user?.did && user.did === profile.did);
    const checklist = useMemo(() => getProfileCompletionChecklistState(currentProfile), [currentProfile]);
    const hasSeenProfileCompletionWelcome = Boolean(
        currentProfile.completedOnboardingSteps?.includes("profileCompletionWelcomeSeen"),
    );
    const hasRecordedFundingPreference = Boolean(
        currentProfile.donationIntent?.updatedAt ||
            currentProfile.subscription?.membershipState === "active" ||
            currentProfile.subscription?.status === "active" ||
            currentProfile.subscription?.status === "trialing",
    );
    const isActiveSupporter = Boolean(
        currentProfile.subscription?.membershipState === "active" ||
            currentProfile.subscription?.status === "active" ||
            currentProfile.subscription?.status === "trialing",
    );

    if (profile.circleType !== "user") {
        return null;
    }

    if (!hasAuthoritativeOwnProfile) {
        return null;
    }

    const handleRulesComplete = async (nextUser: UserPrivate) => {
        setUser(nextUser);
        setRulesOpen(false);
        router.refresh();
        return { success: true };
    };

    const saveSupportPreference = async (amount: string | null, skipped: boolean) => {
        const result = await saveDonationIntentAction({
            amount,
            customAmount: "",
            volunteering: false,
            skipped,
        });

        if (!result.success) {
            throw new Error(result.message);
        }

        return result;
    };

    const handleMonthlySupport = async (amount: string) => {
        if (pendingSupportAmount || isSavingSupportPreference) {
            return;
        }

        setPendingSupportAmount(amount);
        try {
            await saveSupportPreference(amount, false);

            const response = await fetch("/api/stripe/create-checkout-session", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ interval: "month", amount: Number(amount) }),
            });
            const data = await response.json();

            if (!response.ok || !data?.url) {
                throw new Error(data?.error || "Failed to start supporter checkout");
            }

            window.location.href = data.url;
        } catch (error) {
            toast({
                title: "Could not start supporter checkout",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive",
            });
            setPendingSupportAmount(null);
        }
    };

    const handleMaybeLater = async () => {
        setIsSavingSupportPreference(true);
        try {
            await saveSupportPreference(null, true);
            setSupportSkipped(true);
        } catch (error) {
            toast({
                title: "Could not save your support preference",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsSavingSupportPreference(false);
        }
    };

    const handleStartKamoonying = async () => {
        setIsSavingSupportPreference(true);
        try {
            const result = await completeProfileCompletionWelcomeStep();
            if (!result.success) {
                throw new Error(result.message);
            }
        } catch (error) {
            toast({
                title: "Could not close the welcome card",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive",
            });
            setIsSavingSupportPreference(false);
            return;
        }
        setIsSavingSupportPreference(false);

        setCompletionDismissed(true);
    };

    if (checklist.complete && (completionDismissed || hasSeenProfileCompletionWelcome)) {
        return null;
    }

    if (checklist.complete) {
        return (
            <section className="mt-4 w-full rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-gray-900">You&apos;re ready! Welcome to Kamooni 🎉</h2>
                    <p className="text-sm text-gray-600">
                        Your profile is complete. You can now take part across Kamooni.
                    </p>
                </div>

                {!supportSkipped && !hasRecordedFundingPreference && !isActiveSupporter ? (
                    <div className="mt-4 rounded-md border border-[#eadcc0] bg-[#fff9ef] p-4">
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold text-gray-900">Help keep Kamooni independent</h3>
                            <p className="text-sm text-gray-600">
                                Kamooni is not-for-profit and has no advertising. We&apos;re funded by our members.
                                Might you consider supporting us too?
                            </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {SUPPORTER_OPTIONS.map((option) => (
                                <Button
                                    key={option.amount}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full"
                                    onClick={() => void handleMonthlySupport(option.amount)}
                                    disabled={isSavingSupportPreference || Boolean(pendingSupportAmount)}
                                >
                                    {pendingSupportAmount === option.amount ? "Opening..." : option.label}
                                </Button>
                            ))}
                            <Button asChild variant="outline" size="sm" className="rounded-full">
                                <Link href="/donate">One-time donation</Link>
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="rounded-full"
                                onClick={() => void handleMaybeLater()}
                                disabled={isSavingSupportPreference || Boolean(pendingSupportAmount)}
                            >
                                {isSavingSupportPreference ? "Saving..." : "Maybe later"}
                            </Button>
                        </div>
                    </div>
                ) : null}

                <div className="mt-4 flex justify-end">
                    <Button
                        type="button"
                        onClick={() => void handleStartKamoonying()}
                        disabled={isSavingSupportPreference || Boolean(pendingSupportAmount)}
                    >
                        Start Kamoonying
                    </Button>
                </div>
            </section>
        );
    }

    return (
        <section className="mt-4 w-full rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-gray-900">Complete your profile</h2>
                {checklist.complete ? (
                    <p className="text-sm text-emerald-700">You&apos;re ready! Welcome to Kamooni.</p>
                ) : (
                    <p className="text-sm text-gray-600">Complete these three quick steps to take part in Kamooni.</p>
                )}
            </div>

            <div className="mt-4 grid gap-3">
                {checklist.items.map((item) => {
                    const isRulesStep = item.id === "rules";

                    return (
                        <div
                            key={item.id}
                            className={cn(
                                "flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
                                item.complete ? "border-emerald-100 bg-emerald-50/60" : "border-gray-200 bg-white",
                            )}
                        >
                            <div className="flex min-w-0 gap-3">
                                {item.complete ? (
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                ) : (
                                    <CircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />
                                )}
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-900">{item.label}</div>
                                    <div className="mt-0.5 text-sm text-gray-600">{item.description}</div>
                                </div>
                            </div>

                            {!item.complete && isRulesStep ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={() => setRulesOpen(true)}
                                    disabled={!user?._id}
                                >
                                    {item.actionLabel}
                                </Button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-none bg-transparent p-0 shadow-none">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Agree to the Kamooni rules</DialogTitle>
                    </DialogHeader>
                    <CodeOfConductAgreement
                        user={user}
                        onUserChange={setUser}
                        onComplete={handleRulesComplete}
                        context="profileCompletion"
                    />
                </DialogContent>
            </Dialog>
        </section>
    );
}
