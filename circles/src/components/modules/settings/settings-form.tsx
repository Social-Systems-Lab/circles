"use client";

import DynamicForm from "@/components/forms/dynamic-form";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Page } from "@/models/models";

export type SettingsFormProps = {
    page: Page;
    initialFormData: any;
    formSchemaId: string;
    subpage?: string;
};

export const SettingsForm = ({ formSchemaId, page, subpage, initialFormData }: SettingsFormProps) => {
    const isCompact = useIsCompact();

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
            />
        </div>
    );
};