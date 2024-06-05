import DynamicPageLayout from "@/components/modules/dynamic-page-layout";

type PageProps = {
    params: { page: string; handle: string };
    children: React.ReactNode;
};

export default async function PageLayout({ children, params }: PageProps) {
    return (
        <DynamicPageLayout pageHandle={params.page} circleHandle={params.handle} isDefaultCircle={false}>
            {children}
        </DynamicPageLayout>
    );
}
