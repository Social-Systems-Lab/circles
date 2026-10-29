const STAGING_ORIGIN = "https://staging.kamooni.org";

const BASE_URL_VARIABLES = [
    "CIRCLES_URL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SITE_URL",
    "APP_URL",
    "SITE_URL",
] as const;

type Environment = Record<string, string | undefined>;

export type CaptureConfiguration =
    | { enabled: false }
    | { enabled: true; origin: typeof STAGING_ORIGIN }
    | { enabled: false; error: string };

export type EmailTransportConfiguration =
    | { transport: "capture"; origin: typeof STAGING_ORIGIN }
    | { transport: "postmark" }
    | { transport: "unconfigured" }
    | { transport: "refused"; error: string };

// Runtime variables are defense-in-depth, not an independent deployment identity.
// This module must remain on the staging-only source/artifact lineage and must never ship from production main.
export function isCaptureRequested(env: Environment = process.env): boolean {
    return (
        env.EMAIL_TRANSPORT === "capture" ||
        env.EMAIL_CAPTURE_ENABLED === "true" ||
        env.KAMOONI_DEPLOYMENT_ENV === "staging" ||
        isExactStagingOrigin(env.CIRCLES_URL || "")
    );
}

const isExactStagingOrigin = (value: string): boolean => {
    try {
        const url = new URL(value);
        return (
            url.origin === STAGING_ORIGIN && (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash
        );
    } catch {
        return false;
    }
};

export function getCaptureConfiguration(env: Environment = process.env): CaptureConfiguration {
    if (!isCaptureRequested(env)) return { enabled: false };

    if (env.EMAIL_TRANSPORT !== "capture") {
        return { enabled: false, error: 'Staging capture requires EMAIL_TRANSPORT="capture".' };
    }
    if (env.EMAIL_CAPTURE_ENABLED !== "true") {
        return { enabled: false, error: 'Staging capture requires EMAIL_CAPTURE_ENABLED="true".' };
    }
    if (env.KAMOONI_DEPLOYMENT_ENV !== "staging") {
        return { enabled: false, error: 'Staging capture requires KAMOONI_DEPLOYMENT_ENV="staging".' };
    }
    if (env.NODE_ENV !== "production") {
        return { enabled: false, error: 'Staging capture requires NODE_ENV="production".' };
    }
    if (env.CIRCLES_DEV_LOG_PASSWORD_RESET === "true") {
        return { enabled: false, error: "Staging capture forbids password-reset token logging." };
    }
    if (!isExactStagingOrigin(env.CIRCLES_URL || "")) {
        return { enabled: false, error: `Staging capture requires CIRCLES_URL=${STAGING_ORIGIN}.` };
    }
    for (const variable of BASE_URL_VARIABLES) {
        const value = env[variable];
        if (value && !isExactStagingOrigin(value)) {
            return { enabled: false, error: `${variable} must use the exact staging origin while capture is enabled.` };
        }
    }
    if (env.POSTMARK_API_TOKEN || env.POSTMARK_SENDER_EMAIL) {
        return { enabled: false, error: "Postmark must be disabled while staging capture is enabled." };
    }

    return { enabled: true, origin: STAGING_ORIGIN };
}

export function requireCaptureConfiguration(env: Environment = process.env): { origin: typeof STAGING_ORIGIN } {
    const configuration = getCaptureConfiguration(env);
    if (!configuration.enabled) {
        throw new Error("error" in configuration ? configuration.error : "Staging email capture is disabled.");
    }
    return configuration;
}

export function getEmailTransportConfiguration(env: Environment = process.env): EmailTransportConfiguration {
    const capture = getCaptureConfiguration(env);
    if ("error" in capture) return { transport: "refused", error: capture.error };
    if (capture.enabled) return { transport: "capture", origin: capture.origin };
    if (env.EMAIL_TRANSPORT && env.EMAIL_TRANSPORT !== "postmark") {
        return { transport: "refused", error: `Unsupported EMAIL_TRANSPORT value: ${env.EMAIL_TRANSPORT}.` };
    }
    if (env.POSTMARK_API_TOKEN && env.POSTMARK_SENDER_EMAIL) return { transport: "postmark" };
    if (env.POSTMARK_API_TOKEN || env.POSTMARK_SENDER_EMAIL) {
        return { transport: "refused", error: "Postmark requires both API token and sender email." };
    }
    return { transport: "unconfigured" };
}

export function isEmailTransportAvailable(env: Environment = process.env): boolean {
    const configuration = getEmailTransportConfiguration(env);
    return configuration.transport === "capture" || configuration.transport === "postmark";
}

export function mayLogSensitiveDevelopmentEmailLinks(env: Environment = process.env): boolean {
    return env.NODE_ENV !== "production" && !isCaptureRequested(env);
}

export function enforceEmailConfigurationAtBoot(env: Environment = process.env): void {
    const configuration = getEmailTransportConfiguration(env);
    if (configuration.transport === "refused") throw new Error(configuration.error);
}

export { STAGING_ORIGIN };
