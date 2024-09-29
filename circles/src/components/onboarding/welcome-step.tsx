"use client";

import { Button } from "@/components/ui/button";
import { OnboardingStepProps } from "./onboarding";

function WelcomeStep({ nextStep }: OnboardingStepProps) {
    return (
        <div className="flex h-[500px] flex-col justify-center space-y-4 text-center">
            <h2 className="mb-0 mt-0 text-3xl font-bold text-gray-800">Welcome to Circles</h2>
            <p className="text-lg text-gray-600">
                Join a community of changemakers and embark on a journey to create positive impact. Are you ready to
                play for a better world?
            </p>
            <Button onClick={nextStep} className="mx-auto mt-4 rounded-full">
                Start Your Adventure
            </Button>
        </div>
    );
}

export default WelcomeStep;
