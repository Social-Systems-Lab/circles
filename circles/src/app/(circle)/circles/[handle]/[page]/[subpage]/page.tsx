import DynamicPage from "@/components/modules/dynamic-page";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import { redirect } from "next/navigation";

type PageProps = {
    params: { handle: string; page: string; subpage: string };
};

export default async function Subpage({ params }: PageProps) {
    let circle = await getCircleByHandle(params.handle);
    let page = circle.pages.find((p) => p.handle === params.page);
    console.log("page", page);
    if (!page) {
        // redirect to not-found
        redirect(`/not-found`);
    }

    return <DynamicPage circle={circle} page={page} subpage={params.subpage} isDefaultCircle={false} />;
}