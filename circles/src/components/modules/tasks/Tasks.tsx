"use server";

import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { getTasksAction } from "@/app/circles/[handle]/tasks/actions";
import { redirect } from "next/navigation";
import { Circle, TaskDisplay, TaskPermissions } from "@/models/models";
import TasksList from "./tasks-list";

type PageProps = {
    circle: Circle;
};

export default async function TasksModule({ circle }: PageProps) {
    // Renamed component
    // Get the current user DID
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        redirect("/login");
    }

    // Check if user has permission to view tasks
    const canViewTasks = await isAuthorized(userDid, circle._id as string, features.tasks.view); // Updated feature check
    if (!canViewTasks) {
        // Updated variable
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
                <p className="text-gray-600">You don&apos;t have permission to view tasks in this circle.</p>{" "}
                {/* Updated text & fixed apostrophe */}
            </div>
        );
    }

    // Get tasks for this circle
    const tasks: TaskDisplay[] = await getTasksAction(circle.handle as string); // Renamed function call, variable, type

    // Perform permission checks for different actions within the tasks module
    const canModerateTask = await isAuthorized(userDid, circle._id as string, features.tasks.moderate); // Renamed variable, updated feature
    const canReviewTask = await isAuthorized(userDid, circle._id as string, features.tasks.review); // Renamed variable, updated feature
    const canAssignTask = await isAuthorized(userDid, circle._id as string, features.tasks.assign); // Renamed variable, updated feature
    const canResolveTask = await isAuthorized(userDid, circle._id as string, features.tasks.resolve); // Renamed variable, updated feature
    const canCommentOnTask = await isAuthorized(userDid, circle._id as string, features.tasks.comment); // Renamed variable, updated feature

    // Filter tasks based on permissions (basic filtering, more in TasksList)
    // Example: Hide 'review' stage tasks if user cannot review/moderate
    const filteredTasks = tasks.filter((task) => {
        // Renamed variable, param
        if (task.author.did === userDid) return true; // Renamed param

        if (task.stage === "review" && !(canReviewTask || canModerateTask)) {
            // Renamed param, variables
            return false; // Hide review items if user lacks permission
        }
        // Add other permission-based filtering if needed (e.g., based on task.userGroups)
        // Visibility based on task.userGroups should ideally be handled in the data fetching (getTasksByCircleId)
        return true;
    });

    const permissions: TaskPermissions = {
        canModerate: canModerateTask,
        canReview: canReviewTask,
        canAssign: canAssignTask,
        canResolve: canResolveTask,
        canComment: canCommentOnTask,
    };

    return (
        <div className="flex w-full flex-col">
            <TasksList tasks={filteredTasks} circle={circle} permissions={permissions} />
        </div>
    );
}
