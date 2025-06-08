// circles/[handle]/tasks/create/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { TaskForm } from "@/components/modules/tasks/task-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth"; // Reverted to getAuthenticatedUserDid
import { getUserPrivate } from "@/lib/data/user"; // Import getUserPrivate
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
// Import the goals action
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { GoalDisplay, UserPrivate } from "@/models/models"; // Import GoalDisplay type, UserPrivate
import { CreatableItemDetail } from "@/components/global-create/global-create-dialog-content"; // Keep type import

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CreateTaskPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }
    const user = await getUserPrivate(userDid); // Get full user object using userDid
    if (!user) {
        // This case should ideally not happen if userDid is valid, but good to handle
        console.error("Failed to fetch user details for DID:", userDid);
        redirect("/login"); // Or show an error page
    }

    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    const canCreateTasks = await isAuthorized(userDid, circle._id as string, features.tasks.create);
    if (!canCreateTasks) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to create tasks in this circle.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/tasks`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Tasks
                    </Link>
                </Button>
            </div>
        );
    }

    // --- Fetch Goals Server-Side ---
    let goals: GoalDisplay[] = [];
    const goalsModuleEnabled = circle.enabledModules?.includes("goals") ?? false;
    if (goalsModuleEnabled) {
        try {
            const result = await getGoalsAction(circleHandle);
            if (result.goals) {
                goals = result.goals;
            } else {
                console.error("Failed to fetch goals server-side:");
                // Optionally handle error display
            }
        } catch (error) {
            console.error("Error fetching goals server-side:", error);
            // Optionally handle error display
        }
    }
    // --- End Fetch Goals ---

    // Define itemDetail for 'task' locally for server-side use
    const taskItemDetail: CreatableItemDetail = {
        key: "task",
        title: "Task",
        description: "",
        // icon property is now omitted
        moduleHandle: "tasks",
        createFeatureHandle: "create",
    };

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/tasks`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Tasks
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Create New Task</h1>
            </div>
            {/* Pass fetched goals to TaskForm */}
            <TaskForm
                user={user as UserPrivate} // Pass user
                itemDetail={taskItemDetail} // Pass locally defined itemDetail for task
                initialSelectedCircleId={circle._id} // Pass initialSelectedCircleId
                // goals and goalsModuleEnabled are now handled within TaskForm based on selectedCircle
                // goals={goals} // This will be fetched by TaskForm
                // goalsModuleEnabled={goalsModuleEnabled} // This will be determined by TaskForm
            />
        </div>
    );
}
