"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CircleWizardStepProps } from "./circle-wizard";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { saveMissionAction } from "./actions";

export default function MissionStep({ circleData, setCircleData, nextStep, prevStep }: CircleWizardStepProps) {
    const [isPending, startTransition] = useTransition();
    const [missionError, setMissionError] = useState("");

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        // Clear any previous errors
        setMissionError("");

        // Update the circle data
        setCircleData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleNext = () => {
        startTransition(async () => {
            // Save the mission
            const result = await saveMissionAction(circleData.mission);

            if (result.success) {
                nextStep();
            } else {
                // Handle error
                setMissionError(result.message || "Failed to save mission");
                console.error(result.message);
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Circle Mission</h2>
                <p className="text-gray-500">
                    Define the purpose and goals of your circle. What change do you want to see in the world?
                </p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="mission">What is the mission of this circle?</Label>
                    <Textarea
                        id="mission"
                        name="mission"
                        value={circleData.mission}
                        onChange={handleInputChange}
                        placeholder="Share your vision for a better world"
                        className="h-32"
                    />
                    {missionError && <p className="text-sm text-red-500">{missionError}</p>}
                </div>

                <p className="text-sm text-gray-500">
                    A clear mission helps potential members understand what your circle stands for and attracts
                    like-minded individuals.
                </p>
            </div>

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
