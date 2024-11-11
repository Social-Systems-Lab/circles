"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { checkAuth } from "./actions";
import { useThrottle } from "../utils/use-throttle";
import { userAtom, authenticatedAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

declare global {
    interface Window {
        CIRCLES_USER_DATA?: any; // Specify type as string or any appropriate type
        onUserDataReceived?: (data: string) => void;
    }
}

export const Authenticator = () => {
    const [, setAuthenticated] = useAtom(authenticatedAtom);
    const [, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();

    const [circleAppData, setCircleAppData] = useState<any | undefined>(undefined);

    const checkAuthStatus = useCallback(async () => {
        startTransition(async () => {
            const { user, authenticated: authStatus } = await checkAuth();
            setAuthenticated(authStatus);
            setUser(user);
        });
    }, [setUser, setAuthenticated]);

    const throttledCheckAuth = useThrottle(checkAuthStatus, 500);

    useEffect(() => {
        if (window.CIRCLES_USER_DATA) {
            // Process the data as soon as it’s available
            console.log("Circles User Data received from WebView:", window.CIRCLES_USER_DATA);
            setCircleAppData(window.CIRCLES_USER_DATA);
            try {
                // attempt to parse the data
                const userData = JSON.parse(window.CIRCLES_USER_DATA);
                console.log("Circles User Data parsed from WebView:", userData);
            } catch (error) {
                console.error("Error parsing user data from WebView:", error);
            }

            // Trigger your authentication or setup functions with userData
            //authenticateUser(userData);
        }

        // // Optionally, define a callback that will be called from WebView injection
        // window.onUserDataReceived = (data) => {
        //     const userData = JSON.parse(data);
        //     console.log("User Data received via callback:", userData);
        //     authenticateUser(userData);
        // };
    }, []);

    useEffect(() => {
        throttledCheckAuth();
    }, [throttledCheckAuth]);

    if (circleAppData) {
        return <div className="t-0 l-0 absolute h-6 w-screen bg-purple-400">{circleAppData?.name}</div>;
    }

    return null;
};
