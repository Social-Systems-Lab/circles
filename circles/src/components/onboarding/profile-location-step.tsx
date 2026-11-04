"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OnboardingStepProps } from "./onboarding";
import { useState } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Loader2, MapPin } from "lucide-react";
import { Location } from "@/models/models";
import LocationPicker from "@/components/forms/location-picker";
import { saveLocationAction } from "./actions";

export default function ProfileLocationStep({ userData, nextStep, prevStep }: OnboardingStepProps) {
    const [user, setUser] = useAtom(userAtom);
    const [location, setLocation] = useState<Location | undefined>(user?.location);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!user?._id) return;

        setIsSubmitting(true);
        try {
            // Save location and mark the step as completed
            const result = await saveLocationAction(location, user._id);

            if (result.success) {
                // Update local user state with new location
                const updatedSteps = [...(user.completedOnboardingSteps || [])];
                if (!updatedSteps.includes("location")) {
                    updatedSteps.push("location");
                }

                setUser({
                    ...user,
                    location,
                    completedOnboardingSteps: updatedSteps,
                });

                // Move to next step
                nextStep();
            } else {
                console.error("Error saving location:", result.message);
            }
        } catch (error) {
            console.error("Error updating user location:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <h1 className="text-center text-2xl font-bold">Your Location</h1>
            <div className="space-y-1 text-center text-sm text-gray-600">
                <h2 className="font-semibold">Choose where people can find you</h2>
                <p>
                    Select a nearby public place, such as a café, park or library, rather than your home address.
                    Somewhere you could comfortably reach within 30 minutes is a good starting point. Your selected
                    location will be visible to other Kamooni members.
                </p>
            </div>

            <div className="space-y-4">
                <Card>
                    <CardContent className="pt-6">
                        <Label>Your Location</Label>
                        <LocationPicker value={location} onChange={setLocation} compact={true} personalProfile />
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-between pt-4">
                <Button onClick={prevStep} variant="outline">
                    Back
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="flex items-center gap-1">
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <MapPin className="h-4 w-4" />
                            Continue
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
