"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import WelcomeStep from "./welcome-step";
import MissionStep from "./mission-step";
import CausesStep from "./causes-step";
import SkillsStep from "./skills-step";
import QuestsStep from "./quests-step";
import FinalStep from "./final-step";
import ProfileSummary from "./profile-summary";
import { Cause, Skill } from "@/models/models";
import { causes, skills } from "@/lib/data/constants";

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
    setUserData: React.Dispatch<React.SetStateAction<OnboardingUserData>>;
    nextStep: () => void;
    prevStep: () => void;
};

export default function Onboarding() {
    const [isOpen, setIsOpen] = useState(false);
    const [user, setUser] = useAtom(userAtom);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    const [userData, setUserData] = useState<OnboardingUserData | undefined>(undefined);

    useEffect(() => {
        if (!isOpen) return;
        setUserData({
            name: user?.name || "",
            mission: user?.mission || "",
            selectedCauses: user?.causes?.map((x) => causes.find((y) => y.handle === x) as Cause) ?? [],
            selectedSkills: user?.skills?.map((x) => skills.find((y) => y.handle === x) as Skill) ?? [],
            selectedQuests: [],
            picture: user?.picture?.url || "/images/default-user-picture.png",
        });
    }, [isOpen]);

    const steps = [
        {
            id: "welcome",
            component: WelcomeStep,
            title: "Welcome to Circles",
        },
        {
            id: "mission",
            component: MissionStep,
            title: "Your Mission",
        },
        {
            id: "causes",
            component: CausesStep,
            title: "Choose Your Causes",
        },
        {
            id: "skills",
            component: SkillsStep,
            title: "Your Skills and Powers",
        },
        {
            id: "quests",
            component: QuestsStep,
            title: "Embark on Quests",
        },
        {
            id: "final",
            component: FinalStep,
            title: "Welcome, Changemaker!",
        },
    ];

    const totalSteps = steps.length;

    const nextStep = () => {
        if (currentStepIndex + 1 < steps.length) {
            setCurrentStepIndex(currentStepIndex + 1);
        } else {
            setIsOpen(false);
        }
    };

    const prevStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(currentStepIndex - 1);
        }
    };

    const CurrentStepComponent = steps[currentStepIndex].component;

    if (!isOpen || !userData) {
        return (
            <div
                className="absolute right-0 top-0 z-[600] h-[30px] w-[30px] cursor-pointer"
                onClick={() => setIsOpen(true)}
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

            <Card className="w-full max-w-5xl overflow-hidden rounded-2xl border-0 bg-[#f9f9f9] shadow-xl backdrop-blur-sm">
                <CardContent className="p-6">
                    <div className="flex gap-6">
                        <ProfileSummary userData={userData} />
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
