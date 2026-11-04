import type { Circle, CircleModerationStatus } from "@/models/models";

export const circleModerationTransitions: Record<CircleModerationStatus, readonly CircleModerationStatus[]> = {
    active: ["paused", "suspended", "removed"],
    paused: ["active", "suspended", "removed"],
    suspended: ["active", "removed"],
    removed: [],
};

export const getCircleModerationStatus = (circle?: Partial<Circle> | null): CircleModerationStatus =>
    circle?.moderationStatus ?? "active";
