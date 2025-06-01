import { getCircleByHandle } from "@/lib/data/circle";
import ProposalsTabs from "@/components/modules/proposals/proposals-tabs"; // Import the new Tabs component
import { notFound } from "next/navigation";
import { Suspense } from "react"; // Import Suspense for client components
import { Loader2 } from "lucide-react"; // For loading state

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ProposalsPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    // Render the new ProposalsTabs component
    // It's a client component, so wrap with Suspense if it fetches data internally
    // or pass initial data if fetched here (though ProposalsTabs is set up for client-side fetching for now)
    return (
        <Suspense
            fallback={
                <div className="flex h-screen w-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            }
        >
            <ProposalsTabs circle={circle} />
        </Suspense>
    );
}
