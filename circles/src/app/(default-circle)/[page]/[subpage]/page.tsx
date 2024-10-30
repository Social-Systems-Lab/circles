import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: Promise<{ page: string; subpage: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Subpage(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    return (
        <DynamicPage
            pageHandle={params.page}
            subpage={params.subpage}
            isDefaultCircle={true}
            searchParams={searchParams}
        />
    );
}
