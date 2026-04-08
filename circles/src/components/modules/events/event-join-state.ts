import type { EventDisplay } from "@/models/models";

export const EVENT_JOIN_OPEN_MINUTES = 15;
const DEFAULT_JOIN_WINDOW_AFTER_START_MS = 2 * 60 * 60 * 1000;

export type EventJoinState = {
    href?: string;
    isEnabled: boolean;
    isMissingLink: boolean;
    label: string;
    title: string;
};

type GetEventJoinStateOptions = {
    canManageMissingLink?: boolean;
    missingLinkLabel?: string;
    now?: Date;
};

export function getEventJoinState(
    event: EventDisplay,
    {
        canManageMissingLink = false,
        missingLinkLabel = "Missing link",
        now = new Date(),
    }: GetEventJoinStateOptions = {},
): EventJoinState | null {
    if (!event.isVirtual) {
        return null;
    }

    const href = event.virtualUrl?.trim();
    const start = event.startAt ? new Date(event.startAt as any) : null;
    const end = event.endAt ? new Date(event.endAt as any) : null;

    if (!href) {
        if (!canManageMissingLink) {
            return null;
        }

        return {
            isEnabled: false,
            isMissingLink: true,
            label: missingLinkLabel,
            title: "Add a join link to this online event.",
        };
    }

    if (event.stage === "cancelled") {
        return {
            href,
            isEnabled: false,
            isMissingLink: false,
            label: "Join",
            title: "This event has been cancelled.",
        };
    }

    if (!start || Number.isNaN(start.getTime())) {
        return {
            href,
            isEnabled: true,
            isMissingLink: false,
            label: "Join",
            title: "Join event",
        };
    }

    const activationTime = start.getTime() - EVENT_JOIN_OPEN_MINUTES * 60 * 1000;
    const endTime = end && !Number.isNaN(end.getTime()) ? end.getTime() : start.getTime() + DEFAULT_JOIN_WINDOW_AFTER_START_MS;
    const nowTime = now.getTime();

    if (nowTime < activationTime) {
        return {
            href,
            isEnabled: false,
            isMissingLink: false,
            label: "Join",
            title: `Available ${EVENT_JOIN_OPEN_MINUTES} minutes before start`,
        };
    }

    if (nowTime > endTime) {
        return {
            href,
            isEnabled: false,
            isMissingLink: false,
            label: "Join",
            title: "This event has ended.",
        };
    }

    return {
        href,
        isEnabled: true,
        isMissingLink: false,
        label: "Join",
        title: "Join event",
    };
}
