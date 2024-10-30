import DynamicPageLayout from "@/components/modules/dynamic-page-layout";

type PageProps = {
    params: Promise<{ page: string }>;
    children: React.ReactNode;
};

export default async function PageLayout(props: PageProps) {
    const params = await props.params;

    const {
        children
    } = props;

    return (
        <DynamicPageLayout pageHandle={params.page} isDefaultCircle={true}>
            {children}
        </DynamicPageLayout>
    );
}
