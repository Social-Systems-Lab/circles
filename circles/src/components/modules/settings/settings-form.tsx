"use client";

import DynamicForm from "@/components/forms/dynamic-form";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { Circle, Page } from "@/models/models";
import { useEffect } from "react";

export type SettingsFormProps = {
    page: Page;
    initialFormData: any;
    formSchemaId: string;
    subpage?: string;
    circle?: Circle;
};

export const SettingsForm = ({ formSchemaId, page, subpage, initialFormData, circle }: SettingsFormProps) => {
    const isCompact = useIsCompact();
    const isUser = circle?.circleType === "user";

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.SettingsForm.1");
        }
    }, []);

    return (
        <div
            className="flex h-full flex-1 items-start justify-center"
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "1000px",
            }}
        >
            <DynamicForm
                formSchemaId={formSchemaId}
                initialFormData={initialFormData}
                maxWidth="none"
                page={page}
                subpage={subpage}
                showReset={true}
                isUser={isUser}
            />
        </div>
    );
};
