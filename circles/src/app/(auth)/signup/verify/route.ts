import { NextRequest, NextResponse } from "next/server";
import { isPendingRegistrationEnabled, verifyPendingRegistrationEmail } from "@/lib/auth/pending-registration";
import { createPendingRegistrationRuntimeDependencies } from "@/lib/auth/pending-registration-runtime";
import { isRegistrationModeAllowed } from "@/lib/auth/registration-routing";

const VERIFIED_COOKIE = "__Host-kamooni-verified-registration";

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token");
    const safeFailure = () => {
        const response = NextResponse.redirect(new URL("/signup?verification=invalid", request.url), 303);
        setPrivateHeaders(response);
        response.cookies.set(VERIFIED_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
        return response;
    };
    if (
        !isPendingRegistrationEnabled() ||
        !(await isRegistrationModeAllowed("pending")) ||
        !token ||
        token.length > 256
    ) {
        return safeFailure();
    }
    try {
        const deps = await createPendingRegistrationRuntimeDependencies();
        const result = await verifyPendingRegistrationEmail(token, deps);
        if (!result.success || !result.pendingRegistrationId || !result.verifiedContinuationSecret)
            return safeFailure();
        const response = NextResponse.redirect(new URL("/signup/continue", request.url), 303);
        setPrivateHeaders(response);
        response.cookies.set(VERIFIED_COOKIE, `${result.pendingRegistrationId}.${result.verifiedContinuationSecret}`, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: 30 * 60,
        });
        return response;
    } catch {
        return safeFailure();
    }
}

function setPrivateHeaders(response: NextResponse) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
}
