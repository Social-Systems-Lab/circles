import { Suspense } from "react";
import DynamicForm from "@/components/forms/dynamic-form";
import { getServerSettings } from "@/lib/data/server-settings";

export default async function AdminPage() {
    let serverSettings = await getServerSettings();

    return (
        <Suspense fallback={<div>Loading form...</div>}>
            <div className="pt-4">
                <DynamicForm formSchemaId="server-settings-form" initialFormData={serverSettings} maxWidth="600px" />
            </div>
        </Suspense>
    );
}
