import DynamicPage from "@/components/modules/dynamic-page";
import { getDefaultCircle } from "@/lib/data/circle";
import { redirect } from "next/navigation";

type PageProps = {
    params: { page: string; subpage: string };
};

export default async function Subpage({ params }: PageProps) {
    let circle = await getDefaultCircle(true);
    let page = circle.pages?.find((p) => p.handle === params.page);
    if (!page) {
        // redirect to not-found
        redirect(`/not-found`);
    }

    return <DynamicPage circle={circle} page={page} subpage={params.subpage} isDefaultCircle={true} />;
}
