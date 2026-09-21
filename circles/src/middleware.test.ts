import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";
import { useStubbedFetch, silenceConsole } from "@/test/hooks";
import { createRequest } from "@/test/next-request";

const restoreEnv = snapshotEnv(
    "NEXT_PUBLIC_MAINTENANCE_MODE",
    "CIRCLES_HOST",
    "CIRCLES_PORT",
    "CIRCLES_DEV_INTERNAL_ORIGIN",
    "PORT",
    "NODE_ENV",
);

const verifyUserToken = mock(async (_token: string): Promise<Record<string, unknown>> => ({ userDid: "did:user" }));
mock.module("@/lib/auth/jwt", () => ({ verifyUserToken }));

const { config, middleware } = await import("./middleware");

type AccessBody = { authenticated?: boolean; authorized?: boolean; notFound?: boolean; notFoundType?: string; error?: boolean };
const fetchMock = useStubbedFetch();

const consoleSpy = silenceConsole("log", "error");

const ORIGIN = "http://localhost:3000";
const requestTo = (path: string, { cookies, origin = ORIGIN }: { cookies?: Record<string, string>; origin?: string } = {}) =>
    createRequest(new URL(path, origin).toString(), { cookies });
const respondWith = (body: AccessBody, status = 200) => fetchMock.mockResolvedValue(Response.json(body, { status }));
const location = (response: Response | undefined | void) => {
    expect(response).toBeDefined();
    return new URL((response as Response).headers.get("location")!);
};
const accessCalls = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
    for (const name of ["NEXT_PUBLIC_MAINTENANCE_MODE", "CIRCLES_HOST", "CIRCLES_PORT", "CIRCLES_DEV_INTERNAL_ORIGIN", "PORT"]) setEnv(name, undefined);
    setEnv("NODE_ENV", "test");
    verifyUserToken.mockReset();
    verifyUserToken.mockResolvedValue({ userDid: "did:user" });
    respondWith({ authenticated: true, authorized: true });
});

afterAll(restoreEnv);

