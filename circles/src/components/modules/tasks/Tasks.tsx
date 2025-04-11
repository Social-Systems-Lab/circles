// Tasks.tsx
"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
// Import the modified action
import { getTasksAction } from "@/app/circles/[handle]/tasks/actions";
import { redirect } from "next/navigation";
// TaskPermissions is still needed for passing down to TasksList
import { Circle, TaskPermissions } from "@/models/models";
import TasksList from "./tasks-list";

type PageProps = {
    circle: Circle;
};

export default async function TasksModule({ circle }: PageProps) {
    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    const circleId = circle._id as string; // Use consistent variable

    // Check if user has permission to view tasks
    const canViewTasks = await isAuthorized(userDid, circleId, features.tasks.view);
    if (!canViewTasks) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to view tasks in this circle.</p>
            </div>
        );
    }

    // --- Updated Data Fetching ---
    // Call the updated getTasksAction (no boolean argument needed)
    // It now returns an object with tasks and ranking stats
    const tasksData = await getTasksAction(circle.handle as string);

    // Perform permission checks needed by TasksList or for filtering here
    const canModerateTask = await isAuthorized(userDid, circleId, features.tasks.moderate);
    const canReviewTask = await isAuthorized(userDid, circleId, features.tasks.review);
    const canAssignTask = await isAuthorized(userDid, circleId, features.tasks.assign);
    const canResolveTask = await isAuthorized(userDid, circleId, features.tasks.resolve);
    const canCommentOnTask = await isAuthorized(userDid, circleId, features.tasks.comment);

    // --- Optional Filtering (Keep or Remove based on requirements) ---
    // Filter tasks based on permissions before passing to the list component
    // This example keeps the 'review' stage filtering
    const filteredTasksData = {
        ...tasksData, // Keep other stats like hasUserRanked, totalRankers, unrankedCount
        tasks: tasksData.tasks.filter((task) => {
            // Allow user to always see their own tasks
            if (task.author.did === userDid) return true;

            // Hide 'review' stage tasks if user cannot review or moderate
            if (task.stage === "review" && !(canReviewTask || canModerateTask)) {
                return false;
            }
            // Add other top-level filtering if needed
            return true;
        }),
    };

    // Prepare permissions object for TasksList
    const permissions: TaskPermissions = {
        canModerate: canModerateTask,
        canReview: canReviewTask,
        canAssign: canAssignTask,
        canResolve: canResolveTask,
        canComment: canCommentOnTask,
    };

    return (
        <div className="flex w-full flex-col">
            {/* Pass the potentially filtered tasksData object and permissions */}
            <TasksList tasksData={filteredTasksData} circle={circle} permissions={permissions} />
        </div>
    );
}
