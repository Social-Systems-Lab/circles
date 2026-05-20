import { TaskPriority } from "@/models/models";

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
