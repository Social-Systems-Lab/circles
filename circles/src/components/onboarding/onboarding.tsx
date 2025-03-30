"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import WelcomeStep from "./welcome-step";
import MissionStep from "./mission-step";
import CausesStep from "./causes-step";
import SkillsStep from "./skills-step";
import QuestsStep from "./quests-step";
import ProfileStep from "./profile-step";
import ProfileLocationStep from "./profile-location-step";
import FinalStep from "./final-step";
import ProfileSummary from "./profile-summary";
import { Cause, ONBOARDING_STEPS, OnboardingStep, Skill } from "@/models/models";
import { causes, LOG_LEVEL_TRACE, logLevel, skills } from "@/lib/data/constants";

export type Quest = {
    id: number;
    name: string;
    description: string;
    image: string;
    metric: string;
    goal: string;
    story: string;
};

export type OnboardingUserData = {
    name: string;
    mission: string;
    selectedCauses: Cause[];
    selectedSkills: Skill[];
    selectedQuests: Quest[];
    picture: string;
};

export type OnboardingStepProps = {
    userData: OnboardingUserData;
    setUserData: React.Dispatch<React.SetStateAction<OnboardingUserData | undefined>>;
    nextStep: () => void;
    prevStep: () => void;
};

export default function Onboarding() {
    const [isOpen, setIsOpen] = useState(false);
    const [user, setUser] = useAtom(userAtom);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [authInfo] = useAtom(authInfoAtom);
    const [hasClosedOnboarding, setHasClosedOnboarding] = useState(false);

    const [userData, setUserData] = useState<OnboardingUserData | undefined>(undefined);

    // Filter steps based on what's already completed
    const steps = useMemo(() => {
        // Mapping of step IDs to components
        const stepComponents: Record<string, React.ComponentType<OnboardingStepProps>> = {
            welcome: WelcomeStep,
            mission: MissionStep,
            profile: ProfileStep,
            location: ProfileLocationStep,
            causes: CausesStep,
            skills: SkillsStep,
            final: FinalStep,
        };

        if (!user || !user.completedOnboardingSteps) {
            // First time - show all steps
            return ONBOARDING_STEPS.map((stepId) => ({
                id: stepId,
                component: stepComponents[stepId],
                title: getStepTitle(stepId),
            }));
        }

        // Get remaining steps the user needs to complete
        const completedSteps = user.completedOnboardingSteps as OnboardingStep[];

        // If user has completed all steps, don't open onboarding
        const allStepsComplete = ONBOARDING_STEPS.every((step) => completedSteps.includes(step));

        if (allStepsComplete) {
            return [];
        }

        // Filter to only show incomplete steps
        let stepsToShow: OnboardingStep[] = [];

        // Always show Welcome step if nothing completed yet
        if (completedSteps.length === 0) {
            stepsToShow.push("welcome");
        }

        // Add all incomplete steps in their original order
        for (const step of ONBOARDING_STEPS) {
            if (!completedSteps.includes(step) && step !== "welcome") {
                stepsToShow.push(step);
            }
        }

        // Always include Final step
        if (stepsToShow.length > 0 && !stepsToShow.includes("final")) {
            stepsToShow.push("final");
        }

        // Convert to step objects
        return stepsToShow.map((stepId) => ({
            id: stepId,
            component: stepComponents[stepId],
            title: getStepTitle(stepId),
        }));
    }, [user?.did]); // intentionally only update once user changes

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.Onboarding.1");
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        if (authInfo.authStatus !== "authenticated") return;

        // Check if there are any steps to show
        if (steps.length > 0 && !hasClosedOnboarding) {
            setIsOpen(true);
        }
    }, [user, authInfo, hasClosedOnboarding, steps]);

    // Effect to initialize and keep user data in sync
    useEffect(() => {
        if (!isOpen || !user) return;

        // Create or update the userData with current user values
        setUserData((prev) => {
            const newData = {
                name: user.name || "",
                mission: user.mission || "",
                selectedCauses: user.causes?.map((x) => causes.find((y) => y.handle === x) as Cause) ?? [],
                selectedSkills: user.skills?.map((x) => skills.find((y) => y.handle === x) as Skill) ?? [],
                selectedQuests: prev?.selectedQuests ?? [],
                picture: user.picture?.url || "/images/default-user-picture.png",
            };

            // If userData doesn't exist yet or if values have changed, return the new object
            return newData;
        });
    }, [isOpen, user?._id, user?.picture?.url]); // Only depend on significant user properties

    // Separate effect to reset step index only when onboarding opens or steps array changes
    useEffect(() => {
        // Only reset the current step when onboarding is first opened
        // or when the steps array changes structure (not when user state updates)
        if (isOpen && steps.length > 0) {
            setCurrentStepIndex(0);
        }
    }, [isOpen, steps.length]);

    // Helper function to get step titles
    function getStepTitle(stepId: string) {
        switch (stepId) {
            case "welcome":
                return "Welcome to MakeCircles";
            case "mission":
                return "Your Mission";
            case "profile":
                return "About You";
            case "location":
                return "Your Location";
            case "causes":
                return "Choose Your Causes";
            case "skills":
                return "Your Skills and Powers";
            case "final":
                return "Welcome, Changemaker!";
            default:
                return "Onboarding";
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
            setHasClosedOnboarding(true);
        }
    };

    const prevStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(currentStepIndex - 1);
        }
    };

    const CurrentStepComponent = steps[currentStepIndex]?.component;

    if (!isOpen || !userData) {
        return (
            <div
                className="absolute right-0 top-0 z-[600] h-[30px] w-[30px] cursor-pointer"
                onDoubleClick={() => setIsOpen(true)}
            ></div>
        );
    }

    return (
        <div className="fixed z-[500] flex h-screen w-screen items-center justify-center bg-gradient-to-br from-[#dce5ffcf] to-[#e3eaffcf] p-4">
            <svg width="0" height="0">
                <defs>
                    <clipPath id="waveClip">
                        <path d="M 0 20 Q 50 0, 100 20 T 200 20 L 200 180 Q 150 200, 100 180 T 0 180 Z" />
                    </clipPath>
                </defs>
            </svg>

            <div
                className="absolute right-0 top-0 z-[600] h-[100px] w-[100px] cursor-pointer"
                onClick={() => setIsOpen(false)}
            ></div>

            <Card className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border-0 bg-[#f9f9f9] shadow-xl backdrop-blur-sm">
                <CardContent className="max-h-[calc(90vh-2rem)] overflow-y-auto p-6">
                    <div className="flex gap-6">
                        <div className="hidden md:block">
                            <ProfileSummary userData={userData!} />
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
                                        userData={userData}
                                        setUserData={setUserData}
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
