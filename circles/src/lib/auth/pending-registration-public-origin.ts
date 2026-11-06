import { isIP } from "node:net";

const CONTINUE_PATH = "/signup/continue" as const;
const INVALID_PATH = "/signup?verification=invalid" as const;

export type PendingRegistrationRedirectPath = typeof CONTINUE_PATH | typeof INVALID_PATH;

export function requirePendingRegistrationPublicOrigin(
    value = process.env.CIRCLES_URL,
    options: { allowLoopbackHttp?: boolean } = {},
): string {
    const configured = value?.trim();
    if (!configured) throw new Error("Pending registration public origin is not configured");

    let parsed: URL;
    try {
        parsed = new URL(configured);
    } catch {
        throw new Error("Pending registration public origin is invalid");
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    const allowedDevelopmentOrigin = options.allowLoopbackHttp === true && parsed.protocol === "http:" && loopback;
    if (
        (!allowedDevelopmentOrigin && parsed.protocol !== "https:") ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        (!allowedDevelopmentOrigin &&
            (!hostname.includes(".") ||
                hostname === "localhost" ||
                hostname.endsWith(".localhost") ||
                isIP(hostname) !== 0))
    ) {
        throw new Error("Pending registration public origin is unsafe");
    }

    return parsed.origin;
}

export function buildPendingRegistrationRedirectUrl(path: PendingRegistrationRedirectPath, publicOrigin: string): URL {
    return new URL(path, `${publicOrigin}/`);
}
