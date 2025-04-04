import { verifyUserToken } from "@/lib/auth/jwt";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    return;
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

    // get circle handle and module handle from url
    const urlSegments = request.nextUrl.pathname.split("/").filter(Boolean);
    let circleHandle = "";
    let moduleHandle = "";
    if (urlSegments.length === 0) {
        // route: /
        moduleHandle = "";
        return;
    } else if (urlSegments[0] === "circles") {
        circleHandle = urlSegments[1];
        if (urlSegments.length === 1) {
            // route: /circles
            moduleHandle = "circles";
        } else if (urlSegments.length === 2) {
            // Default to feed module if no module specified
            moduleHandle = "feed";
        } else if (urlSegments.length >= 3) {
            // route: /circles/<circle-handle>/<module-handle>
            moduleHandle = urlSegments[2];

            // Special case for post view routes
            if (moduleHandle === "post" && urlSegments.length >= 4) {
                // For post routes, use 'feed' as the module handle for permission checking
                // This ensures post viewing uses the same permissions as feed viewing
                moduleHandle = "feed";
            }

            // Special case for project view routes
            if (moduleHandle === "project" && urlSegments.length >= 4) {
                // For project routes, use 'projects' as the module handle for permission checking
                // This ensures project viewing uses the same permissions as project viewing
                moduleHandle = "projects";
            }
        }
    } else {
        // route: /<module-handle>
        moduleHandle = urlSegments[0];
        return;
    }

    // fetch access rules for specified circle and module
    try {
        const response = await fetch(`http://${host}:${port}/api/access`, {
            method: "POST",
            body: JSON.stringify({ userDid, circleHandle, moduleHandle }),
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
        "/((?!api|explore|map|chat|settings|logged-out|foryou|login|unauthorized|unauthenticated|error|not-found|signup|demo/moviedb|demo/tech|demo/ratings|public/images|_next/static|robots.txt|sitemap.xml|favicon.ico|_next/image|.*\\.svg|.*\\.jpg|.*\\.png$).*)",
    ],
};
