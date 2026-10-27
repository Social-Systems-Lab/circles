export const EMAIL_CAPTURE_ALLOWED_HOSTS = ["staging.kamooni.org", "localhost", "127.0.0.1"] as const;

const BASE_URL_SETTINGS = [
    "CIRCLES_URL",
    "NEXT_PUBLIC_APP_URL",
    "APP_URL",
    "SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
] as const;

type Env = Record<string, string | undefined>;

export type EmailCaptureCheck = { mode: "off" } | { mode: "on" } | { mode: "refused"; reason: string };

const hostnameOf = (value: string): string | null => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.hostname.toLowerCase() : null;
    } catch {
        return null;
    }
};

export const checkEmailCaptureMode = (env: Env = process.env): EmailCaptureCheck => {
    const raw = env.EMAIL_CAPTURE_MODE;
    if (raw === undefined || raw === "" || raw === "off") {
        if (hostnameOf(env.CIRCLES_URL || "") === "staging.kamooni.org") {
            return { mode: "refused", reason: "staging.kamooni.org requires EMAIL_CAPTURE_MODE=on" };
        }
        return { mode: "off" };
    }
    if (raw !== "on") {
        return {
            mode: "refused",
            reason: `EMAIL_CAPTURE_MODE must be "on", "off" or empty (got ${raw.length} other characters)`,
        };
    }
    if (!env.CIRCLES_URL) {
        return { mode: "refused", reason: "EMAIL_CAPTURE_MODE=on needs CIRCLES_URL set to a staging URL" };
    }
    for (const name of BASE_URL_SETTINGS) {
        const value = env[name];
        if (!value) continue;
        const hostname = hostnameOf(value);
        if (
            !hostname ||
            !EMAIL_CAPTURE_ALLOWED_HOSTS.includes(hostname as (typeof EMAIL_CAPTURE_ALLOWED_HOSTS)[number])
        ) {
            return {
                mode: "refused",
                reason: `EMAIL_CAPTURE_MODE=on is only allowed on staging, but ${name} points to ${hostname ?? "an invalid URL"}`,
            };
        }
    }
    return { mode: "on" };
};

export const isEmailCaptureOn = (env: Env = process.env): boolean => checkEmailCaptureMode(env).mode === "on";

export const enforceEmailCaptureModeAtBoot = (
    env: Env = process.env,
    exit: (code: number) => void = (code) => process.exit(code),
): EmailCaptureCheck => {
    const check = checkEmailCaptureMode(env);
    if (check.mode === "refused") {
        console.error(`[email-capture] Refusing to start: ${check.reason}. Fix or remove EMAIL_CAPTURE_MODE.`);
        exit(1);
    } else if (check.mode === "on") {
        console.log(
            "[email-capture] Capture mode ON: outbound email is stored for the superadmin inbox, never delivered.",
        );
    }
    return check;
};
