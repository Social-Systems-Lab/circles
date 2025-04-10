import { getCircleByHandle } from "@/lib/data/circle";
import { getTaskById } from "@/lib/data/task"; // Use task data function
import { TaskForm } from "@/components/modules/tasks/task-form"; // Use TaskForm
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";

type PageProps = {
    params: Promise<{ handle: string; taskId: string }>; // Expect taskId
};

export default async function EditTaskPage(props: PageProps) {
    // Renamed function
    const params = await props.params;
    const circleHandle = params.handle;
    const taskId = params.taskId; // Use taskId

    // Validate taskId format if necessary (e.g., check if it's a valid ObjectId)
    if (!ObjectId.isValid(taskId)) {
        // Use taskId
        notFound();
    }

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    // Get the task
    const task = await getTaskById(taskId); // Renamed function call, variable, param
    if (!task) {
        // Renamed variable
        notFound();
    }

    // Check if user has permission to edit tasks
    const canEditTasks = await isAuthorized(userDid, circle._id as string, features.tasks.update); // Updated feature check
    if (!canEditTasks) {
        // Renamed variable
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to edit tasks in this circle.</p>{" "}
                {/* Updated text & fixed quote */}
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/tasks/${taskId}`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Task {/* Updated text */}
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/tasks/${taskId}`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Task {/* Updated text */}
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Edit Task</h1> {/* Updated text */}
            </div>
            {/* Render TaskForm, passing circle, circleHandle, and the existing task */}
            <TaskForm circle={circle} circleHandle={circleHandle} task={task} taskId={task._id} />{" "}
            {/* Use TaskForm, pass task/taskId */}
        </div>
    );
}
