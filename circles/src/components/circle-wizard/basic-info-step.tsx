"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CircleWizardStepProps } from "./circle-wizard";
import { Loader2 } from "lucide-react";
import { saveBasicInfoAction } from "./actions";
import { generateSlug } from "@/lib/utils";

export default function BasicInfoStep({ circleData, setCircleData, nextStep, prevStep }: CircleWizardStepProps) {
    const [isPending, startTransition] = useTransition();
    const [nameError, setNameError] = useState("");
    const [handleError, setHandleError] = useState("");

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        // Clear any previous errors
        if (name === "name") setNameError("");
        if (name === "handle") setHandleError("");

        // Update the circle data
        setCircleData((prev) => ({
            ...prev,
            [name]: value,
        }));

        // If name is changed, auto-generate handle if handle is empty or was auto-generated
        if (name === "name" && (!circleData.handle || circleData.handle === generateSlug(circleData.name))) {
            setCircleData((prev) => ({
                ...prev,
                handle: generateSlug(value),
            }));
        }
    };

    const handleSwitchChange = (checked: boolean) => {
        setCircleData((prev) => ({
            ...prev,
            isPublic: checked,
        }));
    };

    const validateForm = (): boolean => {
        let isValid = true;

        // Validate name
        if (!circleData.name.trim()) {
            setNameError("Circle name is required");
            isValid = false;
        }

        // Validate handle
        if (!circleData.handle.trim()) {
            setHandleError("Circle handle is required");
            isValid = false;
        } else if (!/^[a-zA-Z0-9\-]*$/.test(circleData.handle)) {
            setHandleError("Handle can only contain letters, numbers and hyphens (-)");
            isValid = false;
        }

        return isValid;
    };

    const handleNext = () => {
        if (!validateForm()) return;

        startTransition(async () => {
            // Save the basic info
            const result = await saveBasicInfoAction(circleData.name, circleData.handle, circleData.isPublic);

            if (result.success) {
                nextStep();
            } else {
                // Handle error
                if (result.message.includes("handle")) {
                    setHandleError(result.message);
                } else {
                    console.error(result.message);
                }
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Create a New Circle</h2>
                <p className="text-gray-500">Let's start with the basic information for your circle.</p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Circle Name</Label>
                    <Input
                        id="name"
                        name="name"
                        value={circleData.name}
                        onChange={handleInputChange}
                        placeholder="Enter circle name"
                    />
                    {nameError && <p className="text-sm text-red-500">{nameError}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="handle">Circle Handle</Label>
                    <div className="flex items-center">
                        <span className="mr-1 text-gray-500">@</span>
                        <Input
                            id="handle"
                            name="handle"
                            value={circleData.handle}
                            onChange={handleInputChange}
                            placeholder="circle-handle"
                        />
                    </div>
                    <p className="text-xs text-gray-500">
                        This will be used in the URL for your circle: circles/{circleData.handle || "circle-handle"}
                    </p>
                    {handleError && <p className="text-sm text-red-500">{handleError}</p>}
                </div>

                <div className="flex items-center space-x-2">
                    <Switch id="isPublic" checked={circleData.isPublic} onCheckedChange={handleSwitchChange} />
                    <Label htmlFor="isPublic">Public Circle</Label>
                    <p className="text-xs text-gray-500">
                        {circleData.isPublic
                            ? "Anyone can follow this circle without approval"
                            : "New followers will need approval"}
                    </p>
                </div>
            </div>

            <div className="flex justify-end">
                <Button onClick={handleNext} disabled={isPending} className="w-[100px]">
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
