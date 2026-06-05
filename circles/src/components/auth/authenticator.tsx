// authenticator.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { checkAuth } from "./actions";
import { userAtom, authInfoAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export const Authenticator = () => {
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);
    const [, setUser] = useAtom(userAtom);
    // Add a state to track initialization status
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.Authenticator.1");
        }

        // print current app version
        console.log(
            "%c🔵 Circles Version " + process.env.version + " 🔵%c",
            "background: #4A90E2; color: white; padding: 2px 4px; border-radius: 3px;",
            "background: none; color: #4A90E2; font-weight: bold;",
        );

        // Add this to ensure initialization on first load
        if (!isInitialized) {
            setIsInitialized(true);
            // Add a cache buster parameter to prevent stale data
            localStorage.setItem("cache_buster", Date.now().toString());
        }
    }, [isInitialized]);

    const checkAuthentication = useCallback(async () => {
        console.log("checkAuthentication: checkAuth");
        const response = await checkAuth();
        if (response.authenticated) {
            console.log("checkAuthentication: checkAuth responded authenticated");
            setAuthInfo({ authStatus: "authenticated" });
            setUser(response.user);
        } else {
            console.log("checkAuthentication: checkAuth responded unauthenticated");
            setAuthInfo({ authStatus: "unauthenticated" });
            setUser(undefined);
        }
    }, [setAuthInfo, setUser]);

    useEffect(() => {
        // Run checkAuthentication with a slight delay to ensure components have initialized
        const timeoutId = setTimeout(() => {
            checkAuthentication();
        }, 50);
        return () => clearTimeout(timeoutId);
    }, [checkAuthentication]);

    switch (authInfo.authStatus) {
        default:
        case "authenticated":
            return null;
    }
};
