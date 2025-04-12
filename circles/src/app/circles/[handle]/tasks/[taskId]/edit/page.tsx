// circles/[handle]/tasks/[taskId]/edit/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { getTaskById } from "@/lib/data/task"; // Use task data function
import { TaskForm } from "@/components/modules/tasks/task-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
// Import the goals action
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { GoalDisplay } from "@/models/models"; // Import GoalDisplay type

type PageProps = {
    params: Promise<{ handle: string; taskId: string }>;
};

export default async function EditTaskPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const taskId = params.taskId;

    if (!ObjectId.isValid(taskId)) {
        notFound();
    }

    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const circle = await getCircleByHandle(circleHandle);
    if (!circle) {
        notFound();
    }

    // Fetch task (ensure getTaskById is updated later to include goal)
    const task = await getTaskById(taskId, userDid); // Pass userDid for potential future checks
    if (!task) {
        notFound();
    }

    // Check permissions (simplified check, adjust as needed)
    const isAuthor = userDid === task.createdBy;
    const canModerate = await isAuthorized(userDid, circle._id as string, features.tasks.moderate);
    const canEdit = (isAuthor && task.stage === "review") || (canModerate && task.stage !== "resolved");

    if (!canEdit) {
        // ... (Access Denied JSX remains the same)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to edit this task at its current stage.</p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/tasks/${taskId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Task
                    </Link>
                </Button>
            </div>
        );
    }

    // --- Fetch Goals Server-Side ---
    let goals: GoalDisplay[] = [];
    const goalsModuleEnabled = circle.enabledModules?.includes("goals");
    if (goalsModuleEnabled) {
        try {
            const result = await getGoalsAction(circleHandle);
            if (result.goals) {
                goals = result.goals;
            } else {
                console.error("Failed to fetch goals server-side:");
            }
        } catch (error) {
            console.error("Error fetching goals server-side:", error);
        }
    }
    // --- End Fetch Goals ---

    return (
        <div className="formatted flex h-full w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/tasks/${taskId}`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Task
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold">Edit Task</h1>
            </div>
            {/* Pass fetched goals and task to TaskForm */}
            <TaskForm
                circle={circle}
                circleHandle={circleHandle}
                task={task}
                taskId={task._id} // Pass string ID
                goals={goals} // Pass goals prop
                goalsModuleEnabled={goalsModuleEnabled} // Pass flag
            />
        </div>
    );
}
