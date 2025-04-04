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
    return <CircleGeneralForm circle={circle} />;
}
