import { verifyUserToken } from "@/lib/auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

    if (isMaintenanceMode) {
        const maintenanceBypassPrefixes = ["/holding"];
        const isBypassed = maintenanceBypassPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

        if (!isBypassed) {
            const redirectUrl = new URL("/holding", request.url);
            redirectUrl.searchParams.set("redirectTo", pathname);
            return Response.redirect(redirectUrl);
        }
    }

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

        // If a user has an old/invalid cookie (e.g. after a deploy or secret change),
        // clear it automatically and reload the same URL once.
        const res = NextResponse.redirect(request.nextUrl);
        res.cookies.set("token", "", { maxAge: 0, path: "/" });
        return res;
    }

    // get circle handle and module handle from url
    const urlSegments = request.nextUrl.pathname?.split("/")?.filter(Boolean);
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

            // Exempt in-circle error pages from access checks to avoid redirect loops
            if (moduleHandle === "access-denied" || moduleHandle === "not-found") {
                return;
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
        const { authenticated, authorized, notFound, notFoundType, error } = await response.json();
        if (error) {
            return redirectToErrorPage(request);
        }
        if (notFound) {
            // If the circle itself is missing, use global not-found.
            if (notFoundType === "circle") {
                return redirectToNotFound(request);
            }
            // Otherwise, show the in-circle not-found page.
            return redirectToCircleNotFound(request, circleHandle, moduleHandle);
        }
        if (!authenticated) {
            // Show in-circle access denied for unauthenticated users.
            return redirectToCircleAccessDenied(request, circleHandle, moduleHandle, "unauthenticated");
        }
        if (!authorized) {
            // Show in-circle access denied for authenticated users lacking permission.
            return redirectToCircleAccessDenied(request, circleHandle, moduleHandle, "unauthorized");
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

function redirectToCircleAccessDenied(
    request: NextRequest,
    circleHandle: string,
    moduleHandle: string,
    reason: "unauthenticated" | "unauthorized",
) {
    const redirectUrl = new URL(`/circles/${circleHandle}/access-denied`, request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    redirectUrl.searchParams.set("module", moduleHandle);
    redirectUrl.searchParams.set("reason", reason);
    return Response.redirect(redirectUrl);
}

function redirectToCircleNotFound(request: NextRequest, circleHandle: string, moduleHandle: string) {
    const redirectUrl = new URL(`/circles/${circleHandle}/not-found`, request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    redirectUrl.searchParams.set("module", moduleHandle);
    return Response.redirect(redirectUrl);
}

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|robots.txt|sitemap.xml|favicon.ico|.*\\.(?:css|js|json|txt|svg|jpg|jpeg|png|gif|webp|ico|pdf|mp4|webm|ogg|woff|woff2|ttf|eot|webmanifest)$).*)",
    ],
};