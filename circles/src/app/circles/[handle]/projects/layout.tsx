import { DynamicPageLayout } from "@/components/modules/dynamic-page-layout";

type LayoutProps = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function ProjectsLayout(props: LayoutProps) {
    const params = await props.params;
    const { children } = props;

    return (
        <DynamicPageLayout moduleHandle="projects" circleHandle={params.handle} isDefaultCircle={false}>
            {children}
        </DynamicPageLayout>
    );
}
