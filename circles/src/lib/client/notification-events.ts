"use client";

export const KAMOONI_NOTIFICATIONS_CHANGED_EVENT = "kamooni:notifications-changed";

export type NotificationRefreshReason =
    | "notification-read"
    | "notifications-read"
    | "notifications-cleared"
    | "pm-notifications-read"
    | "notifications-opened"
    | "chat-read"
    | "chat-sent"
    | "app-visible";

export type NotificationRefreshDetail = {
    reason?: NotificationRefreshReason;
    roomId?: string;
};

const getWindow = (): Window | null => (typeof window === "undefined" ? null : window);

export const dispatchNotificationRefresh = (detail: NotificationRefreshDetail = {}) => {
    const target = getWindow();
    if (!target) return;

    target.dispatchEvent(new CustomEvent<NotificationRefreshDetail>(KAMOONI_NOTIFICATIONS_CHANGED_EVENT, { detail }));
};

export const dispatchNotificationRefreshIfOk = (
    response: Pick<Response, "ok">,
    detail: NotificationRefreshDetail = {},
): boolean => {
    if (!response.ok) return false;

    dispatchNotificationRefresh(detail);
    return true;
};

export const addNotificationRefreshListener = (
    listener: (event: CustomEvent<NotificationRefreshDetail>) => void,
): (() => void) => {
    const target = getWindow();
    if (!target) return () => {};

    const wrappedListener = listener as EventListener;
    target.addEventListener(KAMOONI_NOTIFICATIONS_CHANGED_EVENT, wrappedListener);
    return () => target.removeEventListener(KAMOONI_NOTIFICATIONS_CHANGED_EVENT, wrappedListener);
};
