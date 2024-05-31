import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

export const JWT_SECRET = "temp_7S7mVe6S1K6Q"; // TODO get from environment variable

export const verifyUserToken = async (token: string): Promise<boolean> => {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return true;
};

export const createSession = async (token: string) => {
    // create a cookie-based session
    cookies().set("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7, // One week
        path: "/",
    });
};

export const generateUserToken = async (did: string, email: string): Promise<string> => {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 24 * 60 * 60; // 24 hours

    return new SignJWT({ userDid: did, email: email })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(exp)
        .setIssuedAt(iat)
        .setNotBefore(iat)
        .sign(new TextEncoder().encode(JWT_SECRET));
};
