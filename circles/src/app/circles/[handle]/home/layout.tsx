import { getCircleByHandle } from "@/lib/data/circle";
import HomeModuleWrapper from "@/components/modules/home/home-module-wrapper";
import { notFound } from "next/navigation";

type LayoutProps = {
    params: { handle: string }; // Changed params type
    children: React.ReactNode;
};

export default async function HomeLayout({ params, children }: LayoutProps) {
    // Fetch circle data needed by the wrapper
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    // Use the specific wrapper component
    return <HomeModuleWrapper circle={circle}>{children as React.ReactNode[]}</HomeModuleWrapper>;
}
