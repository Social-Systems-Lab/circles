import DynamicPageLayout from "@/components/modules/dynamic-page-layout";

type PageProps = {
    params: { page: string };
    children: React.ReactNode;
};

export default async function PageLayout({ children, params }: PageProps) {
    return (
        <DynamicPageLayout pageHandle={params.page} isDefaultCircle={true}>
            {children}
        </DynamicPageLayout>
    );
}