describe("maintenance mode", () => {
    beforeEach(() => setEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "true"));

    test("sends every page to the holding page, remembering where the visitor was going", async () => {
        const target = location(await middleware(requestTo("/circles/demo/feed")));

        expect(target.pathname).toBe("/holding");
        expect(target.searchParams.get("redirectTo")).toBe("/circles/demo/feed");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test.each(["/holding", "/holding/details"])("lets %s through so the holding page itself works", async (path) => {
        expect(await middleware(requestTo(path))).toBeUndefined();
    });

    test("does not treat a path that merely starts with holding as the holding page", async () => {
        expect(location(await middleware(requestTo("/holdings"))).pathname).toBe("/holding");
    });

    test("also holds back the home page and private media", async () => {
        expect(location(await middleware(requestTo("/"))).pathname).toBe("/holding");
        expect(location(await middleware(requestTo("/private-media/abc"))).pathname).toBe("/holding");
    });

    test("only activates for the exact value 'true'", async () => {
        setEnv("NEXT_PUBLIC_MAINTENANCE_MODE", "1");

        expect(await middleware(requestTo("/"))).toBeUndefined();
    });
});

describe("private media", () => {
    test.each(["/private-media", "/private-media/abc", "/private-media/a/b"])("%s is left to its own session check", async (path) => {
        expect(await middleware(requestTo(path, { cookies: { circles_token: "garbage" } }))).toBeUndefined();

        expect(verifyUserToken).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("does not include lookalike paths", async () => {
        verifyUserToken.mockRejectedValue(new Error("bad"));

        const response = await middleware(requestTo("/private-media-x", { cookies: { circles_token: "garbage" } }));

        expect(response).toBeDefined();
        expect(verifyUserToken).toHaveBeenCalled();
    });
});

describe("session cookie", () => {
    test("does not verify anything for anonymous visitors", async () => {
        await middleware(requestTo("/circles/demo/feed"));

        expect(verifyUserToken).not.toHaveBeenCalled();
    });

    test("verifies the session token from the cookie", async () => {
        await middleware(requestTo("/circles/demo/feed", { cookies: { circles_token: "good-token" } }));

        expect(verifyUserToken).toHaveBeenCalledWith("good-token");
    });

    test("also reads the legacy token cookie", async () => {
        await middleware(requestTo("/circles/demo/feed", { cookies: { token: "legacy-token" } }));

        expect(verifyUserToken).toHaveBeenCalledWith("legacy-token");
    });

    test("clears an invalid session and reloads the same url", async () => {
        verifyUserToken.mockRejectedValue(new Error("jwt expired"));

        const response = (await middleware(requestTo("/circles/demo/feed?tab=1", { cookies: { circles_token: "stale", token: "stale" } })))!;

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(`${ORIGIN}/circles/demo/feed?tab=1`);
        const setCookies = response.headers.getSetCookie().join("\n");
        expect(setCookies).toContain("circles_token=;");
        expect(setCookies).toContain("token=;");
        expect(setCookies).toMatch(/Max-Age=0/i);
        expect(consoleSpy.error).toHaveBeenCalledWith("Error verifying token", expect.any(Error));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test.each([["missing", {}], ["not a string", { userDid: 42 }], ["empty object", null]])(
        "treats a valid token whose user did is %s as invalid",
        async (_label, payload) => {
            verifyUserToken.mockResolvedValue(payload as Record<string, unknown>);

            const response = (await middleware(requestTo("/circles/demo/feed", { cookies: { circles_token: "t" } })))!;

            expect(response.status).toBe(307);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});

describe("routes that are not circle routes", () => {
    test.each(["/", "/explore", "/settings/profile", "/holding", "/login"])("%s is not access checked", async (path) => {
        expect(await middleware(requestTo(path))).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test.each(["/circles/demo/access-denied", "/circles/demo/not-found"])("%s is exempt so error pages cannot redirect in a loop", async (path) => {
        expect(await middleware(requestTo(path))).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("access check request", () => {
    const bodyOf = () => JSON.parse(fetchMock.mock.calls[0][1]!.body as string);

    test.each([
        ["/circles/demo", { circleHandle: "demo", moduleHandle: "feed" }],
        ["/circles/demo/", { circleHandle: "demo", moduleHandle: "feed" }],
        ["/circles/demo/tasks", { circleHandle: "demo", moduleHandle: "tasks" }],
        ["/circles/demo/tasks/abc123", { circleHandle: "demo", moduleHandle: "tasks" }],
        ["/circles/demo/post/abc123", { circleHandle: "demo", moduleHandle: "feed" }],
        ["/circles/demo/post", { circleHandle: "demo", moduleHandle: "post" }],
        ["/circles", { moduleHandle: "circles" }],
    ])("for %s asks about %p", async (path, expected) => {
        await middleware(requestTo(path));

        expect(bodyOf()).toEqual(expected);
    });

    test("posts JSON to the access API", async () => {
        await middleware(requestTo("/circles/demo/tasks"));

        const init = fetchMock.mock.calls[0][1]!;
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    test("forwards the visitor's cookies so the access API sees the same session", async () => {
        await middleware(requestTo("/circles/demo/tasks", { cookies: { circles_token: "good-token", theme: "dark" } }));

        expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>).Cookie).toBe("circles_token=good-token; theme=dark");
    });

    test("sends no cookie header for anonymous visitors", async () => {
        await middleware(requestTo("/circles/demo/tasks"));

        expect(fetchMock.mock.calls[0][1]!.headers).not.toHaveProperty("Cookie");
    });

    test("logs the request in development only", async () => {
        setEnv("NODE_ENV", "development");
        await middleware(requestTo("/circles/demo/tasks"));
        expect(consoleSpy.log).toHaveBeenCalledWith("Requesting access to", `${ORIGIN}/circles/demo/tasks`);

        consoleSpy.log.mockClear();
        setEnv("NODE_ENV", "production");
        await middleware(requestTo("/circles/demo/tasks"));
        expect(consoleSpy.log).not.toHaveBeenCalled();
    });
});

describe("access decisions", () => {
    const check = (path = "/circles/demo/tasks") => middleware(requestTo(path));

    test("lets an authorized visitor through", async () => {
        respondWith({ authenticated: true, authorized: true });

        expect(await check()).toBeUndefined();
    });

    test("lets an anonymous visitor through when the module is public", async () => {
        respondWith({ authenticated: true, authorized: true });

        expect(await check("/circles/demo/feed")).toBeUndefined();
    });

    test("sends visitors who are not signed in to the circle's access-denied page", async () => {
        respondWith({ authenticated: false, authorized: false });

        const target = location(await check("/circles/demo/tasks"));

        expect(target.pathname).toBe("/circles/demo/access-denied");
        expect(Object.fromEntries(target.searchParams)).toEqual({ redirectTo: "/circles/demo/tasks", module: "tasks", reason: "unauthenticated" });
    });

    test("sends signed-in visitors without permission to the same page with a different reason", async () => {
        respondWith({ authenticated: true, authorized: false });

        const target = location(await check("/circles/demo/tasks"));

        expect(target.pathname).toBe("/circles/demo/access-denied");
        expect(target.searchParams.get("reason")).toBe("unauthorized");
    });

    test("reports a missing circle with the site-wide not-found page", async () => {
        respondWith({ notFound: true, notFoundType: "circle" });

        const target = location(await check("/circles/ghost/tasks"));

        expect(target.pathname).toBe("/not-found");
        expect(target.searchParams.get("redirectTo")).toBe("/circles/ghost/tasks");
    });

    test("reports a missing module with the circle's own not-found page", async () => {
        respondWith({ notFound: true, notFoundType: "module" });

        const target = location(await check("/circles/demo/goals"));

        expect(target.pathname).toBe("/circles/demo/not-found");
        expect(Object.fromEntries(target.searchParams)).toEqual({ redirectTo: "/circles/demo/goals", module: "goals" });
    });

    test("treats any other not-found as a missing module", async () => {
        respondWith({ notFound: true });

        expect(location(await check("/circles/demo/goals")).pathname).toBe("/circles/demo/not-found");
    });

    test("prefers the error flag over every other field", async () => {
        respondWith({ error: true, notFound: true, authenticated: false });

        expect(location(await check()).pathname).toBe("/error");
    });

    test("checks not-found before authentication so hidden circles look the same to everyone", async () => {
        respondWith({ notFound: true, notFoundType: "circle", authenticated: false, authorized: false });

        expect(location(await check()).pathname).toBe("/not-found");
    });

    test("denies by default when the response says nothing about access", async () => {
        respondWith({});

        expect(location(await check()).searchParams.get("reason")).toBe("unauthenticated");
    });

    test("shows the error page when the response is not JSON", async () => {
        fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));

        expect(location(await check()).pathname).toBe("/error");
    });
});

describe("access API endpoints", () => {
    const hitCircle = () => middleware(requestTo("/circles/demo/tasks", { origin: ORIGIN }));

    describe("in production", () => {
        beforeEach(() => setEnv("NODE_ENV", "production"));

        test("calls the internal host and port only", async () => {
            setEnv("CIRCLES_HOST", "circles-app");
            setEnv("CIRCLES_PORT", "4000");

            await hitCircle();

            expect(accessCalls()).toEqual(["http://circles-app:4000/api/access"]);
        });

        test("defaults the port to 3000", async () => {
            setEnv("CIRCLES_HOST", "circles-app");

            await hitCircle();

            expect(accessCalls()).toEqual(["http://circles-app:3000/api/access"]);
        });

        test("does not fall back to other endpoints when the internal one fails", async () => {
            fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

            expect(location(await hitCircle()).pathname).toBe("/error");
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    describe("outside production", () => {
        test("tries the request origin first on localhost, then the local dev ports", async () => {
            fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

            await hitCircle();

            expect(accessCalls()).toEqual([
                `${ORIGIN}/api/access`,
                "http://127.0.0.1:3006/api/access",
                "http://127.0.0.1:3000/api/access",
            ]);
        });

        // Next normalizes 127.0.0.1 and ::1 to localhost in request urls, so they take the local path as well.
        test.each(["127.0.0.1", "[::1]"])("treats %s as local", async (host) => {
            fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

            await middleware(requestTo("/circles/demo/tasks", { origin: `http://${host}:3000` }));

            expect(accessCalls()[0]).toBe("http://localhost:3000/api/access");
            expect(accessCalls()).toHaveLength(3);
        });

        test("tries the request origin last for a public hostname", async () => {
            fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

            await middleware(requestTo("/circles/demo/tasks", { origin: "https://kamooni.example" }));

            expect(accessCalls()).toEqual([
                "http://127.0.0.1:3006/api/access",
                "http://127.0.0.1:3000/api/access",
                "https://kamooni.example/api/access",
            ]);
        });

        test("adds the configured internal dev origin and the configured ports, without duplicates", async () => {
            setEnv("CIRCLES_DEV_INTERNAL_ORIGIN", "http://internal:8080/ignored/path");
            setEnv("PORT", "3010");
            setEnv("CIRCLES_PORT", "3006");
            fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

            await hitCircle();

            expect(accessCalls()).toEqual([
                `${ORIGIN}/api/access`,
                "http://internal:8080/api/access",
                "http://127.0.0.1:3010/api/access",
                "http://127.0.0.1:3006/api/access",
                "http://127.0.0.1:3000/api/access",
            ]);
        });

        test("uses the first endpoint that answers without a server error", async () => {
            fetchMock.mockResolvedValueOnce(new Response("boom", { status: 502 })).mockResolvedValueOnce(Response.json({ authenticated: true, authorized: true }));

            expect(await hitCircle()).toBeUndefined();
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        test("trusts a client error response from the first endpoint that answers", async () => {
            fetchMock.mockResolvedValue(Response.json({ authenticated: false, authorized: false }, { status: 404 }));

            const response = await hitCircle();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(location(response).searchParams.get("reason")).toBe("unauthenticated");
        });

        test("moves on to the next endpoint after a network error", async () => {
            fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValueOnce(Response.json({ authenticated: true, authorized: true }));

            expect(await hitCircle()).toBeUndefined();
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        test("shows the error page when every endpoint fails", async () => {
            fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

            expect(location(await hitCircle()).pathname).toBe("/error");
        });
    });
});

describe("config.matcher", () => {
    // Next compiles the matcher with path-to-regexp; the pattern is also a valid regular expression.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    test.each(["/", "/circles/demo", "/circles/demo/tasks", "/holding", "/private-media/abc", "/explore"])("runs for %s", (path) => {
        expect(matcher.test(path)).toBe(true);
    });

    test.each([
        "/api/access",
        "/api",
        "/_next/static/chunk.js",
        "/_next/image",
        "/robots.txt",
        "/sitemap.xml",
        "/favicon.ico",
        "/logo.png",
        "/styles/site.css",
        "/fonts/inter.woff2",
        "/manifest.webmanifest",
        "/circles/demo/cover.jpg",
    ])("skips %s", (path) => {
        expect(matcher.test(path)).toBe(false);
    });

    test("skips any path that merely starts with api, not only the api folder", () => {
        expect(matcher.test("/apiary")).toBe(false);
    });

    test("matches only one pattern", () => {
        expect(config.matcher).toHaveLength(1);
    });
});
