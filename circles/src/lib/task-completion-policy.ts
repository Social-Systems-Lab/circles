import type { TaskDisplay } from "@/models/models";

export type OutcomeTaskCompletionPermissions = {
    isAuthor: boolean;
    canAssign: boolean;
    canResolve: boolean;
    canModerate: boolean;
};

export type OutcomeTaskCompletionPlan =
    | { allowed: true; mode: "assigned-verification" | "unassigned-operational-completion" | "already-completed" }
    | { allowed: false; reason: string };

export const buildOutcomeTaskCompletionUpdate = (verifiedBy: string, verifiedAt: Date) => ({
    stage: "resolved" as const,
    resolvedAt: verifiedAt,
    verifiedAt,
    verifiedBy,
});

export const getOutcomeTaskCompletionPlan = (
    task: Pick<TaskDisplay, "assignedTo" | "stage" | "submittedForReviewAt" | "taskType" | "verifiedAt">,
    permissions: OutcomeTaskCompletionPermissions,
): OutcomeTaskCompletionPlan => {
    if ((task.taskType ?? "outcome") === "shift") {
        return { allowed: false, reason: "Shift tasks are verified per participant" };
    }

    const canManageAssignedReview =
        permissions.isAuthor || permissions.canAssign || permissions.canResolve || permissions.canModerate;
    const canOperationallyCompleteUnassigned =
        permissions.canAssign || permissions.canResolve || permissions.canModerate;

    if (!task.assignedTo) {
        if (!canOperationallyCompleteUnassigned) {
            return { allowed: false, reason: "Not authorized to complete this task" };
        }

        if (task.stage === "resolved" && task.verifiedAt) {
            return { allowed: true, mode: "already-completed" };
        }

        if (task.stage !== "open" && task.stage !== "inProgress") {
            return { allowed: false, reason: "Only active unassigned tasks can be marked complete" };
        }

        return { allowed: true, mode: "unassigned-operational-completion" };
    }

    if (!canManageAssignedReview) {
        return { allowed: false, reason: "Not authorized to verify this task" };
    }

    if (task.stage === "resolved" && task.verifiedAt) {
        return { allowed: true, mode: "already-completed" };
    }

    if (task.stage !== "inProgress" || !task.submittedForReviewAt) {
        return { allowed: false, reason: "Task must be submitted for review before it can be verified" };
    }

    return { allowed: true, mode: "assigned-verification" };
};
