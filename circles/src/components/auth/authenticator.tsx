// authenticator.tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { checkAuth, verifySignature } from "./actions";
import { useThrottle } from "../utils/use-throttle";
import { userAtom, authInfoAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Account } from "@/models/models";
import { optional } from "zod";
import { CreateAccountWizard } from "./create-account-wizard";

declare global {
    interface Window {
        _SSI_ACCOUNTS?: Account[];
        _SSI_CURRENT_ACCOUNT?: Account;
        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
    }
}

export const WebviewLog = (message: string, ...optionalParams: any[]) => {
    console.log(message, optionalParams);
    if (!window.ReactNativeWebView) {
        return;
    }

    window.ReactNativeWebView.postMessage(
        JSON.stringify({
            type: "Log",
            message: message,
            optionalParams: optionalParams,
        }),
    );
};

export const Authenticator = () => {
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);
    const [, setUser] = useAtom(userAtom);

    const checkAuthentication = useCallback(async () => {
        // check if user is authenticated
        const inSsiApp = window._SSI_ACCOUNTS !== undefined;
        const accounts = window._SSI_ACCOUNTS;
        const currentAccount = window._SSI_CURRENT_ACCOUNT;

        if (inSsiApp && !currentAccount) {
            // prompt user to create an account
            setAuthInfo({ authStatus: "createAccount", inSsiApp, accounts, currentAccount });
            return;
        }

        const response = await checkAuth(currentAccount);
        if (response.authenticated) {
            setAuthInfo({ authStatus: "authenticated", inSsiApp, accounts, currentAccount });
            setUser(response.user);
        } else if (response.challenge) {
            // Send challenge to native app for signing
            window.ReactNativeWebView?.postMessage(
                JSON.stringify({
                    type: "SignChallenge",
                    challenge: response.challenge.challenge,
                    permissions: ["name", "profilePicture"], // Specify needed permissions here
                }),
            );
        } else {
            // TODO prompt user to sign in with QR code
            setAuthInfo({ authStatus: "unauthenticated", inSsiApp, accounts, currentAccount });
        }
    }, [setAuthInfo, setUser]);

    useEffect(() => {
        // Listen for messages from the native app
        const inSsiApp = window._SSI_ACCOUNTS !== undefined;

        const onMessage = (event: MessageEvent) => {
            //const message = JSON.parse(event.data);
            WebviewLog("Received message", event.data);
            // if (message.type === "ChallengeSigned") {
            //     const signature = message.signature;
            //     const publicKey = window._SSI_CURRENT_ACCOUNT?.publicKey;
            //     if (publicKey && signature) {
            //         verifySignature(publicKey, signature).then((verified) => {
            //             if (verified) {
            //                 checkAuthentication();
            //             }
            //         });
            //     }
            // }
        };

        if (inSsiApp) {
            window.addEventListener("message", onMessage);
        }

        checkAuthentication();

        return () => {
            if (inSsiApp) {
                window.removeEventListener("message", onMessage);
            }
        };
    }, [checkAuthentication]);

    // return <div className="t-0 l-0 absolute h-10 w-screen bg-purple-400">{JSON.stringify(authInfo)}</div>

    switch (authInfo.authStatus) {
        default:
        case "authenticated":
            return null;
        case "createAccount":
            return <CreateAccountWizard />;
    }
};
