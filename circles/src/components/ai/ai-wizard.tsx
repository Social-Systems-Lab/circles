"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getAnswer, getStreamedAnswer } from "./actions";
import { readStreamableValue } from "ai/rsc";
import { FaRegUser } from "react-icons/fa";
import { AiChat } from "./chat";
import Image from "next/image";
import { aiContexts } from "@/lib/ai-contexts";
import { AiContext } from "@/models/models";
import Map from "@/app/(circle)/Map";
import { FaDoorOpen } from "react-icons/fa6";
import { PiSignInBold } from "react-icons/pi";
import { IoCreate } from "react-icons/io5";
import { MdAccountCircle } from "react-icons/md";

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
        <div className="flex flex-col w-full items-center">
            <div className="flex-1">
                {/* <div className="flex flex-row mt-4 mb-2 text-white rounded-[20px] bg-[#8595c9]"> */}
                {/* <div className="flex flex-row mt-4 mb-2 text-black justify-center items-center"> */}
                <div className="flex flex-row p-1 mt-4 mb-2 text-white rounded-[20px] bg-[#8595c9] justify-center items-center">
                    {/* #57428d gray-200 */}
                    <div className="flex flex-row justify-center items-center ml-1 p-[2px]">{getIcon()}</div>
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
        <div className="flex flex-shrink-0 h-[48px] justify-center space-x-1 p-1 mt-4 mb-4 bg-[#f1f1f1] rounded-[8px]">
            <Button className={`w-[120px] py-2 px-4`} onClick={() => onTabChange("Assisted")} variant={activeTab === "Assisted" ? "outline" : "ghost"}>
                Assisted
            </Button>
            <Button className={`w-[120px] py-2 px-4`} onClick={() => onTabChange("Manual")} variant={activeTab === "Manual" ? "outline" : "ghost"}>
                Manual
            </Button>
        </div>
    );
}

function ManualForm() {
    return <div className="flex-1 flex flex-column">Configure Tab</div>;
}

type WizardDisplayProps = {
    data: any;
};

function WizardDisplay({ data }: WizardDisplayProps) {
    return (
        <div className="w-full h-full overflow-hidden relative">
            <Image src="/images/cover2.png" alt="" objectFit="cover" fill />
            {/* <Map mapboxKey="pk.eyJ1IjoidGltYW9sc3NvbiIsImEiOiJjbGQyMW05M2YwMXVhM3lvYzMweWllbDZtIn0.ar7LH2YZverGDBWGjxQ65w" /> */}
            <div className="bg-white rounded-[20px] p-4 m-4 absolute top-0 left-0">
                <h2 className="text-xl font-bold m-0 p-0 mb-4">FormData</h2>
                <pre className="w-full whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
            </div>
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
        <div className="flex flex-1 flex-row gap-0 h-full">
            <div className="flex-1 flex flex-col justify-center items-center max-w-[650px] h-full">
                <WizardContextHeader context={context} activeTab={activeTab} onTabChange={handleTabChange} />
                {activeTab === "Assisted" && <AiChat formData={formData} setFormData={setFormData} context={context} setContext={setContext} />}
                {activeTab === "Manual" && <ManualForm />}
            </div>
            <div className="flex-1 bg-[#fdfdfd] overflow-hidden relative">
                <WizardDisplay data={formData} />
            </div>
        </div>
    );
}
