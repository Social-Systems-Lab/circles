"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Cause, Skill } from "@/models/models";
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
import { Location } from "@/models/models";

export type CircleData = {
    name: string;
    handle: string;
    isPublic: boolean;
    mission: string;
    description: string;
    content: string;
    location?: Location;
    selectedCauses: Cause[];
    selectedSkills: Skill[];
    picture: string;
    cover: string;
    parentCircleId?: string;
};

export type CircleWizardStepProps = {
    circleData: CircleData;
    setCircleData: React.Dispatch<React.SetStateAction<CircleData>>;
    nextStep: () => void;
    prevStep: () => void;
};

export default function CircleWizard() {
    const [isOpen, setIsOpen] = useState(true);
    const [user] = useAtom(userAtom);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const router = useRouter();
    const searchParams = useSearchParams();
    const parentCircleId = searchParams.get("parentCircleId") || undefined;

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
        cover: "/images/default-cover.png",
        parentCircleId,
    });

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
        switch (stepIndex) {
            case 0:
                return "Basic Information";
            case 1:
                return "Circle Mission";
            case 2:
                return "Circle Profile";
            case 3:
                return "Circle Location";
            case 4:
                return "Choose Causes";
            case 5:
                return "Choose Skills";
            case 6:
                return "Create Circle";
            default:
                return "Circle Creation";
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
            // Navigate back to circles page or to the new circle's page
            router.push("/circles");
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
        <div className="fixed z-[500] flex h-screen w-screen items-center justify-center bg-gradient-to-br from-[#dce5ffcf] to-[#e3eaffcf] p-4">
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
