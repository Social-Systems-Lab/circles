"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { userAtom, unreadCountsAtom } from "@/lib/data/atoms";
import { listChatRoomsAction } from "./actions";
import { addNotificationRefreshListener } from "@/lib/client/notification-events";
import { createLatestAsyncRunner } from "@/lib/client/latest-async-runner";
import { buildConversationUnreadSnapshot } from "@/lib/chat/unread-counts";

export const BackgroundMessagePoller = () => {
    const [user] = useAtom(userAtom);
    const [, setUnreadCounts] = useAtom(unreadCountsAtom);
    const runner = useMemo(
        () =>
            createLatestAsyncRunner({
                load: async () => {
                    if (!user?.did) return { success: true, rooms: [] };
                    return listChatRoomsAction();
                },
                apply: (result) => {
                    if (!result.success || !result.rooms) return;
                    setUnreadCounts(buildConversationUnreadSnapshot(result.rooms));
                },
                onError: (error) => console.error("Failed to refresh message unread counts:", error),
            }),
        [setUnreadCounts, user?.did],
    );
    const refresh = useCallback(async () => runner.run(), [runner]);

    useEffect(() => () => runner.cancel(), [runner]);

    useEffect(() => {
        void refresh();
        if (!user?.did) return;

        const intervalId = window.setInterval(() => void refresh(), 3000);
        const removeRefreshListener = addNotificationRefreshListener(() => void refresh());
        const handleVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", handleVisible);
        return () => {
            window.clearInterval(intervalId);
            removeRefreshListener();
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", handleVisible);
        };
    }, [refresh, user?.did]);

    return null;
};
