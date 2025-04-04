import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function ProposalsPage(props: PageProps) {
    const params = await props.params;
    const searchParams = await props.searchParams;

    return <DynamicPage circleHandle={params.handle} moduleHandle="proposals" searchParams={searchParams} />;
}
