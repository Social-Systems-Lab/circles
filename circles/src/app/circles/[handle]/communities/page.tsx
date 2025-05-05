import { getCircleByHandle } from "@/lib/data/circle";
import CirclesModule from "@/components/modules/circles/circles"; // Assuming default export
import { notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CirclesPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    // Pass circle and original props down to CirclesModule
    // CirclesModule likely fetches its own sub-circle data using these props
    return <CirclesModule {...props} circle={circle} />;
}
