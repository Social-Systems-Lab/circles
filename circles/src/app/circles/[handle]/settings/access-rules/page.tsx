import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function AccessRulesSettingsPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = await props.params;

    return (
        <DynamicPage
            circleHandle={params.handle}
            moduleHandle="settings"
            subpage="access-rules"
            searchParams={searchParams}
        />
    );
}
