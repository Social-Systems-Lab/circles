import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string; page: string; subpage: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function Subpage({ params, searchParams }: PageProps) {
    return (
        <DynamicPage
            circleHandle={params.handle}
            pageHandle={params.page}
            subpage={params.subpage}
            isDefaultCircle={false}
            searchParams={searchParams}
        />
    );
}
