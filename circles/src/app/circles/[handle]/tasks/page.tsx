import TasksModule from "@/components/modules/tasks/tasks";
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function TasksPage(props: PageProps) {
    // Renamed function
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound(); // Show 404 if circle doesn't exist
    }

    // Render the TasksModule, passing the fetched circle data
    // TasksModule will handle fetching its own data (tasks) and permissions
    return <TasksModule circle={circle} />; // Use renamed component
}
