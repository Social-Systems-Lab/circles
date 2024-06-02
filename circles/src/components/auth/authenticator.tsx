"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { checkAuth } from "./actions";
import { useThrottle } from "../utils/use-throttle";
import { userAtom, authenticatedAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

export const Authenticator = () => {
    const [, setAuthenticated] = useAtom(authenticatedAtom);
    const [, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();

    const checkAuthStatus = useCallback(async () => {
        startTransition(async () => {
            const { user, authenticated: authStatus } = await checkAuth();
            setAuthenticated(authStatus);
            setUser(user);
        });
    }, [setUser, setAuthenticated]);

    const throttledCheckAuth = useThrottle(checkAuthStatus, 500);

    useEffect(() => {
        throttledCheckAuth();
    }, [throttledCheckAuth]);

    return null;
};
