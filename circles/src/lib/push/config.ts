export type PushEnv = Record<string, string | undefined>;

export type PublicPushConfig = {
    enabled: boolean;
    dispatchEnabled: boolean;
    vapidPublicKey: string | null;
};

export type VapidConfig = {
    subject: string;
    publicKey: string;
    privateKey: string;
};

function isValidVapidSubject(value: string | undefined): value is string {
    if (!value) {
        return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }
    if (trimmed.startsWith("mailto:")) {
        return trimmed.length > "mailto:".length && trimmed.includes("@");
    }
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "https:";
    } catch {
        return false;
    }
}

export function getVapidConfig(env: PushEnv = process.env): VapidConfig | null {
    const subject = env.WEB_PUSH_VAPID_SUBJECT?.trim();
    const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
    const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();

    if (!isValidVapidSubject(subject) || !publicKey || !privateKey) {
        return null;
    }

    return {
        subject,
        publicKey,
        privateKey,
    };
}

export function isWebPushEnabled(env: PushEnv = process.env): boolean {
    if (env.WEB_PUSH_ENABLED !== "true") {
        return false;
    }
    return getVapidConfig(env) !== null;
}

export function isWebPushDispatchEnabled(env: PushEnv = process.env): boolean {
    return isWebPushEnabled(env) && env.WEB_PUSH_DISPATCH_ENABLED === "true";
}

export function getPublicPushConfig(env: PushEnv = process.env): PublicPushConfig {
    const enabled = isWebPushEnabled(env);
    const vapid = enabled ? getVapidConfig(env) : null;

    return {
        enabled,
        dispatchEnabled: enabled && env.WEB_PUSH_DISPATCH_ENABLED === "true",
        vapidPublicKey: vapid?.publicKey ?? null,
    };
}
