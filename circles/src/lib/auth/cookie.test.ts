import { afterEach, describe, expect, test } from "bun:test";
import { setEnv, snapshotEnv } from "@/test/env";

// AUTH_COOKIE_NAME is derived from NODE_ENV when the module is evaluated, so each environment is
// loaded as its own module instance through a distinct query string.
const restoreEnv = snapshotEnv("NODE_ENV");
let instance = 0;

const loadCookieModule = async (nodeEnv: string | undefined) => {
    setEnv("NODE_ENV", nodeEnv);
    instance += 1;
    return (await import(`./cookie?instance=${instance}`)) as typeof import("./cookie");
};

afterEach(restoreEnv);

const readerFor = (cookies: Record<string, string | undefined>) => ({
    get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined),
});

describe("cookie names", () => {
    test("exposes the production and development cookie names", async () => {
        const cookie = await loadCookieModule("test");
        expect(cookie.PRODUCTION_AUTH_COOKIE_NAME).toBe("token");
        expect(cookie.DEVELOPMENT_AUTH_COOKIE_NAME).toBe("circles_token");
    });

    test("uses the production cookie name in production", async () => {
        const cookie = await loadCookieModule("production");
        expect(cookie.AUTH_COOKIE_NAME).toBe("token");
    });

    test.each(["development", "test", undefined])("uses the development cookie name when NODE_ENV is %p", async (env) => {
        const cookie = await loadCookieModule(env);
        expect(cookie.AUTH_COOKIE_NAME).toBe("circles_token");
    });
});

describe("getAuthCookieNamesForClearing", () => {
    test("lists only the token cookie in production", async () => {
        const cookie = await loadCookieModule("production");
        expect(cookie.getAuthCookieNamesForClearing()).toEqual(["token"]);
    });

    test("lists the development cookie and the legacy token cookie otherwise", async () => {
        const cookie = await loadCookieModule("development");
        expect(cookie.getAuthCookieNamesForClearing()).toEqual(["circles_token", "token"]);
    });

    test("returns a copy that callers may mutate", async () => {
        const cookie = await loadCookieModule("development");
        cookie.getAuthCookieNamesForClearing().push("extra");
        expect(cookie.getAuthCookieNamesForClearing()).toEqual(["circles_token", "token"]);
    });
});

describe("readAuthToken", () => {
    test("returns undefined when no auth cookie is present", async () => {
        const cookie = await loadCookieModule("development");
        expect(cookie.readAuthToken(readerFor({}))).toBeUndefined();
        expect(cookie.readAuthToken(readerFor({ unrelated: "x" }))).toBeUndefined();
    });

    test("reads the environment specific cookie", async () => {
        const cookie = await loadCookieModule("development");
        expect(cookie.readAuthToken(readerFor({ circles_token: "dev-token" }))).toBe("dev-token");
    });

    test("falls back to the legacy token cookie outside production", async () => {
        const cookie = await loadCookieModule("development");
        expect(cookie.readAuthToken(readerFor({ token: "legacy-token" }))).toBe("legacy-token");
    });

    test("prefers the environment specific cookie over the legacy one", async () => {
        const cookie = await loadCookieModule("development");
        expect(cookie.readAuthToken(readerFor({ circles_token: "dev", token: "legacy" }))).toBe("dev");
    });

    test("skips an empty environment specific cookie in favor of the legacy one", async () => {
        const cookie = await loadCookieModule("development");
        expect(cookie.readAuthToken(readerFor({ circles_token: "", token: "legacy" }))).toBe("legacy");
        expect(cookie.readAuthToken(readerFor({ circles_token: undefined, token: "legacy" }))).toBe("legacy");
    });

    test("returns undefined when every cookie value is empty", async () => {
        const cookie = await loadCookieModule("development");
        expect(cookie.readAuthToken(readerFor({ circles_token: "", token: "" }))).toBeUndefined();
    });

    test("only reads the token cookie in production", async () => {
        const cookie = await loadCookieModule("production");
        expect(cookie.readAuthToken(readerFor({ circles_token: "dev-only" }))).toBeUndefined();
        expect(cookie.readAuthToken(readerFor({ token: "prod-token" }))).toBe("prod-token");
    });

    test("queries the cookie store once per candidate name until a token is found", async () => {
        const cookie = await loadCookieModule("development");
        const requested: string[] = [];
        const store = {
            get: (name: string) => {
                requested.push(name);
                return name === "token" ? { value: "legacy" } : undefined;
            },
        };

        expect(cookie.readAuthToken(store)).toBe("legacy");
        expect(requested).toEqual(["circles_token", "token"]);
    });
});
