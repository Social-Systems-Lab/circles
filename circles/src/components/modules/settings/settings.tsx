import DynamicForm from "@/components/forms/dynamic-form";
import { DynamicPageProps } from "../dynamic-page";

export default async function SettingsModule({ circle, page, isDefaultCircle }: DynamicPageProps) {
    return (
        <>
            <div className="flex flex-1 items-start lg:grow-[2] lg:justify-center">
                <DynamicForm formSchemaId="circle-about-form" initialFormData={circle} maxWidth="none" />
            </div>
            <div className="flex flex-1"></div>
        </>
    );
}
