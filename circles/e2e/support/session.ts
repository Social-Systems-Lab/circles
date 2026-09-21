/**
 * Authentication for e2e tests.
 *
 * Tests do not drive the login form. They mint the same session token the application issues and hand
 * it to the browser as a cookie, which is the approach Playwright recommends for authentication that is
 * not itself under test: it is fast, it cannot flake on form rendering, and — unlike a "skip auth in
 * test mode" flag — it adds no bypass branch to production code. The middleware, the route handlers and
 * the server actions all verify the token exactly as they do for a real visitor.
 *
 * The login form is still exercised, by the tests that are actually about logging in.
 */

import { SignJWT } from "jose";
import type { BrowserContext, Cookie } from "@playwright/test";
import { BASE_URL, JWT_SECRET } from "./env";

/**
 * The session cookie the application reads.
 *
 * src/lib/auth/cookie.ts reads `circles_token` outside production and `token` in it, and always accepts
 * `token` as a legacy fallback. Writing `token` therefore authenticates against a server started with
 * either `next dev` or `next start`, so one stored session works for both.
 */
export const SESSION_COOKIE_NAME = "token";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 90;

/** Mirrors `generateUserToken` in src/lib/auth/jwt.ts. */
export const createSessionToken = async (userDid: string): Promise<string> => {
    const issuedAt = Math.floor(Date.now() / 1000);

    return new SignJWT({ userDid })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(issuedAt + SESSION_LIFETIME_SECONDS)
        .setIssuedAt(issuedAt)
        .setNotBefore(issuedAt)
        .sign(new TextEncoder().encode(JWT_SECRET));
};

export const createSessionCookie = async (userDid: string): Promise<Cookie> => {
    const url = new URL(BASE_URL);

    return {
        name: SESSION_COOKIE_NAME,
        value: await createSessionToken(userDid),
        domain: url.hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
    };
};

/** A Playwright `storageState` value that signs the browser in as `userDid`. */
export const createStorageState = async (userDid: string) => ({
    cookies: [await createSessionCookie(userDid)],
    origins: [],
});

/** Signs an already-open context in. For tests that create their own user mid-test. */
export const signIn = async (context: BrowserContext, userDid: string): Promise<void> => {
    await context.addCookies([await createSessionCookie(userDid)]);
};

export const signOut = async (context: BrowserContext): Promise<void> => {
    await context.clearCookies();
};
