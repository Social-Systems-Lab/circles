import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

export const JWT_SECRET = process.env.CIRCLES_JWT_SECRET;

export const verifyUserToken = async (token: string): Promise<JWTPayload> => {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return payload;
};

export const createSession = async (token: string) => {
    // create a cookie-based session
    (await cookies()).set("token", token, {
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
