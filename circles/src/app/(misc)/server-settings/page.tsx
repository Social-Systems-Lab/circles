import DynamicForm from "@/components/forms/dynamic-form";
import { getServerSettings } from "@/lib/data/server-settings";
import { Suspense } from "react";

export default async function ServerSettings() {
    // get current server settings
    let serverSettings = await getServerSettings();

    return (
        <div className="flex flex-1 items-start justify-center pt-[40px]">
            <Suspense fallback={<div></div>}>
                <DynamicForm formSchemaId="server-settings-form" initialFormData={serverSettings} showReset={true} />
            </Suspense>
        </div>
    );
}