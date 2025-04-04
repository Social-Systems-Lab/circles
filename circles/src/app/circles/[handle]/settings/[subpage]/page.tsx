import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: Promise<{ handle: string; page: string; subpage: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Subpage(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = await props.params;

    console.log("Requesting access to subpage", params.subpage, "of page", params.page, "in circle", params.handle);

    return (
        <DynamicPage
            circleHandle={params.handle}
            pageHandle={params.page}
            subpage={params.subpage}
            searchParams={searchParams}
        />
    );
}
