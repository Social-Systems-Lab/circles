// matrix-sync.tsx
"use client";

import { latestMessagesAtom, unreadCountsAtom, userAtom } from "@/lib/data/atoms";
import { startSync } from "@/lib/data/client-matrix";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";

export const MatrixSync = () => {
    const [user, setUser] = useAtom(userAtom);
    const [unreadCounts, setUnreadCounts] = useAtom(unreadCountsAtom);
    const [latestMessages, setLatestMessages] = useAtom(latestMessagesAtom);

    useEffect(() => {
        const storedUnreadCounts = localStorage.getItem("unreadCounts");
        const storedLatestMessages = localStorage.getItem("latestMessages");
        if (storedUnreadCounts) setUnreadCounts(JSON.parse(storedUnreadCounts));
        if (storedLatestMessages) setLatestMessages(JSON.parse(storedLatestMessages));
    }, [setLatestMessages, setUnreadCounts]);

    useEffect(() => {
        localStorage.setItem("unreadCounts", JSON.stringify(unreadCounts));
    }, [unreadCounts]);

    useEffect(() => {
        localStorage.setItem("latestMessages", JSON.stringify(latestMessages));
    }, [latestMessages]);

    useEffect(() => {
        if (!user?.matrixAccessToken) return;

        console.log("Starting matrix sync");

        const handleSyncData = (data: {
            unreadCounts: Record<string, number>;
            latestMessages: Record<string, any>;
        }) => {
            console.log("Sync data", data);
            setUnreadCounts((prevUnreadCounts) => ({
                ...prevUnreadCounts,
                ...data.unreadCounts,
            }));
            setLatestMessages((prevLatestMessages) => ({
                ...prevLatestMessages,
                ...data.latestMessages,
            }));
        };

        startSync(user.matrixAccessToken, handleSyncData);

        return () => {
            // TODO cleanup sync process if needed
        };
    }, [setLatestMessages, setUnreadCounts, user?.matrixAccessToken]);

    return null;
};
