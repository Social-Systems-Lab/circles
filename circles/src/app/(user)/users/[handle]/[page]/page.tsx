import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string; page: string };
};

export default async function Page({ params }: PageProps) {
    return <DynamicPage circleHandle={params.handle} pageHandle={params.page} isDefaultCircle={false} isUser={true} />;
}
