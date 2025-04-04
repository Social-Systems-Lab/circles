import { getCircleByHandle } from "@/lib/data/circle";
import { CircleGeneralForm } from "@/components/forms/circle-settings/circle-general-form";
import { notFound } from "next/navigation";

type PageProps = {
    params: { handle: string };
    // searchParams are no longer needed by the specific form
};

export default async function GeneralSettingsPage({ params }: PageProps) {
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound(); // Or handle appropriately if circle not found
    }

    // Render the specific form component, passing the circle data
    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">General Settings</h1>
            <p className="mb-6 text-muted-foreground">
                This section contains general settings and administrative actions for this circle.
            </p>
            <CircleGeneralForm circle={circle} />;
        </div>
    );
}
