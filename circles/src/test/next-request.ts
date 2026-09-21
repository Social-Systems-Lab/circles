// Helpers for testing Next.js route handlers, middleware and server actions that take a request.

import { NextRequest } from "next/server";
import { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";

export const TEST_ORIGIN = "http://localhost:3000";

type RequestOptions = {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    /** Cookies to send. See `createRequest` for why these are not passed as a `cookie` header. */
    cookies?: Record<string, string>;
};

const serializeCookies = (cookies: Record<string, string>) =>
    Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");

/**
 * The component tests run under happy-dom, whose Request implementation drops the forbidden `cookie`
 * header, so `request.cookies` and `headers.get("cookie")` would always be empty. This puts the cookies
 * back on the request the way the real runtime exposes them.
 */
const attachCookies = (request: NextRequest, cookies: Record<string, string>): NextRequest => {
    const cookieHeader = serializeCookies(cookies);
    const headers = new Proxy(request.headers, {
        get(target, property) {
            if (property === "get") return (name: string) => (name.toLowerCase() === "cookie" ? cookieHeader : target.get(name));
            if (property === "has") return (name: string) => name.toLowerCase() === "cookie" || target.has(name);
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    Object.defineProperty(request, "headers", { value: headers });
    Object.defineProperty(request, "cookies", { value: new RequestCookies(headers as Headers) });
    return request;
};

/** Build a NextRequest for a path or absolute url. Paths are resolved against `TEST_ORIGIN`. */
export const createRequest = (pathOrUrl = "/", { method = "GET", headers, body, cookies }: RequestOptions = {}): NextRequest => {
    const request = new NextRequest(new URL(pathOrUrl, TEST_ORIGIN), { method, headers, body });
    return cookies && Object.keys(cookies).length > 0 ? attachCookies(request, cookies) : request;
};

/**
 * Build a POST request with a JSON body. A string body is sent as-is so tests can send malformed JSON;
 * anything else is serialized.
 */
export const createJsonRequest = (
    body: unknown,
    { path = "/", method = "POST", headers, cookies }: { path?: string; method?: string; headers?: Record<string, string>; cookies?: Record<string, string> } = {},
): NextRequest =>
    createRequest(path, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
        cookies,
    });

/** Build a request carrying `Authorization: Bearer <token>`. */
export const createBearerRequest = (token: string, options: RequestOptions & { path?: string } = {}): NextRequest =>
    createRequest(options.path ?? "/", { ...options, headers: { authorization: `Bearer ${token}`, ...options.headers } });
