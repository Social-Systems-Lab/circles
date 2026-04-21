// jwt.ts
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies, headers } from "next/headers";
import { AUTH_COOKIE_NAME, shouldUseSecureAuthCookie } from "./cookie";

export const JWT_SECRET = process.env.CIRCLES_JWT_SECRET || process.env.JWT_SECRET;

const getJwtSecretBytes = (): Uint8Array => {
    if (!JWT_SECRET) {
        throw new Error("Missing JWT secret: set CIRCLES_JWT_SECRET (or JWT_SECRET for local development).");
    }
    return new TextEncoder().encode(JWT_SECRET);
};

export const verifyUserToken = async (token: string): Promise<JWTPayload> => {
    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    return payload;
};

export const createSession = async (token: string) => {
    const headerStore = await headers();
    const host = headerStore.get("host");
    const protocol = headerStore.get("x-forwarded-proto");

    // create a cookie-based session
    (await cookies()).set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: shouldUseSecureAuthCookie(host, protocol),
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 90, // 90 days
        path: "/",
    });
};

export const generateUserToken = async (did: string): Promise<string> => {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 24 * 60 * 60 * 90; // 90 days

    return new SignJWT({ userDid: did })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(exp)
        .setIssuedAt(iat)
        .setNotBefore(iat)
        .sign(getJwtSecretBytes());
};
