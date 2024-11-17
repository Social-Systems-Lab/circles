// authenticator.tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { checkAuth, verifySignature } from "./actions";
import { useThrottle } from "../utils/use-throttle";
import { userAtom, authenticatedAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

declare global {
    interface Window {
        CIRCLES_USER_DATA?: any;
        onUserDataReceived?: (data: any) => void;
        onSignedChallengeReceived?: (data: any) => void;

        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
    }
}

export const Authenticator = () => {
    const [, setAuthenticated] = useAtom(authenticatedAtom);
    const [, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();

    const [circleAppData, setCircleAppData] = useState<any | undefined>(undefined);

    // const checkAuthStatus = useCallback(async () => {
    //     startTransition(async () => {
    //         const { user, authenticated: authStatus } = await checkAuth();
    //         setAuthenticated(authStatus);
    //         setUser(user);
    //     });
    // }, [setUser, setAuthenticated]);

    // const throttledCheckAuth = useThrottle(checkAuthStatus, 500);

    const handleAuthentication = useCallback(
        async (userData: any) => {
            // authenticate user with public key
            const response = await checkAuth(userData.publicKey);
            if (response.authenticated) {
                setAuthenticated(true);
                setUser(response.user);
            } else if (response.challenge) {
                // Send challenge to native app for signing
                window.ReactNativeWebView?.postMessage(
                    JSON.stringify({
                        type: "SignChallenge",
                        challenge: response.challenge,
                        permissions: ["name", "profilePicture"], // Specify needed permissions here
                    }),
                );
            }
        },
        [setAuthenticated, setUser],
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const isWebView = window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function";
        if (!isWebView) return;

        window.onUserDataReceived = (data: any) => {
            console.log("User Data received via callback:", data);
            setCircleAppData(data);
            handleAuthentication(data);
        };

        window.onSignedChallengeReceived = async (signedData: any) => {
            console.log("Signed Challenge received via callback:", signedData);
            const response = await verifySignature(signedData.publicKey, signedData.signature, signedData.userData);
            if (response.authenticated) {
                setAuthenticated(true);
                setUser(response.user);
            } else {
                console.error("Failed to authenticate user", response.message);
            }
        };
    }, [handleAuthentication, setAuthenticated, setUser]);

    // useEffect(() => {
    //     if (typeof window !== "undefined") {
    //         const isWebView = window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function";

    //         if (isWebView) {
    //             // Define the callback that will be called by the injected JavaScript
    //             window.onUserDataReceived = (data: any) => {
    //                 console.log("User Data received via callback:", data);
    //                 try {
    //                     setCircleAppData(data);
    //                     // You can also set authenticated state or user state here
    //                     // setAuthenticated(true);
    //                     // setUser(userData);
    //                 } catch (error) {
    //                     console.error("Error parsing user data:", error);
    //                 }
    //             };

    //             // Request authentication by sending a message to the React Native app
    //             const permissionsNeeded = ["name"]; // Specify the permissions you need
    //             window.ReactNativeWebView!.postMessage(
    //                 JSON.stringify({
    //                     type: "RequestAuthentication",
    //                     permissions: permissionsNeeded,
    //                 }),
    //             );
    //         }
    //     }
    // }, [setAuthenticated, setUser]);

    // useEffect(() => {
    //     throttledCheckAuth();
    // }, [throttledCheckAuth]);

    if (circleAppData) {
        return <div className="t-0 l-0 absolute h-6 w-screen bg-purple-400">{circleAppData?.name}</div>;
    }

    return null;
};
