import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { page: string; subpage: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function Subpage({ params, searchParams }: PageProps) {
    return (
        <DynamicPage
            pageHandle={params.page}
            subpage={params.subpage}
            isDefaultCircle={true}
            searchParams={searchParams}
        />
    );
}
