"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CircleWizardStepProps } from "./circle-wizard";
import { useState, useTransition } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Location } from "@/models/models";
import LocationPicker from "@/components/forms/location-picker";
import { saveLocationAction } from "./actions";

export default function LocationStep({ circleData, setCircleData, nextStep, prevStep }: CircleWizardStepProps) {
    const [isPending, startTransition] = useTransition();
    const [locationError, setLocationError] = useState("");

    const handleLocationChange = (location: Location | undefined) => {
        // Clear any previous errors
        setLocationError("");

        // Update the circle data
        setCircleData((prev) => ({
            ...prev,
            location,
        }));
    };

    const handleNext = () => {
        startTransition(async () => {
            // If we have a circle ID, update the circle with the location
            if (circleData._id) {
                const result = await saveLocationAction(circleData.location, circleData._id);

                if (result.success) {
                    // Update the circle data with any changes from the server
                    if (result.data?.circle) {
                        const circle = result.data.circle as any;
                        setCircleData((prev) => ({
                            ...prev,
                            location: circle.location || prev.location,
                        }));
                    }
                    nextStep();
                } else {
                    // Handle error
                    setLocationError(result.message || "Failed to save location");
                    console.error(result.message);
                }
            } else {
                // If no circle ID yet, just store the location in state and move to the next step
                console.warn("No circle ID yet, location will be saved when the circle is created");
                nextStep();
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Community Location</h2>
                <p className="text-gray-500">
                    Add a location to help people find your community and connect with nearby members.
                </p>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <Label>Community Location</Label>
                    <LocationPicker value={circleData.location} onChange={handleLocationChange} compact={true} />
                </CardContent>
            </Card>

            <p className="text-center text-sm text-gray-500">
                You can adjust the precision level to control how specific your location appears to others
            </p>

            {locationError && <p className="text-sm text-red-500">{locationError}</p>}

            <div className="flex justify-between">
                <Button onClick={prevStep} variant="outline" className="rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button onClick={handleNext} className="w-[100px] rounded-full" disabled={isPending}>
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        "Next"
                    )}
                </Button>
            </div>
        </div>
    );
}
