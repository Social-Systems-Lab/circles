import TasksModule from "@/components/modules/tasks/Tasks";
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function ShiftsPage(props: PageProps) {
    const params = await props.params;
    const circle = await getCircleByHandle(params.handle);

    if (!circle) {
        notFound();
    }

    return <TasksModule circle={circle} taskKind="shifts" />;
}
