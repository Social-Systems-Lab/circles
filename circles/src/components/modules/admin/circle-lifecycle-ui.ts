import type { Circle, CircleModerationStatus } from "@/models/models";
import { circleModerationTransitions, getCircleModerationStatus } from "@/lib/data/circle-lifecycle-rules";

export type CircleLifecycleTransition = {
    status: CircleModerationStatus;
    label: string;
};

const transitionLabels: Record<CircleModerationStatus, string> = {
    active: "Reactivate",
    paused: "Pause",
    suspended: "Suspend",
    removed: "Remove",
};

const lifecycleStatusBadgeClassNames: Record<CircleModerationStatus, string> = {
    active: "border-green-300 bg-green-100 text-green-900",
    paused: "border-amber-300 bg-amber-100 text-amber-900",
    suspended: "border-red-300 bg-red-100 text-red-900",
    removed: "border-slate-700 bg-slate-700 text-white",
};

export const getCircleLifecycleStatus = (circle: Partial<Circle>) => getCircleModerationStatus(circle);

export const getCircleLifecycleStatusLabel = (circle: Partial<Circle>) => {
    const status = getCircleLifecycleStatus(circle);
    return status.charAt(0).toUpperCase() + status.slice(1);
};

export const getCircleLifecycleStatusBadgeClassName = (circle: Partial<Circle>) =>
    lifecycleStatusBadgeClassNames[getCircleLifecycleStatus(circle)];

export const getCircleLifecycleTransitions = (circle: Partial<Circle>): CircleLifecycleTransition[] =>
    circleModerationTransitions[getCircleLifecycleStatus(circle)].map((status) => ({
        status,
        label: transitionLabels[status],
    }));

export async function submitCircleLifecycleChange<T>(
    action: (circleId: string, status: CircleModerationStatus, reason: string) => Promise<T>,
    circleId: string,
    status: CircleModerationStatus,
    reason: string,
) {
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error("A moderation reason is required.");
    return action(circleId, status, trimmedReason);
}
