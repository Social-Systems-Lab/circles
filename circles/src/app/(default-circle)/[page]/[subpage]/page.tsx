import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { page: string; subpage: string };
};

export default async function Subpage({ params }: PageProps) {
    return <DynamicPage pageHandle={params.page} subpage={params.subpage} isDefaultCircle={true} />;
}
