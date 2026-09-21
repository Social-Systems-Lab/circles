import { describe, expect, test } from "bun:test";
import { CheckCircle, Clock, Loader2, Play } from "lucide-react";
import type { TaskPriority, TaskStage } from "@/models/models";
import {
    getShiftStageInfo,
    getTaskPriorityInfo,
    getTaskStageInfo,
    getTaskWorkflowStatusBadge,
    taskPriorityBadgeClasses,
    taskPriorityLabels,
    taskTitleLinkClassName,
} from "./task-ui";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

describe("taskPriorityLabels", () => {
    test("labels every priority", () => {
        expect(taskPriorityLabels).toEqual({ low: "Low", medium: "Medium", high: "High", critical: "Critical" });
    });
});

describe("taskPriorityBadgeClasses", () => {
    test.each(PRIORITIES)("styles %s with its own colour tokens on a transparent border", (priority) => {
        const classes = taskPriorityBadgeClasses[priority];

        expect(classes).toContain("border-transparent");
        expect(classes).toContain(`--task-priority-${priority}-bg`);
        expect(classes).toContain(`--task-priority-${priority}-foreground`);
    });

    test("uses a distinct style per priority", () => {
        expect(new Set(Object.values(taskPriorityBadgeClasses)).size).toBe(4);
    });
});

describe("taskTitleLinkClassName", () => {
    test("styles task titles as links that underline on hover", () => {
        expect(taskTitleLinkClassName).toContain("--task-link");
        expect(taskTitleLinkClassName).toContain("hover:underline");
    });
});

describe("getTaskPriorityInfo", () => {
    test.each(PRIORITIES)("returns the label and badge classes for %s", (priority) => {
        expect(getTaskPriorityInfo(priority)).toEqual({
            label: taskPriorityLabels[priority],
            badgeClassName: taskPriorityBadgeClasses[priority],
        });
    });

    test("returns a neutral 'No Priority' badge without a priority", () => {
        expect(getTaskPriorityInfo()).toEqual({ label: "No Priority", badgeClassName: "border-transparent bg-slate-100 text-slate-700" });
        expect(getTaskPriorityInfo(undefined)).toEqual(getTaskPriorityInfo());
    });

    test("returns an undefined label for an unknown priority", () => {
        expect(getTaskPriorityInfo("urgent" as TaskPriority)).toEqual({ label: undefined as never, badgeClassName: undefined as never });
    });
});

describe("getTaskWorkflowStatusBadge", () => {
    test("shows nothing for a task with no review activity", () => {
        expect(getTaskWorkflowStatusBadge({})).toBeNull();
        expect(getTaskWorkflowStatusBadge({ verifiedAt: null, submittedForReviewAt: null, reviewRequestedChangesAt: null })).toBeNull();
    });

    test("shows Verified for a verified task", () => {
        const badge = getTaskWorkflowStatusBadge({ verifiedAt: new Date() });

        expect(badge?.label).toBe("Verified");
        expect(badge?.className).toContain("--task-verified-bg");
    });

    test("shows Review Requested once submitted for review", () => {
        expect(getTaskWorkflowStatusBadge({ submittedForReviewAt: new Date() })).toEqual({
            label: "Review Requested",
            className: "bg-amber-100 text-amber-800",
        });
    });

    test("shows Changes Requested after a reviewer asked for changes", () => {
        expect(getTaskWorkflowStatusBadge({ reviewRequestedChangesAt: new Date() })).toEqual({
            label: "Changes Requested",
            className: "bg-rose-100 text-rose-800",
        });
    });

    test("accepts ISO strings as timestamps", () => {
        expect(getTaskWorkflowStatusBadge({ verifiedAt: "2026-06-15T12:00:00.000Z" })?.label).toBe("Verified");
    });

    test("prefers Verified over Review Requested over Changes Requested", () => {
        const all = { verifiedAt: new Date(), submittedForReviewAt: new Date(), reviewRequestedChangesAt: new Date() };

        expect(getTaskWorkflowStatusBadge(all)?.label).toBe("Verified");
        expect(getTaskWorkflowStatusBadge({ ...all, verifiedAt: null })?.label).toBe("Review Requested");
        expect(getTaskWorkflowStatusBadge({ ...all, verifiedAt: null, submittedForReviewAt: null })?.label).toBe("Changes Requested");
    });
});

describe("getTaskStageInfo", () => {
    test.each([
        ["review", "Review", Clock, "review"],
        ["open", "Open", Play, "open"],
        ["inProgress", "In Progress", Loader2, "progress"],
        ["resolved", "Resolved", CheckCircle, "resolved"],
    ] as const)("describes the %s stage", (stage, text, icon, token) => {
        const info = getTaskStageInfo(stage);

        expect(info.text).toBe(text);
        expect(info.icon).toBe(icon);
        expect(info.color).toContain(`--task-stage-${token}-bg`);
        expect(info.color).toContain(`--task-stage-${token}-foreground`);
    });

    test("falls back to a neutral Unknown badge", () => {
        expect(getTaskStageInfo("bogus" as TaskStage)).toEqual({ color: "bg-gray-200 text-gray-800", icon: Clock, text: "Unknown" });
    });
});

describe("getShiftStageInfo", () => {
    test("shows a shift in review like a task in review", () => {
        expect(getShiftStageInfo("review")).toEqual(getTaskStageInfo("review"));
    });

    test("describes an upcoming shift", () => {
        const info = getShiftStageInfo("upcoming");

        expect(info.text).toBe("Upcoming");
        expect(info.icon).toBe(Clock);
        expect(info.color).toContain("--task-stage-upcoming-bg");
    });

    test("shares the in-progress look with tasks", () => {
        expect(getShiftStageInfo("inProgress")).toEqual(getTaskStageInfo("inProgress"));
    });

    test("describes a completed shift with the resolved colours but its own wording", () => {
        const info = getShiftStageInfo("completed");

        expect(info.text).toBe("Completed");
        expect(info.icon).toBe(CheckCircle);
        expect(info.color).toBe(getTaskStageInfo("resolved").color);
    });

    test("falls back to the open task look for an unknown status", () => {
        expect(getShiftStageInfo("bogus" as never)).toEqual(getTaskStageInfo("open"));
    });
});
