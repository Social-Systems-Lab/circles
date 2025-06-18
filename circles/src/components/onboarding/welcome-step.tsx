"use client";

import { Button } from "@/components/ui/button";
import { OnboardingStepProps } from "./onboarding";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { completeWelcomeStep } from "./actions";
import { useState } from "react";

function WelcomeStep({ nextStep }: OnboardingStepProps) {
    const [user, setUser] = useAtom(userAtom);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleNext = async () => {
        if (!user?._id) {
            nextStep();
            return;
        }

        setIsSubmitting(true);
        try {
            // Mark welcome step as completed
            await completeWelcomeStep(user._id);

            // Update local user state
            const updatedSteps = [...(user.completedOnboardingSteps || [])];
            if (!updatedSteps.includes("welcome")) {
                updatedSteps.push("welcome");
            }

            setUser({
                ...user,
                completedOnboardingSteps: updatedSteps,
            });

            nextStep();
        } catch (error) {
            console.error("Error marking welcome step complete:", error);
            nextStep(); // Continue anyway
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex h-[500px] flex-col justify-center space-y-4 text-center">
            <h2 className="mb-0 mt-0 text-3xl font-bold text-gray-800">Welcome to Kamooni</h2>
            <p className="text-lg text-gray-600">
                Join a community of changemakers and embark on a journey to create positive impact. Are you ready to
                play for a better world?
            </p>
            <Button onClick={handleNext} className="mx-auto mt-4 rounded-full" disabled={isSubmitting}>
                Start Your Adventure
            </Button>
        </div>
    );
}

export default WelcomeStep;
