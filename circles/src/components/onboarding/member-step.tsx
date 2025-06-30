"use client";

"use client";

import { useState } from "react";
import { OnboardingStepProps } from "@/components/onboarding/onboarding";
import SubscriptionForm from "@/app/circles/[handle]/settings/subscription/subscription-form";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { completeMemberStep } from "@/components/onboarding/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

export default function MemberStep({ circle, nextStep }: OnboardingStepProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [user, setUser] = useAtom(userAtom);
    const [subscriptionAttempted, setSubscriptionAttempted] = useState(false);

    const handleSkip = async () => {
        if (!circle?._id || !user) {
            nextStep();
            return;
        }

        setIsSubmitting(true);
        try {
            await completeMemberStep(circle._id);
            // Optimistically update the user atom
            setUser({
                ...user,
                completedOnboardingSteps: [...(user.completedOnboardingSteps || []), "member"],
            });
            nextStep();
        } catch (error) {
            console.error("Error marking member step complete:", error);
            nextStep(); // Continue anyway
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDialogClose = () => {
        setSubscriptionAttempted(true);
    };

    const isMember = circle.isMember;

    if (isMember) {
        return (
            <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">You are a Member!</h1>
                <p className="mb-4">Thank you for supporting our community.</p>
                <Button onClick={handleSkip} className="mt-4" disabled={isSubmitting}>
                    Continue
                </Button>
            </div>
        );
    }

    if (subscriptionAttempted) {
        return (
            <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Thank You!</h1>
                <p className="mb-4">
                    Your subscription is being processed. Your membership status will be updated shortly.
                </p>
                <Button onClick={handleSkip} className="mt-4" disabled={isSubmitting}>
                    Continue
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">Become a Member</h1>
            <p className="mb-4">Support our community by becoming a member.</p>
            <SubscriptionForm circle={circle as Circle} onDialogClose={handleDialogClose} />
            <Button variant="link" onClick={handleSkip} className="mt-4" disabled={isSubmitting}>
                Skip for now
            </Button>
        </div>
    );
}
