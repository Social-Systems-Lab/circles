import type { Circle } from "@/models/models";

export type EventHostCircleOption = Circle & {
    canCreateEvents: boolean;
    canPublishEvents: boolean;
};

export type EventCreationCapability = "unavailable" | "draft-or-review" | "draft-or-publish";
export type EventSubmitStage = "draft" | "review" | "open" | "preserve";

export function parseEventSubmitStage(value: unknown): EventSubmitStage {
    if (value === "preserve") return "preserve";
    if (value === "review") return "review";
    return value === "open" ? "open" : "draft";
}

export function resolveEventCreationCapability(
    selectedHostCircleIds: string[],
    hostCircles: Pick<EventHostCircleOption, "_id" | "canCreateEvents" | "canPublishEvents">[],
): EventCreationCapability {
    const selectedIds = Array.from(new Set(selectedHostCircleIds.filter(Boolean)));
    if (selectedIds.length === 0) return "unavailable";

    const capabilityByCircleId = new Map(hostCircles.map((circle) => [circle._id?.toString(), circle]));
    const selectedHosts = selectedIds.map((circleId) => capabilityByCircleId.get(circleId));
    if (selectedHosts.some((circle) => !circle?.canCreateEvents)) return "unavailable";
    return selectedHosts.every((circle) => circle?.canPublishEvents) ? "draft-or-publish" : "draft-or-review";
}
