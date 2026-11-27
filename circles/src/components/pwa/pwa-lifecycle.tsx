"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
    readonly platforms?: string[];
    readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    prompt(): Promise<void>;
}

type PwaInstallSnapshot = {
    deferredPrompt: BeforeInstallPromptEvent | null;
    isInstalled: boolean;
};

let snapshot: PwaInstallSnapshot = {
    deferredPrompt: null,
    isInstalled: false,
};

const listeners = new Set<() => void>();

function notifyListeners() {
    listeners.forEach((listener) => listener());
}

function setSnapshot(updater: (prev: PwaInstallSnapshot) => PwaInstallSnapshot) {
    snapshot = updater(snapshot);
    notifyListeners();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot() {
    return snapshot;
}

/**
 * Registers Kamooni's minimal service worker and captures Chromium's
 * beforeinstallprompt event without prompting for notification permissions.
 */
export function PwaLifecycle() {
    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const isStandalone =
            Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone) ||
            Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches);

        if (isStandalone) {
            setSnapshot((prev) => (prev.isInstalled ? prev : { ...prev, isInstalled: true }));
        }

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js", { scope: "/", updateViaCache: "none" })
                .catch((error) => {
                    console.warn("Service worker registration skipped:", error);
                });
        }

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setSnapshot((prev) => ({
                ...prev,
                deferredPrompt: event as BeforeInstallPromptEvent,
            }));
        };

        const handleAppInstalled = () => {
            setSnapshot(() => ({
                deferredPrompt: null,
                isInstalled: true,
            }));
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.addEventListener("appinstalled", handleAppInstalled);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
            window.removeEventListener("appinstalled", handleAppInstalled);
        };
    }, []);

    return null;
}

export function usePwaInstallPrompt() {
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const triggerInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
        const promptEvent = state.deferredPrompt;
        if (!promptEvent) {
            return "unavailable";
        }

        try {
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            setSnapshot((prev) => ({
                ...prev,
                deferredPrompt: null,
                isInstalled: choice.outcome === "accepted" ? true : prev.isInstalled,
            }));
            return choice.outcome;
        } catch (error) {
            console.warn("Install prompt failed:", error);
            setSnapshot((prev) => ({ ...prev, deferredPrompt: null }));
            return "unavailable";
        }
    }, [state.deferredPrompt]);

    return {
        canPrompt: Boolean(state.deferredPrompt),
        isInstalled: state.isInstalled,
        triggerInstall,
    };
}
