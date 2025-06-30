"use client";

import { OnboardingStepProps } from "@/components/onboarding/onboarding";
import SubscriptionForm from "@/app/circles/[handle]/settings/subscription/subscription-form";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";

export default function MemberStep({ circle, nextStep }: OnboardingStepProps) {
    return (
        <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">Become a Member</h1>
            <p className="mb-4">Support our community by becoming a member.</p>
            <SubscriptionForm circle={circle as Circle} />
            <Button variant="link" onClick={nextStep} className="mt-4">
                Skip for now
            </Button>
        </div>
    );
}
