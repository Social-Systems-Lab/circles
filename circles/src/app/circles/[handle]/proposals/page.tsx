import { getCircleByHandle } from "@/lib/data/circle";
import ProposalsModule from "@/components/modules/proposals/proposals"; // Assuming default export
import { notFound } from "next/navigation";

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

    // Pass circle and original props down to ProposalsModule
    // ProposalsModule likely fetches its own proposal data using these props
    return <ProposalsModule {...props} circle={circle} />;
}
