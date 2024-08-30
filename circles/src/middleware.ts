import { verifyUserToken } from "@/lib/auth/jwt";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    let userDid = undefined;

    // determine host and port based on environment
    const host = process.env.NODE_ENV === "production" ? process.env.CIRCLES_HOST : "localhost";
    const port = process.env.CIRCLES_PORT || 3000;

    if (process.env.NODE_ENV === "development") {
        console.log("Requesting access to", request.url);
    }

    try {
        const token = request.cookies.get("token")?.value;
        if (token) {
            let payload = await verifyUserToken(token);
            userDid = payload.userDid;
        }
    } catch (error) {
        console.error("Error verifying token", error);
    }

    // get circle handle and page handle from url
    const urlSegments = request.nextUrl.pathname.split("/").filter(Boolean);
    let circleHandle = "";
    let pageHandle = "";
    if (urlSegments.length === 0) {
        // route: /
        pageHandle = "";
    } else if (urlSegments[0] === "circles") {
        circleHandle = urlSegments[1];
        if (urlSegments.length === 1) {
            // route: /circles
            pageHandle = "circles";
        } else if (urlSegments.length === 2) {
            // route: /circles/<circle-handle>
            pageHandle = "";
        } else if (urlSegments.length >= 3) {
            // route: /circles/<circle-handle>/<page-handle>
            pageHandle = urlSegments[2];
        }
    } else {
        // route: /<page-handle>
        pageHandle = urlSegments[0];
    }

    // fetch access rules for specified circle and page
    try {
        const response = await fetch(`http://${host}:${port}/api/access`, {
            method: "POST",
            body: JSON.stringify({ userDid, circleHandle, pageHandle }),
            headers: {
                "Content-Type": "application/json",
            },
        });
        const { authenticated, authorized, notFound, error } = await response.json();
        if (error) {
            return redirectToErrorPage(request);
        }
        if (notFound) {
            return redirectToNotFound(request);
        }
        if (!authenticated) {
            return redirectToUnauthenticated(request);
        }
        if (!authorized) {
            return redirectToUnauthorized(request);
        }
    } catch (error) {
        return redirectToErrorPage(request);
    }
}

function redirectToNotFound(request: NextRequest) {
    const redirectUrl = new URL("/not-found", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return Response.redirect(redirectUrl);
}

function redirectToUnauthorized(request: NextRequest) {
    const redirectUrl = new URL("/unauthorized", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return Response.redirect(redirectUrl);
}

function redirectToUnauthenticated(request: NextRequest) {
    const redirectUrl = new URL("/unauthenticated", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return Response.redirect(redirectUrl);
}

function redirectToErrorPage(request: NextRequest) {
    const redirectUrl = new URL("/error", request.url);
    return Response.redirect(redirectUrl);
}

export const config = {
    matcher: [
        "/((?!api|logged-out|login|unauthorized|unauthenticated|error|not-found|signup|public/images|_next/static|robots.txt|sitemap.xml|favicon.ico|_next/image|.*\\.png$).*)",
    ],
};
