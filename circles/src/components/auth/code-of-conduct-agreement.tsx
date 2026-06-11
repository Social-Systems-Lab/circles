"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { acceptCodeOfConductAction } from "@/components/auth/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UserPrivate } from "@/models/models";

export type CodeOfConductAgreementResult = {
    success: boolean;
    message?: string;
};

type CodeOfConductAgreementProps = {
    user: UserPrivate | null | undefined;
    onUserChange?: (user: UserPrivate) => void;
    onComplete?: (user: UserPrivate) => Promise<CodeOfConductAgreementResult | void>;
};

export function CodeOfConductAgreement({
    user,
    onUserChange,
    onComplete,
}: CodeOfConductAgreementProps) {
    const [agreed, setAgreed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleContinue = async () => {
        if (!agreed) {
            return;
        }

        setIsSubmitting(true);
        setErrorMessage(null);

        try {
            const response = await acceptCodeOfConductAction();
            if (!response.success || !response.user) {
                setErrorMessage(response.message || "Could not save your agreement.");
                return;
            }

            onUserChange?.(response.user);

            if (!onComplete) {
                return;
            }

            const nextStep = await onComplete(response.user);
            if (nextStep && nextStep.success === false) {
                setErrorMessage(nextStep.message || "Could not continue.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rounded-3xl border border-stone-200 bg-white text-stone-900 shadow-2xl shadow-black/15">
            <div className="border-b border-stone-200 bg-stone-50 px-6 py-5 sm:px-8">
                <div className="flex items-center gap-2 text-amber-700">
                    <ShieldCheck className="h-5 w-5" />
                    <span className="text-sm font-semibold uppercase tracking-[0.18em]">Pilot Verification</span>
                </div>
                <div className="mt-3 space-y-2">
                    <h2 className="text-2xl font-semibold">Agree to the Peerify Code of Conduct</h2>
                    <p className="max-w-2xl text-sm leading-7 text-stone-600">
                        To keep Peerify useful, welcoming, and trustworthy, please agree to use the platform honestly,
                        respectfully, and constructively. This includes representing yourself truthfully, treating
                        artists, fans, and hosts with respect, protecting private information, avoiding spam or
                        manipulation, and helping keep community spaces safe and useful.
                    </p>
                </div>
            </div>

            <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-7">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                    This agreement is part of Peerify profile verification. Email verification remains a separate step
                    that only confirms your email address.
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="pilot-code-of-conduct"
                            checked={agreed}
                            onCheckedChange={(checked) => setAgreed(checked === true)}
                            disabled={isSubmitting}
                            className="mt-1"
                        />
                        <Label htmlFor="pilot-code-of-conduct" className="text-sm leading-6 text-stone-800">
                            I agree to the Peerify Code of Conduct.
                        </Label>
                    </div>
                </div>

                {errorMessage ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {errorMessage}
                    </div>
                ) : null}

                <div className="flex justify-end">
                    <Button
                        type="button"
                        className="min-w-36"
                        onClick={handleContinue}
                        disabled={!agreed || isSubmitting || !user?._id}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Continue"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
