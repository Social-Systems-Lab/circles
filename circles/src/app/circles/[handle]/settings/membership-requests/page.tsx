import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function MembershipRequestsSettingsPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = await props.params;

    return <DynamicPage circleHandle={params.handle} moduleHandle="settings" searchParams={searchParams} />;
}
