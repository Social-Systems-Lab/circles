import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function ServerSettingsPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = await props.params;

    return (
        <DynamicPage
            circleHandle={params.handle}
            moduleHandle="settings"
            subpage="server-settings"
            searchParams={searchParams}
        />
    );
}
