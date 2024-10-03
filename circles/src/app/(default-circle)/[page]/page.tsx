import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { page: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function Page({ params, searchParams }: PageProps) {
    return <DynamicPage pageHandle={params.page} isDefaultCircle={true} searchParams={searchParams} />;
}
