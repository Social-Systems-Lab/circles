// authenticator.tsx
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { checkAuth, checkExternalAuth, verifySignatureAction } from "./actions";
import { useThrottle } from "../utils/use-throttle";
import { userAtom, authInfoAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Account } from "@/models/models";
import { optional } from "zod";
import { CreateAccountWizard } from "./create-account-wizard";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
const { KEYUTIL, KJUR } = require("jsrsasign");

declare global {
    interface Window {
        _SSI_ACCOUNT?: Account;
        ReactNativeWebView?: {
            postMessage: (message: string) => void;
        };
        requestAccess: (manifest: any) => void;
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
    }, []);

    const checkQrAuthentication = useCallback(async () => {
        if (!authInfo.challenge) {
            return;
        }

        const response = await checkExternalAuth(authInfo.challenge);
        if (response.authenticated) {
            setAuthInfo({
                authStatus: "authenticated",
                inSsiApp: false,
                currentAccount: undefined,
            });
            setUser(response.user);
        }
    }, [authInfo.challenge, setAuthInfo, setUser]);

    const checkAuthentication = useCallback(async () => {
        // if already authenticated, do nothing
        if (authInfo.authStatus === "authenticated") {
            console.log("checkAuthentication: already authenticated");
            return;
        }

        // check if user is authenticated
        const currentAccount = window._SSI_ACCOUNT;
        const inSsiApp = currentAccount !== undefined;

        if (inSsiApp && !currentAccount) {
            // prompt user to create an account
            setAuthInfo({ authStatus: "createAccount", inSsiApp, currentAccount });
            return;
        }

        console.log("checkAuthentication: checkAuth");
        const response = await checkAuth(currentAccount);
        if (response.authenticated) {
            console.log("checkAuthentication: checkAuth responded authenticated");
            setAuthInfo({ authStatus: "authenticated", inSsiApp, currentAccount });
            setUser(response.user);
        } else if (response.challenge) {
            // Send challenge to native app for signing
            if (inSsiApp) {
                window.ReactNativeWebView?.postMessage(
                    JSON.stringify({
                        type: "SignChallenge",
                        challenge: response.challenge.challenge,
                        permissions: ["name", "profilePicture"], // Specify needed permissions here
                    }),
                );
            } else {
                setAuthInfo({
                    authStatus: "unauthenticated",
                    inSsiApp,
                    currentAccount,
                    challenge: response.challenge,
                });
            }
        } else {
            // TODO prompt user to sign in with QR code
            console.log("checkAuthentication: checkAuth responded unauthenticated");
            setAuthInfo({ authStatus: "unauthenticated", inSsiApp, currentAccount });
        }
    }, [authInfo.authStatus, setAuthInfo, setUser]);

    useEffect(() => {
        // Listen for messages from the native app
        const inSsiApp = window._SSI_ACCOUNT !== undefined;

        const onMessage = (event: MessageEvent) => {
            WebviewLog("Received message", event.data);
            try {
                const message = event.data;
                if (message.type === "SignChallenge") {
                    const key = KEYUTIL.getKey(message.privateKey);
                    const signature = new KJUR.crypto.Signature({ alg: "SHA256withRSA" });
                    signature.init(key);
                    signature.updateString(message.challenge);
                    const signedChallenge = signature.sign();
                    const signedChallengeBase64 = Buffer.from(signedChallenge, "hex").toString("base64");

                    // authenticate signature for external app
                    verifySignatureAction(
                        message.publicKey,
                        signedChallengeBase64,
                        message.challenge,
                        message.currentAccount,
                    ).then((response) => {
                        WebviewLog("QRCodeChallengeSigned.verifySignatureAction returned", response);

                        if (message.isExternal) {
                            // verified external sign in. job done.
                        } else {
                            // verified sign in on this device
                            if (!response.verified) {
                                return;
                            }
                            const currentAccount = window._SSI_ACCOUNT;
                            setAuthInfo({ authStatus: "authenticated", inSsiApp, currentAccount });
                            setUser(response.user);
                        }
                    });
                }
            } catch (e) {
                WebviewLog("Error parsing message", e);
            }
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
    }, [authInfo.authStatus, checkAuthentication, setAuthInfo, setUser]);

    // useEffect(() => {
    //     if (authInfo.authStatus !== "unauthenticated" || authInfo.inSsiApp || !authInfo.challenge) {
    //         return;
    //     }

    //     // poll for authentication status
    //     const interval = setInterval(() => {
    //         checkQrAuthentication();
    //     }, 5000);

    //     return () => clearInterval(interval);
    // });

    // return <div className="t-0 l-0 absolute h-10 w-screen bg-purple-400">{JSON.stringify(authInfo)}</div>

    switch (authInfo.authStatus) {
        default:
        case "authenticated":
            return null;
        case "createAccount":
            return <CreateAccountWizard />;
    }
};
