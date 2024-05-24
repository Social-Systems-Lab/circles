"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getAnswer, getStreamedAnswer } from "./actions";
import { readStreamableValue } from "ai/rsc";
import { FaRegUser } from "react-icons/fa";
import { AiChat } from "./chat";
import Image from "next/image";
import { AiWizardContext, aiWizardContexts } from "@/models/ai-wizard-contexts";

type ContextProps = {
    activeTab: WizardModeOptions;
    onTabChange: (tab: WizardModeOptions) => void;
};

export function WizardContextHeader({ activeTab, onTabChange }: ContextProps) {
    return (
        <div className="flex flex-col w-full items-center">
            <div className="flex-1">
                <div className="flex flex-row mt-4 mb-2 text-white rounded-[20px] bg-[#8595c9]">
                    {/* #57428d gray-200 */}
                    <h4 className="m-0 p-2 pl-6 pr-6 text-[16px]">Welcome to Circles!</h4>
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
        <div className="p-4 w-full h-full overflow-hidden relative">
            <Image src="/images/cover2.png" alt="" objectFit="cover" fill />
            <div className="bg-white rounded-[20px] p-4 absolute top-2 left-2">
                <h2 className="text-xl font-bold m-0 p-0 mb-4">FormData</h2>
                <pre className="w-full whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
            </div>
        </div>
    );
}

type AiWizardProps = {
    initialContext?: AiWizardContext;
};

export function AiWizard({ initialContext = aiWizardContexts["logged-out-welcome"] }: AiWizardProps) {
    const [activeTab, setActiveTab] = useState<WizardModeOptions>("Assisted");
    const [context, setContext] = useState<AiWizardContext>(initialContext);
    const [formData, setFormData] = useState<any>({});

    const handleTabChange = (tab: WizardModeOptions) => {
        setActiveTab(tab);
    };

    return (
        <div className="flex flex-1 flex-row gap-0 h-full">
            <div className="flex-1 flex flex-col justify-center items-center max-w-[650px] h-full">
                <WizardContextHeader activeTab={activeTab} onTabChange={handleTabChange} />
                {activeTab === "Assisted" && <AiChat formData={formData} setFormData={setFormData} context={context} setContext={setContext} />}
                {activeTab === "Manual" && <ManualForm />}
            </div>
            <div className="flex-1 bg-[#fdfdfd] overflow-hidden relative">
                <WizardDisplay data={formData} />
            </div>
        </div>
    );
}
