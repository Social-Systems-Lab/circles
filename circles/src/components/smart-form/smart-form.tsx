"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getAnswer, getStreamedAnswer } from "./actions";
import { readStreamableValue } from "ai/rsc";
import { FaRegUser } from "react-icons/fa";
import { AssistantChat } from "./chat";

type FormModeOptions = "Assistant" | "Configure";

type FormModeTabsProps = {
    activeTab: FormModeOptions;
    onTabChange: (tab: FormModeOptions) => void;
};

export function FormModeTabs({ activeTab, onTabChange }: FormModeTabsProps) {
    return (
        <div className="flex flex-shrink-0 h-[48px] justify-center space-x-1 p-1 mt-4 mb-4 bg-[#f1f1f1] rounded-[8px]">
            <Button className={`w-[120px] py-2 px-4`} onClick={() => onTabChange("Assistant")} variant={activeTab === "Assistant" ? "outline" : "ghost"}>
                Assistant
            </Button>
            <Button className={`w-[120px] py-2 px-4`} onClick={() => onTabChange("Configure")} variant={activeTab === "Configure" ? "outline" : "ghost"}>
                Configure
            </Button>
        </div>
    );
}

function ConfigureForm() {
    return <div className="flex-1 flex flex-column">Configure Tab</div>;
}

type FormDataDisplayProps = {
    data: any;
};

function FormDataDisplay({ data }: FormDataDisplayProps) {
    return (
        <div className="p-4">
            <h2 className="text-xl font-bold m-0 p-0 mb-4">Preview</h2>
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    );
}

export function SmartForm() {
    const [activeTab, setActiveTab] = useState<FormModeOptions>("Assistant");
    const [formData, setFormData] = useState<any>({});

    const handleTabChange = (tab: FormModeOptions) => {
        setActiveTab(tab);
    };

    return (
        <div className="flex flex-1 flex-row gap-0 h-full">
            <div className="flex-1 flex flex-col justify-center items-center max-w-[650px] h-full">
                <FormModeTabs activeTab={activeTab} onTabChange={handleTabChange} />
                {activeTab === "Assistant" && <AssistantChat />}
                {activeTab === "Configure" && <ConfigureForm />}
            </div>
            <div className="flex-1 bg-[#fdfdfd] overflow-hidden relative">
                <FormDataDisplay data={formData} />
            </div>
        </div>
    );
}
