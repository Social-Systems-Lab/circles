"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Cause, CircleType, Skill } from "@/models/models";
import { causes, skills } from "@/lib/data/constants";
import { useRouter, useSearchParams } from "next/navigation";
import BasicInfoStep from "./basic-info-step";
import MissionStep from "./mission-step";
import ProfileStep from "./profile-step";
import LocationStep from "./location-step";
import CausesStep from "./causes-step";
import SkillsStep from "./skills-step";
import FinalStep from "./final-step";
import CircleSummary from "./circle-summary";
import { Location, Media } from "@/models/models"; // Added Media
import { ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import ImageItem
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
    selectedCauses: Cause[];
    selectedSkills: Skill[];
    picture: string; // Keep profile picture string for now
    // cover: string; // Remove cover string
    images: any[]; // Add images array
    parentCircleId?: string;
    pictureFile?: File; // Keep profile picture file for now
    // coverFile?: File; // Remove cover file
    circleType?: CircleType;
    isProjectsPage?: boolean;
};

export type CircleWizardStepProps = {
    circleData: CircleData;
    setCircleData: React.Dispatch<React.SetStateAction<CircleData>>;
    nextStep: () => void;
    prevStep: () => void;
    onComplete?: () => void;
};

interface CircleWizardProps {
    parentCircleId?: string;
    isProjectsPage?: boolean;
    onComplete?: () => void;
}

export default function CircleWizard({ parentCircleId, isProjectsPage = false, onComplete }: CircleWizardProps) {
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
        selectedCauses: [],
        selectedSkills: [],
        picture: "/images/default-picture.png",
        // cover: "/images/default-cover.png", // Remove cover init
        images: [], // Initialize images as empty array
        parentCircleId,
        circleType: isProjectsPage ? "project" : "circle",
        isProjectsPage,
    });

    // Effect to reset state if key props change (indicating a new wizard session)
    useEffect(() => {
        console.log("Wizard props changed, resetting state.");
        setCircleData({
            name: "",
            handle: "",
            isPublic: true,
            mission: "",
            description: "",
            content: "",
            selectedCauses: [],
            selectedSkills: [],
            picture: "/images/default-picture.png", // Reset picture
            images: [], // Reset images
            parentCircleId, // Update parentCircleId from props
            circleType: isProjectsPage ? "project" : "circle", // Update type from props
            isProjectsPage, // Update flag from props
            _id: undefined, // Clear any existing ID
            pictureFile: undefined, // Clear any lingering file object
        });
        setCurrentStepIndex(0); // Reset to the first step
    }, [isOpen, parentCircleId, isProjectsPage]); // Dependency array

    // Define the steps for the wizard
    const steps = useMemo(() => {
        // Mapping of step components
        const stepComponents: React.ComponentType<CircleWizardStepProps>[] = [
            BasicInfoStep,
            MissionStep,
            ProfileStep,
            LocationStep,
            CausesStep,
            SkillsStep,
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
        const entityType = isProjectsPage ? "Project" : "Circle";
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
                return "Choose Causes";
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
            setIsOpen(false);
            // Call onComplete callback if provided
            if (onComplete) {
                onComplete();
            } else {
                // Navigate back to circles page or to the new circle's page
                router.push("/circles");
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
                                        circleData={{ ...circleData, isProjectsPage }}
                                        setCircleData={setCircleData}
                                        nextStep={nextStep}
                                        prevStep={prevStep}
                                        onComplete={onComplete}
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
