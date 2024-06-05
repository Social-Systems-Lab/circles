import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string; page: string; subpage: string };
};

export default async function Subpage({ params }: PageProps) {
    return (
        <DynamicPage
            circleHandle={params.handle}
            pageHandle={params.page}
            subpage={params.subpage}
            isDefaultCircle={false}
        />
    );
}
