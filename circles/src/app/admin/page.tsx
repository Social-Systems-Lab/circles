import { Suspense } from "react";
import { getServerSettings } from "@/lib/data/server-settings";
import AdminDashboard from "@/components/modules/admin/admin-dashboard";
import { getUserPrivate } from "@/lib/data/user";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
    let serverSettings = await getServerSettings();

    // check if user is admin
    let userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/unauthenticated");
    }
    let user = await getUserPrivate(userDid);
    if (!user.isAdmin) {
        redirect("/unauthorized");
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="mb-4 text-2xl font-bold">Admin Dashboard</h1>

            <Suspense fallback={<div>Loading admin dashboard...</div>}>
                <AdminDashboard serverSettings={serverSettings} />
            </Suspense>
        </div>
    );
}
