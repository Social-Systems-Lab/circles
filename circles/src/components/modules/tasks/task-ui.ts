import { TaskPriority, TaskStage } from "@/models/models";
import { CheckCircle, Clock, Loader2, Play } from "lucide-react";
import type { ShiftDisplayStatus } from "./shift-task-utils";

export const taskPriorityLabels: Record<TaskPriority, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
};

export const taskPriorityBadgeClasses: Record<TaskPriority, string> = {
    critical:
        "border-transparent bg-[hsl(var(--task-priority-critical-bg))] text-[hsl(var(--task-priority-critical-foreground))]",
    high: "border-transparent bg-[hsl(var(--task-priority-high-bg))] text-[hsl(var(--task-priority-high-foreground))]",
    medium: "border-transparent bg-[hsl(var(--task-priority-medium-bg))] text-[hsl(var(--task-priority-medium-foreground))]",
    low: "border-transparent bg-[hsl(var(--task-priority-low-bg))] text-[hsl(var(--task-priority-low-foreground))]",
};

export const taskTitleLinkClassName =
    "font-medium text-[hsl(var(--task-link))] underline-offset-2 hover:text-[hsl(var(--task-link-hover))] hover:underline";

export const getTaskPriorityInfo = (priority?: TaskPriority) => {
    if (!priority) {
        return { label: "No Priority", badgeClassName: "border-transparent bg-slate-100 text-slate-700" };
    }

    return {
        label: taskPriorityLabels[priority],
        badgeClassName: taskPriorityBadgeClasses[priority],
    };
};

export const getTaskWorkflowStatusBadge = (task: {
    verifiedAt?: Date | string | null;
    submittedForReviewAt?: Date | string | null;
    reviewRequestedChangesAt?: Date | string | null;
}) => {
    if (task.verifiedAt) {
        return {
            label: "Verified",
            className:
                "border-transparent bg-[hsl(var(--task-verified-bg))] text-[hsl(var(--task-verified-foreground))]",
        };
    }

    if (task.submittedForReviewAt) {
        return { label: "Review Requested", className: "bg-amber-100 text-amber-800" };
    }

    if (task.reviewRequestedChangesAt) {
        return { label: "Changes Requested", className: "bg-rose-100 text-rose-800" };
    }

    return null;
};

export const getTaskStageInfo = (stage: TaskStage) => {
    switch (stage) {
        case "review":
            return {
                color: "bg-[hsl(var(--task-stage-review-bg))] text-[hsl(var(--task-stage-review-foreground))]",
                icon: Clock,
                text: "Review",
            };
        case "open":
            return {
                color: "bg-[hsl(var(--task-stage-open-bg))] text-[hsl(var(--task-stage-open-foreground))]",
                icon: Play,
                text: "Open",
            };
        case "inProgress":
            return {
                color: "bg-[hsl(var(--task-stage-progress-bg))] text-[hsl(var(--task-stage-progress-foreground))]",
                icon: Loader2,
                text: "In Progress",
            };
        case "resolved":
            return {
                color: "bg-[hsl(var(--task-stage-resolved-bg))] text-[hsl(var(--task-stage-resolved-foreground))]",
                icon: CheckCircle,
                text: "Resolved",
            };
        default:
            return { color: "bg-gray-200 text-gray-800", icon: Clock, text: "Unknown" };
    }
};

export const getShiftStageInfo = (status: ShiftDisplayStatus) => {
    switch (status) {
        case "review":
            return getTaskStageInfo("review");
        case "upcoming":
            return {
                color: "bg-[hsl(var(--task-stage-upcoming-bg))] text-[hsl(var(--task-stage-upcoming-foreground))]",
                icon: Clock,
                text: "Upcoming",
            };
        case "inProgress":
            return {
                color: "bg-[hsl(var(--task-stage-progress-bg))] text-[hsl(var(--task-stage-progress-foreground))]",
                icon: Loader2,
                text: "In Progress",
            };
        case "completed":
            return {
                color: "bg-[hsl(var(--task-stage-resolved-bg))] text-[hsl(var(--task-stage-resolved-foreground))]",
                icon: CheckCircle,
                text: "Completed",
            };
        default:
            return getTaskStageInfo("open");
    }
};
