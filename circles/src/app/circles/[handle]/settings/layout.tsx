import { getCircleByHandle } from "@/lib/data/circle";
import SettingsLayoutComponent from "@/components/modules/settings/settings-layout"; // Renamed import to avoid name clash
import { notFound } from "next/navigation";

type LayoutProps = {
    params: { handle: string };
    children: React.ReactNode;
};

export default async function SettingsLayout({ params, children }: LayoutProps) {
    // Fetch circle data if needed by SettingsLayoutComponent (assuming it might be)
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    // Use the specific layout component
    // Assuming SettingsLayoutComponent takes circle and children props
    return <SettingsLayoutComponent circle={circle}>{children}</SettingsLayoutComponent>;
}
