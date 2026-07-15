import type { EventDisplay } from "@/models/models";

type EventRouteCircle = {
    id?: string | null;
    handle?: string | null;
};

function toStringId(value: unknown): string | undefined {
    if (typeof value === "string") {
        return value;
    }
    const stringValue = (value as { toString?: () => string } | null | undefined)?.toString?.();
    return typeof stringValue === "string" && stringValue.length > 0 ? stringValue : undefined;
}

export function getEventHostCircleIds(event: Pick<EventDisplay, "circleId" | "hostCircleIds">): string[] {
    return Array.from(new Set([event.circleId, ...(event.hostCircleIds || [])].filter(Boolean)));
}

export function getEventRouteCircleHandle(
    event: Pick<EventDisplay, "circleId" | "hostCircleIds" | "circle">,
    currentCircle?: EventRouteCircle,
): string | undefined {
    const hostCircleIds = getEventHostCircleIds(event);
    const currentCircleId = currentCircle?.id || undefined;
    const currentCircleHandle = currentCircle?.handle || undefined;

    if (currentCircleId && currentCircleHandle && hostCircleIds.includes(currentCircleId)) {
        return currentCircleHandle;
    }

    const primaryCircleId = toStringId(event.circle?._id);
    const primaryCircleHandle = event.circle?.handle || undefined;
    if (
        primaryCircleHandle &&
        (!primaryCircleId || primaryCircleId === event.circleId || hostCircleIds.includes(primaryCircleId))
    ) {
        return primaryCircleHandle;
    }

    return undefined;
}

export function getEventDetailHref(
    event: Pick<EventDisplay, "_id" | "circleId" | "hostCircleIds" | "circle">,
    currentCircle?: EventRouteCircle,
): string | undefined {
    const eventId = toStringId((event as EventDisplay)._id);
    const circleHandle = getEventRouteCircleHandle(event, currentCircle);
    return eventId && circleHandle ? `/circles/${circleHandle}/events/${eventId}#circle-tabs` : undefined;
}
