import { verifyUserToken } from "@/lib/jwt";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    let authorized = false;
    console.log("Middleware invoked");
    try {
        const token = request.cookies.get("token")?.value;
        console.log("token", token);
        if (token) {
            authorized = await verifyUserToken(token);
        }
    } catch (error) {
        console.error("Error verifying token", error);
    }

    if (!authorized) {
        console.log("Unauthorized request to", request.nextUrl.pathname);

        if (request.nextUrl.pathname !== "/login" && request.nextUrl.pathname !== "/signup") {
            return Response.redirect(new URL("/login", request.url));
        }
    } else {
        console.log("Authorized request to", request.nextUrl.pathname);
    }
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
