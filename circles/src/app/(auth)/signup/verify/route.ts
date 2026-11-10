import { NextRequest, NextResponse } from "next/server";
import { isPendingRegistrationEnabled, verifyPendingRegistrationEmail } from "@/lib/auth/pending-registration";
import { createPendingRegistrationRuntimeDependencies } from "@/lib/auth/pending-registration-runtime";
import { isRegistrationModeAllowed } from "@/lib/auth/registration-routing";
import {
    buildPendingRegistrationRedirectUrl,
    requirePendingRegistrationPublicOrigin,
} from "@/lib/auth/pending-registration-public-origin";

const VERIFIED_COOKIE = "__Host-kamooni-verified-registration";
const VERIFIED_COOKIE_MAX_AGE_SECONDS = 30 * 60;

function verifiedCookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        secure: true,
        sameSite: "lax" as const,
        path: "/",
        maxAge,
    };
}

function clearVerifiedCookie(response: NextResponse) {
    response.cookies.set(VERIFIED_COOKIE, "", verifiedCookieOptions(0));
}

export async function GET(request: NextRequest) {
    let publicOrigin: string;
    try {
        publicOrigin = requirePendingRegistrationPublicOrigin();
    } catch {
        const response = new NextResponse(null, { status: 500 });
        setPrivateHeaders(response);
        clearVerifiedCookie(response);
        return response;
    }
    const token = request.nextUrl.searchParams.get("token");
    const safeFailure = () => {
        const response = NextResponse.redirect(
            buildPendingRegistrationRedirectUrl("/signup?verification=invalid", publicOrigin),
            303,
        );
        setPrivateHeaders(response);
        clearVerifiedCookie(response);
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
        const response = NextResponse.redirect(
            buildPendingRegistrationRedirectUrl("/signup/continue", publicOrigin),
            303,
        );
        setPrivateHeaders(response);
        response.cookies.set(
            VERIFIED_COOKIE,
            `${result.pendingRegistrationId}.${result.verifiedContinuationSecret}`,
            verifiedCookieOptions(VERIFIED_COOKIE_MAX_AGE_SECONDS),
        );
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
