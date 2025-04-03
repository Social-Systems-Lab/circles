import { DynamicPageLayout } from "@/components/modules/dynamic-page-layout";

type LayoutProps = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function CirclesLayout(props: LayoutProps) {
    const params = await props.params;
    const { children } = props;

    return (
        <DynamicPageLayout moduleHandle="circles" circleHandle={params.handle}>
            {children}
        </DynamicPageLayout>
    );
}
