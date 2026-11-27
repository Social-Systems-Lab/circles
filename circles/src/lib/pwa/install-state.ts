export const PWA_INSTALL_DISMISSED_KEY = "kamooni_pwa_install_dismissed_v1";

export type InstallGuidanceMode = "installed" | "prompt" | "ios_manual" | "browser_manual" | "unsupported";

export type WindowLike = {
    matchMedia?: (query: string) => { matches: boolean };
    navigator?: {
        standalone?: boolean;
        userAgent?: string;
    };
};

export type NavigatorLike = {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
};

/**
 * Detects whether the web app is currently running in installed/standalone display mode.
 */
export function isStandaloneDisplayMode(win?: WindowLike | null): boolean {
    if (!win) {
        return false;
    }

    if (win.navigator?.standalone === true) {
        return true;
    }

    try {
        return Boolean(win.matchMedia?.("(display-mode: standalone)")?.matches);
    } catch {
        return false;
    }
}

/**
 * Detects iOS / iPadOS browsers (including iPadOS desktop-class Safari UA).
 */
export function isIosOrIpadOs(nav?: NavigatorLike | null): boolean {
    if (!nav) {
        return false;
    }

    const ua = nav.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) {
        return true;
    }

    const isIpadDesktopUa =
        (nav.platform === "MacIntel" || /Macintosh/i.test(ua)) &&
        typeof nav.maxTouchPoints === "number" &&
        nav.maxTouchPoints > 1;

    return isIpadDesktopUa;
}

/**
 * Selects the non-intrusive install guidance state from browser capabilities.
 */
export function getInstallGuidanceMode({
    isStandalone,
    hasDeferredPrompt,
    isIos,
    isSupported,
}: {
    isStandalone: boolean;
    hasDeferredPrompt: boolean;
    isIos: boolean;
    isSupported: boolean;
}): InstallGuidanceMode {
    if (isStandalone) {
        return "installed";
    }

    if (!isSupported) {
        return "unsupported";
    }

    if (hasDeferredPrompt) {
        return "prompt";
    }

    if (isIos) {
        return "ios_manual";
    }

    return "browser_manual";
}
