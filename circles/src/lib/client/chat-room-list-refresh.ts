import { buildConversationUnreadSnapshot } from "../chat/unread-counts";
import { addNotificationRefreshListener, type NotificationRefreshDetail } from "./notification-events";

export const CHAT_ROOM_REFRESH_INTERVAL_MS = 10_000;

type Room = { _id?: unknown; handle?: unknown; unreadCount?: number };
type RefreshReason = "routine" | "retry";

export type ChatRoomListSnapshot<T> = {
    status: "loading" | "ready" | "error";
    rooms: T[];
    unreadCounts: Record<string, number>;
    pendingRoomChanges?: boolean;
};

export function createChatRoomListRefresh<T extends Room>({
    key,
    pendingLists,
    load,
    now = Date.now,
    canRefresh = () => true,
    onError,
    onSessionChanged,
}: {
    key: string;
    pendingLists: Map<string, Promise<void>>;
    load: () => Promise<{ success: boolean; rooms?: T[]; sessionChanged?: true }>;
    now?: () => number;
    canRefresh?: () => boolean;
    onError?: (error: unknown) => void;
    onSessionChanged?: () => void;
}) {
    let snapshot: ChatRoomListSnapshot<T> = { status: "loading", rooms: [], unreadCounts: {} };
    const listeners = new Set<() => void>();
    const unreadUpdates = new Map<string, { count: number; version: number }>();
    const readInvalidations = new Map<string, number>();
    let version = 0;
    let lastAcceptedListVersion = 0;
    let active = false;
    let lastStarted = -Infinity;
    let followUp = false;
    let inFlight: Promise<void> | undefined;
    const changedRooms = new Set<string>();

    const publish = (next: ChatRoomListSnapshot<T>) => {
        snapshot = next;
        listeners.forEach((listener) => listener());
    };

    const accept = (responseRooms: T[], requestVersion: number) => {
        const rooms = responseRooms.filter((room) => !changedRooms.has(String(room._id || room.handle || "")));
        const unreadCounts = buildConversationUnreadSnapshot(rooms);
        for (const roomId of Object.keys(unreadCounts)) {
            if ((readInvalidations.get(roomId) ?? 0) > requestVersion && Object.hasOwn(snapshot.unreadCounts, roomId)) {
                unreadCounts[roomId] = snapshot.unreadCounts[roomId];
            }
        }
        for (const [roomId, update] of unreadUpdates) {
            if (update.version > requestVersion && Object.hasOwn(unreadCounts, roomId)) {
                unreadCounts[roomId] = update.count;
            } else {
                unreadUpdates.delete(roomId);
            }
        }
        for (const [roomId, invalidatedAt] of readInvalidations) {
            if (invalidatedAt <= requestVersion) readInvalidations.delete(roomId);
        }
        lastAcceptedListVersion = requestVersion;
        publish({ status: "ready", rooms, unreadCounts, pendingRoomChanges: changedRooms.size > 0 });
    };

    const refresh = (reason: RefreshReason = "routine"): Promise<void> => {
        if (!active || !canRefresh()) return Promise.resolve();
        if (inFlight) return inFlight;
        if (reason === "routine" && now() - lastStarted < CHAT_ROOM_REFRESH_INTERVAL_MS) return Promise.resolve();

        // An earlier session for this DID may still have a request on the wire after logout.
        const previous = pendingLists.get(key);
        lastStarted = now();
        const request = Promise.resolve().then(async () => {
            try {
                if (previous) {
                    await previous;
                    lastStarted = now();
                }
                while (active && canRefresh()) {
                    followUp = false;
                    changedRooms.clear();
                    const requestVersion = ++version;
                    try {
                        const result = await load();
                        if (!active) break;
                        if (result.sessionChanged) {
                            publish({ status: "error", rooms: [], unreadCounts: {} });
                            onSessionChanged?.();
                            break;
                        }
                        if (result.success && result.rooms) accept(result.rooms, requestVersion);
                        else if (snapshot.status === "loading") publish({ ...snapshot, status: "error" });
                    } catch (error) {
                        if (active) {
                            if (snapshot.status === "loading") publish({ ...snapshot, status: "error" });
                            onError?.(error);
                        }
                    }
                    if (!followUp) break;
                    lastStarted = now();
                }
            } finally {
                inFlight = undefined;
                if (pendingLists.get(key) === request) pendingLists.delete(key);
            }
        });
        inFlight = request;
        pendingLists.set(key, request);
        return request;
    };

    return {
        refresh,
        invalidate: ({ reason, roomId }: NotificationRefreshDetail) => {
            if (!active) return Promise.resolve();
            if (roomId && reason === "chat-read") readInvalidations.set(roomId, ++version);
            if (inFlight) {
                if (roomId && reason === "chat-rooms-changed") changedRooms.add(roomId);
                followUp = true;
                return inFlight;
            }
            return refresh("retry");
        },
        activate: () => {
            active = true;
            return () => {
                active = false;
                followUp = false;
            };
        },
        beginUnreadUpdate: (roomId: string) => {
            const requestVersion = ++version;
            return (count: number) => {
                if (
                    !active ||
                    requestVersion <=
                        Math.max(
                            lastAcceptedListVersion,
                            unreadUpdates.get(roomId)?.version ?? 0,
                            readInvalidations.get(roomId) ?? 0,
                        )
                )
                    return;
                unreadUpdates.set(roomId, { count, version: requestVersion });
                if (Object.hasOwn(snapshot.unreadCounts, roomId)) {
                    publish({ ...snapshot, unreadCounts: { ...snapshot.unreadCounts, [roomId]: count } });
                }
            };
        },
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

export function watchChatRoomList(
    list: Pick<ReturnType<typeof createChatRoomListRefresh>, "activate" | "refresh" | "invalidate">,
) {
    const deactivate = list.activate();
    let wasHidden = false;
    const refreshVisible = () => {
        if (document.visibilityState !== "visible") {
            wasHidden = true;
            return;
        }
        void list.refresh(wasHidden ? "retry" : "routine");
        wasHidden = false;
    };
    refreshVisible();
    const interval = window.setInterval(refreshVisible, CHAT_ROOM_REFRESH_INTERVAL_MS);
    const removeRefreshListener = addNotificationRefreshListener(({ detail }) => {
        const reason = detail?.reason;
        if (reason === "chat-read" || reason === "chat-sent" || reason === "chat-rooms-changed") {
            void list.invalidate(detail);
        } else if (reason === "app-visible") {
            refreshVisible();
        }
    });
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
        deactivate();
        window.clearInterval(interval);
        removeRefreshListener();
        window.removeEventListener("focus", refreshVisible);
        document.removeEventListener("visibilitychange", refreshVisible);
    };
}
