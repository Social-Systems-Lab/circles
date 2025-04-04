import { getCircleByHandle } from "@/lib/data/circle";
import FeedsLayout from "@/components/modules/feeds/feeds-layout"; // Assuming default export
import { notFound } from "next/navigation";

type LayoutProps = {
    params: { handle: string };
    children: React.ReactNode;
};

export default async function FeedLayout({ params, children }: LayoutProps) {
    // Fetch circle data if needed by FeedsLayout (assuming it might be)
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    // Use the specific layout component
    // Assuming FeedsLayout takes circle and children props
    return <FeedsLayout circle={circle}>{children}</FeedsLayout>;
}
