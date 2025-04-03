import { DynamicPageLayout } from "@/components/modules/dynamic-page-layout";

type LayoutProps = {
    params: Promise<{ handle: string }>;
    children: React.ReactNode;
};

export default async function FollowersLayout(props: LayoutProps) {
    const params = await props.params;
    const { children } = props;

    return (
        <DynamicPageLayout moduleHandle="followers" circleHandle={params.handle} isDefaultCircle={false}>
            {children}
        </DynamicPageLayout>
    );
}
