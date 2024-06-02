import { verifyUserToken } from "@/lib/auth/jwt";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    let authorized = false;

    console.log("Middleware invoked");
    console.log("Path:", request.nextUrl.pathname);

    try {
        const token = request.cookies.get("token")?.value;
        console.log("token", token);
        if (token) {
            await verifyUserToken(token);
            authorized = true;
        }
    } catch (error) {
        console.error("Error verifying token", error);
    }

    // TODO get access rules for the path
    //let response = await fetch("http://localhost:3000/api/access-rules");

    // TODO check if user is authorized to access the path

    // TODO redirect to different pages: "you need to be logged in to see this page" OR
    // "you are not authorized to see this page"

    if (!authorized) {
        console.log("Unauthorized request to", request.nextUrl.pathname);
        const redirectUrl = new URL("/unauthenticated", request.url);
        redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
        return Response.redirect(redirectUrl);
    } else {
        console.log("Authorized request to", request.nextUrl.pathname);
    }
}

export const config = {
    matcher: ["/((?!api|logged-out|login|unauthorized|unauthenticated|signup|_next/static|_next/image|.*\\.png$).*)"],
};
