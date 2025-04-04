import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";
import { SettingsLayoutWrapper } from "./settings-layout-wrapper";

type LayoutProps = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function SettingsLayout({ params, children }: LayoutProps) {
    const p = await params;
    const circle = await getCircleByHandle(p.handle);

    if (!circle) {
        notFound();
    }

    return <SettingsLayoutWrapper circle={circle}>{children}</SettingsLayoutWrapper>;
}
