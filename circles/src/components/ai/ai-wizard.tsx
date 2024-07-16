"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { AiChat } from "./chat";
import Image from "next/image";
import { aiContexts } from "@/lib/ai-contexts";
import { AiContext } from "@/models/models";
import { FaDoorOpen } from "react-icons/fa6";
import { PiSignInBold } from "react-icons/pi";
import { IoCreate } from "react-icons/io5";
import { MdAccountCircle } from "react-icons/md";

const PersonalAchievements = ({ maxItems = 5 }) => {
    const [achievements, setAchievements] = useState<string[]>([]);
    const [counter, setCounter] = useState<number>(1);
    const [overflow, setOverflow] = useState<boolean>(false);

    const addAchievement = (newAchievement: string) => {
        const newAchievements = [...achievements, newAchievement + " " + counter];
        if (newAchievements.length > maxItems) {
            newAchievements.shift();
            setOverflow(true);
            setAchievements(newAchievements);

            // setTimeout(() => {
            //     setOverflow(false);
            //     newAchievements.shift();
            //     setAchievements((x) => newAchievements);
            // }, 1000); // Duration of the slide-up animation
        } else {
            setAchievements(newAchievements);
        }

        // setOverflow(true);
        // setTimeout(() => {
        //   setOverflow(false);
        //   newAchievements.shift();
        //   setAchievements(newAchievements);
        // }, 500); // Duration of the slide-up animation

        // setAchievements((prev) => {
        //     const newAchievements = [...prev, newAchievement + " " + counter];
        //     if (newAchievements.length > maxItems) {
        //         newAchievements.shift();
        //     }
        //     return newAchievements;
        // });
        setCounter((prev) => prev + 1);
    };

    return (
        <div>
            {achievements.map((achievement, index) => (
                <div
                    key={achievement}
                    className={`my-2 flex transform items-center ${overflow && index !== achievements.length - 1 ? "animate-slide-up" : index === achievements.length - 1 ? "animate-slide-in" : ""}`}
                    // className="animate-slide-in my-2 flex transform items-center"
                >
                    {/* transition-all duration-500 ease-in-out */}
                    <span className="mr-2 text-green-500">✔</span>
                    <span className="text-lg">{achievement}</span>
                </div>
            ))}
            <Button onClick={() => addAchievement("New Achievement")} className="mt-4">
                Add Achievement
            </Button>
        </div>
    );
};

type ContextProps = {
    context: AiContext;
    activeTab: WizardModeOptions;
    onTabChange: (tab: WizardModeOptions) => void;
};

export function WizardContextHeader({ context, activeTab, onTabChange }: ContextProps) {
    const getIcon = () => {
        switch (context.icon) {
            case "FaDoorOpen":
                return <FaDoorOpen />;
            case "PiSignInBold":
                return <PiSignInBold />;
            case "IoCreate":
                return <IoCreate />;
            case "MdAccountCircle":
                return <MdAccountCircle />;
            default:
                return null;
        }
    };

    return (
        <div className="flex w-full flex-col items-center">
            <div className="flex-1">
                {/* <div className="flex flex-row mt-4 mb-2 text-white rounded-[20px] bg-[#8595c9]"> */}
                {/* <div className="flex flex-row mt-4 mb-2 text-black justify-center items-center"> */}
                <div className="mb-2 mt-4 flex flex-row items-center justify-center rounded-[20px] bg-[#8595c9] p-1 text-white">
                    {/* #57428d gray-200 */}
                    <div className="ml-1 flex flex-row items-center justify-center p-[2px]">{getIcon()}</div>
                    <h4 className="m-0 ml-2 mr-4 text-[16px]">{context.title}</h4>
                </div>
            </div>
            <div className="flex-1">
                <div className="pr-4">{/* <FormModeTabs activeTab={activeTab} onTabChange={onTabChange} /> */}</div>
            </div>
        </div>
    );
}

type WizardModeOptions = "Assisted" | "Manual";

type WizardModeTabsProps = {
    activeTab: WizardModeOptions;
    onTabChange: (tab: WizardModeOptions) => void;
};

export function WizardModeTabs({ activeTab, onTabChange }: WizardModeTabsProps) {
    return (
        <div className="mb-4 mt-4 flex h-[48px] flex-shrink-0 justify-center space-x-1 rounded-[8px] bg-[#f1f1f1] p-1">
            <Button
                className={`w-[120px] px-4 py-2`}
                onClick={() => onTabChange("Assisted")}
                variant={activeTab === "Assisted" ? "outline" : "ghost"}
            >
                Assisted
            </Button>
            <Button
                className={`w-[120px] px-4 py-2`}
                onClick={() => onTabChange("Manual")}
                variant={activeTab === "Manual" ? "outline" : "ghost"}
            >
                Manual
            </Button>
        </div>
    );
}

type ManualFormProps = {
    context?: AiContext;
    formData?: any;
};

function ManualForm({ context, formData }: ManualFormProps) {
    return <div className="flex-column flex flex-1">{/* Generate form from context */}</div>;
}

type WizardDisplayProps = {
    formData: any;
};

function WizardDisplay({ formData }: WizardDisplayProps) {
    const emptyFormData = !formData || Object.keys(formData).length === 0;

    return (
        <div className="relative h-full w-full overflow-hidden">
            <Image className="opacity-100" src="/images/cover2.png" alt="" objectFit="cover" fill />
            {/* <Map mapboxKey="pk.eyJ1IjoidGltYW9sc3NvbiIsImEiOiJjbGQyMW05M2YwMXVhM3lvYzMweWllbDZtIn0.ar7LH2YZverGDBWGjxQ65w" /> */}
            {!emptyFormData && (
                <div className="absolute left-0 top-0 flex h-full w-full flex-row items-center justify-center">
                    <div className="m-4 max-w-[600px] rounded-[20px] bg-white p-4 shadow-lg">
                        <h2 className="m-0 mb-4 p-0 text-xl font-bold">FormData</h2>
                        <pre className="w-full whitespace-pre-wrap">{JSON.stringify(formData, null, 2)}</pre>
                    </div>
                </div>
            )}
            <div className="absolute left-[10px] top-[10px] flex">{/* <PersonalAchievements /> */}</div>
        </div>
    );
}

type AiWizardProps = {
    initialContext?: AiContext;
};

export function AiWizard({ initialContext = aiContexts["logged-out-welcome"] }: AiWizardProps) {
    const [activeTab, setActiveTab] = useState<WizardModeOptions>("Assisted");
    const [context, setContext] = useState<AiContext>(initialContext);
    const [formData, setFormData] = useState<any>({});

    const handleTabChange = (tab: WizardModeOptions) => {
        setActiveTab(tab);
    };

    return (
        <div className="flex h-full flex-1 flex-row gap-0">
            <div className="flex h-full max-w-[650px] flex-1 flex-col items-center justify-center">
                <WizardContextHeader context={context} activeTab={activeTab} onTabChange={handleTabChange} />
                <WizardModeTabs activeTab={activeTab} onTabChange={handleTabChange} />
                {activeTab === "Assisted" && (
                    <AiChat formData={formData} setFormData={setFormData} context={context} setContext={setContext} />
                )}
                {activeTab === "Manual" && <ManualForm />}
            </div>
            <div className="relative flex-1 overflow-hidden bg-[#fdfdfd]">
                <WizardDisplay formData={formData} />
            </div>
        </div>
    );
}
