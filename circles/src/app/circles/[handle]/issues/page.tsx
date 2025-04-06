import { getCircleByHandle } from "@/lib/data/circle";
import IssuesModule from "@/components/modules/issues/Issues"; // Import the Issues module component
import { notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function IssuesPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound(); // Show 404 if circle doesn't exist
    }

    // Render the IssuesModule, passing the fetched circle data
    // IssuesModule will handle fetching its own data (issues) and permissions
    return <IssuesModule circle={circle} />;
}
