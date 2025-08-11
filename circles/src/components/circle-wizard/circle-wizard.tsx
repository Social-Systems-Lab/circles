"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Cause, CircleType, Skill } from "@/models/models";
import { useRouter, useSearchParams } from "next/navigation";
import BasicInfoStep from "./basic-info-step";
import MissionStep from "./mission-step";
import ProfileStep from "./profile-step";
import LocationStep from "./location-step";
import SdgsStep from "./sdgs-step";
import SkillsStep from "./skills-step";
import FinalStep from "./final-step";
import CircleSummary from "./circle-summary";
import { Location, Media } from "@/models/models";
import { Card, CardContent } from "../ui/card";

export type CircleData = {
    _id?: string; // Added circle ID
    name: string;
    handle: string;
    isPublic: boolean;
    mission: string;
    description: string;
    content: string;
    location?: Location;
    selectedSdgs: Cause[];
    selectedSkills: Skill[];
    picture: string; // Keep profile picture string for now
    // cover: string; // Remove cover string
    images: any[]; // Add images array
    parentCircleId?: string;
    pictureFile?: File; // Keep profile picture file for now
    // coverFile?: File; // Remove cover file
    circleType?: CircleType; // Should default to "circle"
};

export type CircleWizardStepProps = {
    circleData: CircleData;
    setCircleData: React.Dispatch<React.SetStateAction<CircleData>>;
    nextStep: () => void;
    prevStep: () => void;
    onComplete?: (createdCircleId?: string, handle?: string) => void;
    initialParentCircleId?: string;
};

interface CircleWizardProps {
    onComplete?: (createdCircleId?: string, handle?: string) => void; // Modified to pass createdCircleId
    initialParentCircleId?: string;
}

export default function CircleWizard({ onComplete, initialParentCircleId }: CircleWizardProps) {
    const [isOpen, setIsOpen] = useState(true);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const router = useRouter();

    const [circleData, setCircleData] = useState<CircleData>({
        name: "",
        handle: "",
        isPublic: true,
        mission: "",
        description: "",
        content: "",
        selectedSdgs: [],
        selectedSkills: [],
        picture: "/images/default-picture.png",
        images: [], // Initialize images as empty array
        parentCircleId: undefined, // Initialized as undefined, BasicInfoStep will set it
        circleType: "circle", // Always "circle" now
    });

    // Effect to reset state if key props change (indicating a new wizard session)
    useEffect(() => {
        if (isOpen) {
            console.log("Wizard is opening, resetting state.");
            setCircleData({
                name: "",
                handle: "",
                isPublic: true,
                mission: "",
                description: "",
                content: "",
                selectedSdgs: [],
                selectedSkills: [],
                picture: "/images/default-picture.png",
                images: [],
                parentCircleId: initialParentCircleId, // Set initial parentCircleId
                circleType: "circle",
                _id: undefined,
                pictureFile: undefined,
            });
            setCurrentStepIndex(0);
        }
    }, [isOpen, initialParentCircleId]);

    // Define the steps for the wizard
    const steps = useMemo(() => {
        // Mapping of step components
        const stepComponents: React.ComponentType<CircleWizardStepProps>[] = [
            BasicInfoStep,
            MissionStep,
            ProfileStep,
            LocationStep,
            SdgsStep,
            // SkillsStep,
            FinalStep,
        ];

        // Convert to step objects with titles
        return stepComponents.map((Component, index) => ({
            id: `step-${index}`,
            component: Component,
            title: getStepTitle(index),
        }));
    }, []);

    // Helper function to get step titles
    function getStepTitle(stepIndex: number) {
        const entityType = "Community"; // Always "Community" now
        switch (stepIndex) {
            case 0:
                return "Basic Information";
            case 1:
                return `${entityType} Mission`;
            case 2:
                return `${entityType} Profile`;
            case 3:
                return `${entityType} Location`;
            case 4:
                return "Choose SDGs";
            case 5:
                return "Choose Needs";
            case 6:
                return `Create ${entityType}`;
            default:
                return `${entityType} Creation`;
        }
    }

    const totalSteps = steps.length;

    const nextStep = () => {
        if (currentStepIndex + 1 < steps.length) {
            // Explicitly set the next step index
            const nextStepIndex = currentStepIndex + 1;
            setCurrentStepIndex(nextStepIndex);
        } else {
            // This is the final step completion
            setIsOpen(false);
            if (onComplete) {
                onComplete(circleData._id, circleData.handle); // Pass the created circle's ID
            } else {
                // Default navigation if onComplete is not provided
                if (circleData._id) {
                    router.push(`/circles/${circleData.handle || circleData._id}`);
                } else {
                    router.push("/circles"); // Always "/circles" now
                }
            }
        }
    };

    const prevStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(currentStepIndex - 1);
        }
    };

    const CurrentStepComponent = steps[currentStepIndex]?.component;

    if (!isOpen) {
        return null;
    }

    return (
        <div className={`${!isOpen ? "hidden" : ""} flex items-center justify-center p-0`}>
            <Card className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border-0 bg-[#f9f9f9] shadow-xl backdrop-blur-sm">
                <CardContent className="max-h-[calc(90vh-2rem)] overflow-y-auto p-6">
                    <div className="flex gap-6">
                        <div className="hidden md:block">
                            <CircleSummary circleData={circleData} />
                        </div>
                        <div className="flex-1">
                            <Progress value={((currentStepIndex + 1) / totalSteps) * 100} className="mb-6" />
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={steps[currentStepIndex].id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <CurrentStepComponent
                                        circleData={circleData}
                                        setCircleData={setCircleData}
                                        nextStep={nextStep}
                                        prevStep={prevStep}
                                        onComplete={onComplete}
                                        initialParentCircleId={initialParentCircleId}
                                    />
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
