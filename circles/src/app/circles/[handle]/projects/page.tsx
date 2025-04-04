import { getCircleByHandle } from "@/lib/data/circle";
import ProjectsModule from "@/components/modules/projects/projects"; // Assuming default export
import { notFound } from "next/navigation";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function ProjectsPage(props: PageProps) {
    const circle = await getCircleByHandle(props.params.handle);

    if (!circle) {
        notFound();
    }

    // Pass circle and original props down to ProjectsModule
    // ProjectsModule likely fetches its own project data using these props
    return <ProjectsModule {...props} circle={circle} />;
}
