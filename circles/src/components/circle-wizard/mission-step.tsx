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
    const entityLabel = circleData.circleType === "project" ? "Project" : "Community";
    const entityLabelLower = entityLabel.toLowerCase();

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
            // Validate mission
            if (!circleData.mission.trim()) {
                setMissionError(`Please provide a mission for your ${entityLabelLower}`);
                return;
            }

            // If we have a circle ID, update the circle with the mission
            if (circleData._id) {
                const result = await saveMissionAction(circleData.mission, circleData._id);

                if (result.success) {
                    // Update the circle data with any changes from the server
                    if (result.data?.circle) {
                        const circle = result.data.circle as any;
                        setCircleData((prev) => ({
                            ...prev,
                            mission: circle.mission || prev.mission,
                        }));
                    }
                    nextStep();
                } else {
                    // Handle error
                    setMissionError(result.message || "Failed to save mission");
                    console.error(result.message);
                }
            } else {
                // If no circle ID yet, just store the mission in state and move to the next step
                console.warn("No circle ID yet, mission will be saved when the circle is created");
                nextStep();
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">{`${entityLabel} Mission`}</h2>
                <p className="text-gray-500">
                    {`Define the purpose and goals of your ${entityLabelLower}. What change do you want to see in the world?`}
                </p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="mission">{`What is the mission of this ${entityLabelLower}?`}</Label>
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
                    {`A clear mission helps potential members understand what your ${entityLabelLower} stands for and attracts like-minded individuals.`}
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
