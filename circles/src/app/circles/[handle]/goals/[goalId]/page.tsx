// circles/[handle]/goals/[goalId]/page.tsx
import { getCircleByHandle } from "@/lib/data/circle";
import { getGoalAction, ensureShadowPostForGoalAction } from "../actions"; // Use goal action, Added ensureShadowPostForGoalAction
import GoalDetail from "@/components/modules/goals/goal-detail"; // Use GoalDetail component
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";
// Import task fetching function and types
import { getTasksByGoalId } from "@/lib/data/task";
import { TaskDisplay, TaskPermissions, GoalPermissions } from "@/models/models"; // Added TaskDisplay, TaskPermissions

type PageProps = {
    params: Promise<{ handle: string; goalId: string }>;
};

export default async function GoalDetailPage(props: PageProps) {
    const params = await props.params;
    const circleHandle = params.handle;
    const goalId = params.goalId;

    if (!ObjectId.isValid(goalId)) {
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

    // Get the goal
    const goal = await getGoalAction(circleHandle, goalId);
    if (!goal) {
        // Goal not found or user not authorized
        return (
            <div className="formatted flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Goal Not Found</h2>
                <p className="text-gray-600">
                    The goal you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
                </p>
                <Button asChild className="mt-4">
                    <Link href={`/circles/${circleHandle}/goals`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goals
                    </Link>
                </Button>
            </div>
        );
    }

    // Ensure shadow post exists for comments
    if (!goal.commentPostId) {
        console.log(`Goal ${goalId} missing commentPostId, attempting to ensure shadow post...`);
        const ensuredPostId = await ensureShadowPostForGoalAction(goalId, circle._id as string);
        if (ensuredPostId) {
            goal.commentPostId = ensuredPostId; // Update the goal object in memory
            console.log(`Successfully ensured shadow post ${ensuredPostId} for goal ${goalId}`);
        } else {
            console.error(`Failed to ensure shadow post for goal ${goalId}`);
            // Continue rendering without comments enabled for this goal
        }
    }

    // Fetch detailed GOAL permissions
    const goalPermissions: GoalPermissions = {
        canModerate: await isAuthorized(userDid, circle._id as string, features.goals.moderate),
        canReview: await isAuthorized(userDid, circle._id as string, features.goals.review),
        canResolve: await isAuthorized(userDid, circle._id as string, features.goals.resolve),
        canComment: await isAuthorized(userDid, circle._id as string, features.goals.comment),
        canCreateTask: await isAuthorized(userDid, circle._id as string, features.tasks.create),
    };

    // --- Fetch Linked Tasks and TASK Permissions (Server-Side) ---
    let linkedTasks: TaskDisplay[] = [];
    let taskPermissions: TaskPermissions | null = null;
    const tasksModuleEnabled = circle.enabledModules?.includes("tasks") || false;
    const canViewTasks = tasksModuleEnabled && (await isAuthorized(userDid, circle._id as string, features.tasks.view));

    if (canViewTasks) {
        try {
            // Fetch tasks linked to this specific goal
            linkedTasks = await getTasksByGoalId(goalId, circle._id as string);

            // Fetch detailed task permissions needed by TasksList/TaskDetail
            taskPermissions = {
                canModerate: await isAuthorized(userDid, circle._id as string, features.tasks.moderate),
                canReview: await isAuthorized(userDid, circle._id as string, features.tasks.review),
                canAssign: await isAuthorized(userDid, circle._id as string, features.tasks.assign),
                canResolve: await isAuthorized(userDid, circle._id as string, features.tasks.resolve),
                canComment: await isAuthorized(userDid, circle._id as string, features.tasks.comment),
                // Add other task permissions if needed by TasksList
            };
        } catch (error) {
            console.error("Error fetching linked tasks or permissions:", error);
            // Reset in case of error
            linkedTasks = [];
            taskPermissions = null;
        }
    }
    // --- End Fetch Linked Tasks ---

    return (
        <div className="formatted flex w-full flex-col">
            <div className="mb-4 flex items-center p-4">
                <Button asChild variant="ghost" className="mr-2">
                    <Link href={`/circles/${circleHandle}/goals`}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Goals
                    </Link>
                </Button>
            </div>

            <div className="mx-auto w-full max-w-4xl px-4">
                {/* Render GoalDetail component, passing fetched data */}
                <GoalDetail
                    goal={goal}
                    circle={circle}
                    permissions={goalPermissions} // Pass goal permissions
                    currentUserDid={userDid}
                    linkedTasks={linkedTasks} // Pass linked tasks
                    taskPermissions={taskPermissions} // Pass task permissions
                    tasksModuleEnabled={tasksModuleEnabled} // Pass flag
                    canViewTasks={canViewTasks} // Pass view permission flag
                />
            </div>
        </div>
    );
}
