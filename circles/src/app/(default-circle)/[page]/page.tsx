import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { page: string };
};

export default async function Page({ params }: PageProps) {
    return <DynamicPage pageHandle={params.page} isDefaultCircle={true} />;
}
