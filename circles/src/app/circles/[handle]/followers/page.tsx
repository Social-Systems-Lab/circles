import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function FollowersPage({ params, searchParams }: PageProps) {
    return (
        <DynamicPage
            circleHandle={params.handle}
            moduleHandle="followers"
            isDefaultCircle={false}
            searchParams={searchParams}
        />
    );
}
