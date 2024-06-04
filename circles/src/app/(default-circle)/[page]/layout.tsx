import DynamicPageLayout from "@/components/modules/dynamic-page-layout";
import { getDefaultCircle } from "@/lib/data/circle";
import { redirect } from "next/navigation";

type PageProps = {
    params: { page: string };
    children: React.ReactNode;
};

export default async function PageLayout({ children, params }: PageProps) {
    let circle = await getDefaultCircle(true);
    let page = circle.pages.find((p) => p.handle === params.page);
    if (!page) {
        // redirect to not-found
        redirect(`/not-found`);
    }

    return (
        <DynamicPageLayout circle={circle} page={page} isDefaultCircle={true}>
            {children}
        </DynamicPageLayout>
    );
}
