function parseBooleanFlag(value: string | undefined): boolean | null {
    if (!value) {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }

    return null;
}

function getProductHint(): string {
    return [
        process.env.NEXT_PUBLIC_ENABLE_VIBE_ID,
        process.env.ENABLE_VIBE_ID,
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.CIRCLES_URL,
        process.env.CIRCLES_INSTANCE_NAME,
    ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .toLowerCase();
}

export function isPeerifyProduct(): boolean {
    return getProductHint().includes("peerify");
}

export function isVibeIdEnabled(): boolean {
    const explicitFlag =
        parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_VIBE_ID) ?? parseBooleanFlag(process.env.ENABLE_VIBE_ID);
    if (explicitFlag !== null) {
        return explicitFlag;
    }

    return !isPeerifyProduct();
}

export const VIBE_ID_DISABLED_MESSAGE = "VibeID is disabled for this product.";
