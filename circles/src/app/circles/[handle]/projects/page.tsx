import DynamicPage from "@/components/modules/dynamic-page";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function ProjectsPage({ params, searchParams }: PageProps) {
    return <DynamicPage circleHandle={params.handle} moduleHandle="projects" searchParams={searchParams} />;
}
