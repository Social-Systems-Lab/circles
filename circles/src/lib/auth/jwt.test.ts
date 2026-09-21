import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { SignJWT, decodeJwt, decodeProtectedHeader } from "jose";
import { setEnv, snapshotEnv } from "@/test/env";
import { useFakeNow } from "@/test/hooks";

const SECRET = "test-secret-with-enough-entropy-for-hs256";
const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

const cookieSet = mock((_name: string, _value: string, _options: Record<string, unknown>) => {});
mock.module("next/headers", () => ({
    cookies: async () => ({ set: cookieSet }),
}));

const restoreEnv = snapshotEnv("CIRCLES_JWT_SECRET", "JWT_SECRET", "CIRCLES_COOKIE_SECURE", "NODE_ENV");

// JWT_SECRET is read once when the module loads, so each secret configuration gets its own instance.
let instance = 0;
const loadJwtModule = async (env: { CIRCLES_JWT_SECRET?: string; JWT_SECRET?: string }) => {
    setEnv("CIRCLES_JWT_SECRET", env.CIRCLES_JWT_SECRET);
    setEnv("JWT_SECRET", env.JWT_SECRET);
    instance += 1;
    return (await import(`./jwt?instance=${instance}`)) as typeof import("./jwt");
};

beforeEach(() => {
    cookieSet.mockClear();
});

afterEach(() => {
    restoreEnv();
});

describe("JWT_SECRET", () => {
    test("prefers CIRCLES_JWT_SECRET over JWT_SECRET", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: "primary", JWT_SECRET: "fallback" });
        expect(jwt.JWT_SECRET).toBe("primary");
    });

    test("falls back to JWT_SECRET", async () => {
        const jwt = await loadJwtModule({ JWT_SECRET: "fallback" });
        expect(jwt.JWT_SECRET).toBe("fallback");
    });

    test("is undefined when neither variable is set", async () => {
        const jwt = await loadJwtModule({});
        expect(jwt.JWT_SECRET).toBeUndefined();
    });

    test("ignores an empty CIRCLES_JWT_SECRET in favor of JWT_SECRET", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: "", JWT_SECRET: "fallback" });
        expect(jwt.JWT_SECRET).toBe("fallback");
    });
});

describe("generateUserToken", () => {
    test("signs an HS256 JWT carrying the user did", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const token = await jwt.generateUserToken("did:user");

        expect(decodeProtectedHeader(token)).toEqual({ alg: "HS256", typ: "JWT" });
        expect(decodeJwt(token).userDid).toBe("did:user");
    });

    test("sets issued-at and not-before to now and expiry to 90 days later", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const claims = decodeJwt(await jwt.generateUserToken("did:user"));

        expect(claims.iat).toBe(NOW_SECONDS);
        expect(claims.nbf).toBe(NOW_SECONDS);
        expect(claims.exp).toBe(NOW_SECONDS + NINETY_DAYS_SECONDS);
    });

    test("does not add other registered claims", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const claims = decodeJwt(await jwt.generateUserToken("did:user"));

        expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "nbf", "userDid"]);
    });

    test("throws a descriptive error when no secret is configured", async () => {
        const jwt = await loadJwtModule({});
        await expect(jwt.generateUserToken("did:user")).rejects.toThrow(
            "Missing JWT secret: set CIRCLES_JWT_SECRET (or JWT_SECRET for local development).",
        );
    });
});

