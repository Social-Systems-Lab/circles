import { getCircleByHandle } from "@/lib/data/circle";
import { TaskForm } from "@/components/modules/tasks/task-form"; // Import TaskForm
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation"; // Import notFound

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CreateTaskPage(props: PageProps) {
    // Renamed function
    const params = await props.params;
    const circleHandle = params.handle;

    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Get the circle
    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound(); // Use notFound if circle doesn't exist
    }

    // Check if user has permission to create tasks
    const canCreateTasks = await isAuthorized(userDid, circle._id as string, features.tasks.create); // Updated feature check
    if (!canCreateTasks) {
        // Updated variable
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to create tasks in this circle.</p>{" "}
                {/* Updated text & fixed quote */}
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/tasks`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Tasks {/* Updated text */}
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/tasks`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Tasks {/* Updated text */}
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Create New Task</h1> {/* Updated text */}
            </div>
            {/* Render TaskForm, passing circle and circleHandle */}
            <TaskForm circle={circle} circleHandle={circleHandle} /> {/* Use TaskForm */}
        </div>
    );
}
