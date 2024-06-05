import DynamicForm from "@/components/forms/dynamic-form";
import { ModulePageProps } from "../dynamic-page";
import { ScrollArea } from "@/components/ui/scroll-area";

export default async function SettingsModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    const getFormSchemaId = () => {
        switch (subpage) {
            default:
            case "about":
                return "circle-about-form";
            case "user-groups":
                return "circle-user-groups-form";
            case "access-rules":
                return "circle-access-rules-form";
        }
    };

    return (
        <>
            <div className="flex h-full flex-1 items-start md:pl-8 lg:grow-[2] lg:justify-center">
                <DynamicForm formSchemaId={getFormSchemaId()} initialFormData={circle} maxWidth="none" page={page} />
            </div>
            <div className="flex flex-1"></div>
        </>
    );
}
