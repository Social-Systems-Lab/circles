"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { CheckCircle2, Circle as CircleIcon } from "lucide-react";
import { CodeOfConductAgreement } from "@/components/auth/code-of-conduct-agreement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { completeProfileCompletionWelcomeStep } from "@/components/onboarding/actions";
import { userAtom } from "@/lib/data/atoms";
import { getProfileCompletionChecklistState } from "@/lib/profile-completion-checklist";
import { cn } from "@/lib/utils";
import type { Circle, UserPrivate } from "@/models/models";

type ProfileCompletionChecklistProps = {
    profile: Circle;
};

export function ProfileCompletionChecklist({ profile }: ProfileCompletionChecklistProps) {
    const [user, setUser] = useAtom(userAtom);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [completionDismissed, setCompletionDismissed] = useState(false);
    const [isFinishing, setIsFinishing] = useState(false);
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

    const handleStartKamoonying = async () => {
        setIsFinishing(true);
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
            setIsFinishing(false);
            return;
        }
        setIsFinishing(false);

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

                <div className="mt-4 flex justify-end">
                    <Button type="button" onClick={() => void handleStartKamoonying()} disabled={isFinishing}>
                        Start Kamoonying
                    </Button>
                </div>
            </section>
        );
    }

    const visibleItems = checklist.participationReady
        ? checklist.items.filter((item) => !item.requiredForParticipation && !item.complete)
        : checklist.items;

    if (visibleItems.length === 0) {
        return null;
    }

    return (
        <section className="mt-4 w-full rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-gray-900">
                    {checklist.participationReady ? "Improve your profile" : "Get ready to participate"}
                </h2>
                {checklist.participationReady ? (
                    <p className="text-sm text-emerald-700">
                        You can take part in Kamooni. These remaining profile improvements are optional.
                    </p>
                ) : (
                    <p className="text-sm text-gray-600">
                        Add an introduction and agree to the Kamooni rules to take part.
                    </p>
                )}
            </div>

            <div className="mt-4 grid gap-3">
                {visibleItems.map((item) => {
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
