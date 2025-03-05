import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: Promise<{ handle: string; page: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = await props.params;

    return (
        <DynamicPage
            circleHandle={params.handle}
            pageHandle={params.page}
            isDefaultCircle={false}
            searchParams={searchParams}
        />
    );
}
