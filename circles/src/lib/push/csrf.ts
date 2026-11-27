import type { PushEnv } from "./config";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function addCandidateOrigin(origins: Set<string>, raw: string | undefined) {
    if (!raw) {
        return;
    }
    try {
        origins.add(new URL(raw).origin);
    } catch {
        // Ignore invalid configured URLs.
    }
}

export function getAllowedMutationOrigins(request: Request, env: PushEnv = process.env): Set<string> {
    const allowed = new Set<string>();
    addCandidateOrigin(allowed, env.CIRCLES_URL);
    addCandidateOrigin(allowed, env.NEXT_PUBLIC_APP_URL);
    addCandidateOrigin(allowed, env.NEXT_PUBLIC_SITE_URL);

    try {
        const reqUrl = new URL(request.url);
        if (env.NODE_ENV !== "production" && LOCAL_HOSTNAMES.has(reqUrl.hostname)) {
            allowed.add(reqUrl.origin);
        }
        const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
        const protoHeader = request.headers.get("x-forwarded-proto") || reqUrl.protocol.replace(":", "");
        if (hostHeader && (allowed.size === 0 || (env.NODE_ENV !== "production" && LOCAL_HOSTNAMES.has(reqUrl.hostname)))) {
            addCandidateOrigin(allowed, `${protoHeader}://${hostHeader}`);
        }
    } catch {
        // Ignore malformed request URL.
    }

    return allowed;
}

export type CsrfCheckResult = { ok: true } | { ok: false; status: 403; error: string };

/**
 * Enforces strict same-origin validation for cookie-authenticated mutating push APIs.
 */
export function assertSameOriginMutation(request: Request, env: PushEnv = process.env): CsrfCheckResult {
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite && secFetchSite !== "same-origin") {
        return { ok: false, status: 403, error: "Forbidden cross-site request" };
    }

    const originHeader = request.headers.get("origin");
    if (!originHeader) {
        return { ok: false, status: 403, error: "Missing Origin header" };
    }

    let requestOrigin: string;
    try {
        requestOrigin = new URL(originHeader).origin;
    } catch {
        return { ok: false, status: 403, error: "Invalid Origin header" };
    }

    const allowedOrigins = getAllowedMutationOrigins(request, env);
    if (!allowedOrigins.has(requestOrigin)) {
        return { ok: false, status: 403, error: "Origin mismatch" };
    }

    return { ok: true };
}
