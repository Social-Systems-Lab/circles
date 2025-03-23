import { Suspense } from "react";
import DynamicForm from "@/components/forms/dynamic-form";
import { getServerSettings } from "@/lib/data/server-settings";

export default async function AdminPage() {
    let serverSettings = await getServerSettings();

    return (
        <div className="container mx-auto p-4">
            <h1 className="mb-4 text-2xl font-bold">Admin Panel</h1>
            
            <div className="mb-8">
                <h2 className="mb-2 text-xl font-semibold">Server Settings</h2>
                <Suspense fallback={<div>Loading form...</div>}>
                    <div className="pt-4">
                        <DynamicForm formSchemaId="server-settings-form" initialFormData={serverSettings} maxWidth="600px" />
                    </div>
                </Suspense>
            </div>
        </div>
    );
}
