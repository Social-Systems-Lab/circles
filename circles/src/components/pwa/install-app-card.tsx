"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    getInstallGuidanceMode,
    isIosOrIpadOs,
    isStandaloneDisplayMode,
    PWA_INSTALL_DISMISSED_KEY,
} from "@/lib/pwa/install-state";
import { usePwaInstallPrompt } from "./pwa-lifecycle";

export function InstallAppCard() {
    const { canPrompt, isInstalled, triggerInstall } = usePwaInstallPrompt();
    const [isMounted, setIsMounted] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isIos, setIsIos] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const [isDismissed, setIsDismissed] = useState(false);
    const [isPrompting, setIsPrompting] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        if (typeof window === "undefined") {
            return;
        }

        setIsStandalone(isStandaloneDisplayMode(window));
        setIsIos(isIosOrIpadOs(window.navigator));
        setIsSupported("serviceWorker" in window.navigator);

        try {
            setIsDismissed(window.localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === "1");
        } catch {
            setIsDismissed(false);
        }
    }, []);

    const handleInstallClick = async () => {
        setIsPrompting(true);
        try {
            await triggerInstall();
        } finally {
            setIsPrompting(false);
        }
    };

    const handleDismiss = () => {
        setIsDismissed(true);
        try {
            window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "1");
        } catch {
            // Ignore storage restrictions.
        }
    };

    const handleShowAgain = () => {
        setIsDismissed(false);
        try {
            window.localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY);
        } catch {
            // Ignore storage restrictions.
        }
    };

    if (!isMounted) {
        return null;
    }

    const mode = getInstallGuidanceMode({
        isStandalone: isStandalone || isInstalled,
        hasDeferredPrompt: canPrompt,
        isIos,
        isSupported,
    });

    if (mode === "unsupported") {
        return null;
    }

    return (
        <Card>
            <CardHeader className="space-y-2 pb-5">
                <CardTitle className="text-2xl font-semibold tracking-tight">Install Kamooni App</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                    Open Kamooni in its own window from your home screen or desktop. Installing is optional on
                    desktop and Android, and required on iPhone or iPad before enabling push notifications.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {mode === "installed" ? (
                    <div className="flex items-center gap-3 rounded-lg border p-4">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Kamooni is installed on this device</p>
                            <p className="text-sm text-muted-foreground">
                                You are running Kamooni as an installed web app.
                            </p>
                        </div>
                    </div>
                ) : isDismissed ? (
                    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">Install instructions are hidden on this browser.</p>
                        <Button type="button" variant="outline" size="sm" onClick={handleShowAgain}>
                            Show install instructions
                        </Button>
                    </div>
                ) : mode === "prompt" ? (
                    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <Download className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Install Kamooni on this device</p>
                                <p className="text-sm text-muted-foreground">
                                    Launch Kamooni directly from your app launcher or home screen.
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={handleDismiss} disabled={isPrompting}>
                                Dismiss
                            </Button>
                            <Button type="button" onClick={handleInstallClick} disabled={isPrompting}>
                                Install Kamooni
                            </Button>
                        </div>
                    </div>
                ) : mode === "ios_manual" ? (
                    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <Share className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Add Kamooni to your Home Screen</p>
                                <p className="text-sm text-muted-foreground">
                                    In Safari, tap the Share button, choose <strong>Add to Home Screen</strong>, then
                                    open Kamooni from your Home Screen icon.
                                </p>
                            </div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={handleDismiss}>
                            Dismiss
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Install from your browser menu</p>
                                <p className="text-sm text-muted-foreground">
                                    Open your browser menu and choose <strong>Install Kamooni</strong> or{" "}
                                    <strong>Add to Home Screen</strong> whenever you want app-style access.
                                </p>
                            </div>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={handleDismiss}>
                            Dismiss
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
