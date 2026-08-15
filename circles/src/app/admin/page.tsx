import { Suspense } from "react";
import { getServerSettings } from "@/lib/data/server-settings";
import AdminDashboard from "@/components/modules/admin/admin-dashboard";
import { getOnboardingMcpStats } from "@/lib/data/user";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { redirect } from "next/navigation";
import { getCircles } from "@/lib/data/circle";

type AdminPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
    let serverSettings = await getServerSettings();

    // check if user is admin
    try {
        await requireSuperAdmin();
    } catch {
        redirect("/unauthorized");
    }

    const [circles, onboardingMcpStats] = await Promise.all([getCircles(), getOnboardingMcpStats()]);
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const initialTab = typeof resolvedSearchParams.tab === "string" ? resolvedSearchParams.tab : undefined;
    const initialVerificationCircleId =
        typeof resolvedSearchParams.circleId === "string" ? resolvedSearchParams.circleId : undefined;

    return (
        <div className="container mx-auto p-4">
            <h1 className="mb-4 text-2xl font-bold">Admin Dashboard</h1>

            <Suspense fallback={<div>Loading admin dashboard...</div>}>
                <AdminDashboard
                    serverSettings={serverSettings}
                    circles={circles}
                    onboardingMcpStats={onboardingMcpStats}
                    initialTab={initialTab}
                    initialVerificationCircleId={initialVerificationCircleId}
                />
            </Suspense>
        </div>
    );
}
