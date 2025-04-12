// circles/[handle]/tasks/[taskId]/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { getTaskAction } from "../actions"; // Use task action
import TaskDetail from "@/components/modules/tasks/task-detail"; // Use TaskDetail component
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect, notFound } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string; taskId: string }>; // Expect taskId
};

export default async function TaskDetailPage(props: PageProps) {
    // Renamed function
    const params = await props.params;
    const circleHandle = params.handle;
    const taskId = params.taskId; // Use taskId

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

    // Get the task - getTaskAction already handles basic view permissions
    const task = await getTaskAction(circleHandle, taskId); // Renamed function call, variable, param

    // If task is null, it means not found or user not authorized to view
    if (!task) {
        // Renamed variable
        return (
            <div className="formatted flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Task Not Found</h2> {/* Updated text */}
                <p className="text-gray-600">
                    The task you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.{" "}
                    {/* Updated text & fixed quotes */}
                </p>
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

    // Fetch detailed permissions for actions within the detail view
    const permissions = {
        canModerate: await isAuthorized(userDid, circle._id as string, features.tasks.moderate), // Updated feature
        canReview: await isAuthorized(userDid, circle._id as string, features.tasks.review), // Updated feature
        canAssign: await isAuthorized(userDid, circle._id as string, features.tasks.assign), // Updated feature
        canResolve: await isAuthorized(userDid, circle._id as string, features.tasks.resolve), // Updated feature
        canComment: await isAuthorized(userDid, circle._id as string, features.tasks.comment), // Updated feature
    };

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/tasks`}>
                        {" "}
                        {/* Updated path */}
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Tasks {/* Updated text */}
                    </Link>
                </Button>
            </div>

            <div className="mx-auto w-full max-w-4xl px-4">
                {/* Render TaskDetail component */}
                <TaskDetail task={task} circle={circle} permissions={permissions} currentUserDid={userDid} />{" "}
                {/* Use TaskDetail, pass task */}
            </div>
        </div>
    );
}
