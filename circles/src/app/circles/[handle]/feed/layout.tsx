import { getCircleByHandle } from "@/lib/data/circle";
import FeedsLayout from "@/components/modules/feeds/feeds-layout"; // Assuming default export
import { notFound } from "next/navigation";

type LayoutProps = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function FeedLayout({ params, children }: LayoutProps) {
    const p = await params;
    const circle = await getCircleByHandle(p.handle);

    if (!circle) {
        notFound();
    }

    // Use the specific layout component
    // Assuming FeedsLayout takes circle and children props
    return <FeedsLayout circle={circle}>{children}</FeedsLayout>;
}
