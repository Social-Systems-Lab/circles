import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string; page: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function Page({ params, searchParams }: PageProps) {
    return (
        <DynamicPage
            circleHandle={params.handle}
            pageHandle={params.page}
            isDefaultCircle={false}
            searchParams={searchParams}
        />
    );
}
