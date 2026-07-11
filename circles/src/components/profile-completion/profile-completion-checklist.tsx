"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { CheckCircle2, Circle as CircleIcon } from "lucide-react";
import { CommunityGuidelinesAgreementFlow } from "@/components/auth/community-guidelines-gate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    const router = useRouter();
    const profileSettingsHref = profile.handle ? `/circles/${profile.handle}/settings/about` : undefined;
    const currentProfile = useMemo(
        () => (user?.did && user.did === profile.did ? { ...profile, ...user } : profile),
        [profile, user],
    );
    const checklist = useMemo(() => getProfileCompletionChecklistState(currentProfile), [currentProfile]);

    if (profile.circleType !== "user") {
        return null;
    }

    const handleRulesComplete = async (nextUser: UserPrivate) => {
        setUser(nextUser);
        setRulesOpen(false);
        router.refresh();
        return { success: true };
    };

    return (
        <section className="mt-4 w-full rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-gray-900">Complete your profile</h2>
                {checklist.complete ? (
                    <p className="text-sm text-emerald-700">You&apos;re ready! Welcome to Kamooni.</p>
                ) : (
                    <p className="text-sm text-gray-600">
                        Complete these three quick steps to take part in Kamooni.
                    </p>
                )}
            </div>

            <div className="mt-4 grid gap-3">
                {checklist.items.map((item) => {
                    const isRulesStep = item.id === "rules";
                    const canUseSettingsLink = !isRulesStep && Boolean(profileSettingsHref);

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

                            {!item.complete && canUseSettingsLink ? (
                                <Button asChild variant="outline" size="sm" className="shrink-0">
                                    <Link href={profileSettingsHref!}>{item.actionLabel}</Link>
                                </Button>
                            ) : null}

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
                    <CommunityGuidelinesAgreementFlow
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
