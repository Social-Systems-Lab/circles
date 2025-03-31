import { Suspense } from "react";
import { getServerSettings } from "@/lib/data/server-settings";
import AdminDashboard from "@/components/modules/admin/admin-dashboard";

export default async function AdminPage() {
    let serverSettings = await getServerSettings();

    return (
        <div className="container mx-auto p-4">
            <h1 className="mb-4 text-2xl font-bold">Admin Dashboard</h1>

            <Suspense fallback={<div>Loading admin dashboard...</div>}>
                <AdminDashboard serverSettings={serverSettings} />
            </Suspense>
        </div>
    );
}