describe("verifyUserToken", () => {
    test("returns the payload of a token it generated", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const token = await jwt.generateUserToken("did:user");

        const payload = await jwt.verifyUserToken(token);

        expect(payload.userDid).toBe("did:user");
        expect(payload.exp).toBe(NOW_SECONDS + NINETY_DAYS_SECONDS);
    });

    test("rejects a token signed with a different secret", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const forged = await new SignJWT({ userDid: "did:user" })
            .setProtectedHeader({ alg: "HS256" })
            .sign(new TextEncoder().encode("another-secret"));

        await expect(jwt.verifyUserToken(forged)).rejects.toThrow();
    });

    test("rejects a token with a tampered payload", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const [header, , signature] = (await jwt.generateUserToken("did:user")).split(".");
        const forgedPayload = Buffer.from(JSON.stringify({ userDid: "did:admin" })).toString("base64url");

        await expect(jwt.verifyUserToken(`${header}.${forgedPayload}.${signature}`)).rejects.toThrow();
    });

    test("rejects an expired token", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const token = await jwt.generateUserToken("did:user");

        setSystemTime(new Date(NOW.getTime() + (NINETY_DAYS_SECONDS + 1) * 1000));

        await expect(jwt.verifyUserToken(token)).rejects.toThrow();
    });

    test("accepts a token until the moment before it expires", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const token = await jwt.generateUserToken("did:user");

        setSystemTime(new Date(NOW.getTime() + (NINETY_DAYS_SECONDS - 1) * 1000));

        expect((await jwt.verifyUserToken(token)).userDid).toBe("did:user");
    });

    test("rejects a token that is not yet valid", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const token = await jwt.generateUserToken("did:user");

        setSystemTime(new Date(NOW.getTime() - 60_000));

        await expect(jwt.verifyUserToken(token)).rejects.toThrow();
    });

    test("rejects malformed tokens", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        for (const token of ["", "abc", "a.b", "a.b.c"]) {
            await expect(jwt.verifyUserToken(token)).rejects.toThrow();
        }
    });

    test("rejects unsigned tokens", async () => {
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });
        const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
        const payload = Buffer.from(JSON.stringify({ userDid: "did:admin" })).toString("base64url");

        await expect(jwt.verifyUserToken(`${header}.${payload}.`)).rejects.toThrow();
    });

    test("throws a descriptive error when no secret is configured", async () => {
        const jwt = await loadJwtModule({});
        await expect(jwt.verifyUserToken("a.b.c")).rejects.toThrow("Missing JWT secret");
    });
});

describe("createSession", () => {
    test("stores the token in an http-only lax cookie valid for 90 days on the whole site", async () => {
        setEnv("CIRCLES_COOKIE_SECURE", undefined);
        setEnv("NODE_ENV", "development");
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });

        await jwt.createSession("the-token");

        expect(cookieSet).toHaveBeenCalledTimes(1);
        expect(cookieSet).toHaveBeenCalledWith("circles_token", "the-token", {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: NINETY_DAYS_SECONDS,
            path: "/",
        });
    });

    test("marks the cookie secure in production by default", async () => {
        setEnv("CIRCLES_COOKIE_SECURE", undefined);
        setEnv("NODE_ENV", "production");
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });

        await jwt.createSession("the-token");

        expect(cookieSet.mock.calls[0][2].secure).toBe(true);
    });

    test("lets CIRCLES_COOKIE_SECURE=true force secure cookies outside production", async () => {
        setEnv("CIRCLES_COOKIE_SECURE", "true");
        setEnv("NODE_ENV", "development");
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });

        await jwt.createSession("the-token");

        expect(cookieSet.mock.calls[0][2].secure).toBe(true);
    });

    test("lets CIRCLES_COOKIE_SECURE=false disable secure cookies in production", async () => {
        setEnv("CIRCLES_COOKIE_SECURE", "false");
        setEnv("NODE_ENV", "production");
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });

        await jwt.createSession("the-token");

        expect(cookieSet.mock.calls[0][2].secure).toBe(false);
    });

    test("treats any CIRCLES_COOKIE_SECURE value other than 'true' as insecure", async () => {
        setEnv("CIRCLES_COOKIE_SECURE", "1");
        setEnv("NODE_ENV", "production");
        const jwt = await loadJwtModule({ CIRCLES_JWT_SECRET: SECRET });

        await jwt.createSession("the-token");

        expect(cookieSet.mock.calls[0][2].secure).toBe(false);
    });

    test("does not need a JWT secret to store an already signed token", async () => {
        const jwt = await loadJwtModule({});

        await jwt.createSession("the-token");

        expect(cookieSet).toHaveBeenCalledTimes(1);
    });
});
