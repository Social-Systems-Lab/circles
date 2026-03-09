// actions.ts
"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { getUserPrivate } from "@/lib/data/user";
import { Challenge, UserPrivate } from "@/models/models";
import { getAuthCookieNamesForClearing, readAuthToken } from "@/lib/auth/cookie";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

type CheckAuthResponse = {
    user?: UserPrivate;
    authenticated: boolean;
    challenge?: Challenge;
};

export async function checkAuth(): Promise<CheckAuthResponse> {
    const token = readAuthToken(await cookies());

    try {
        if (token) {
            let payload = await verifyUserToken(token);
            if (payload) {
                // user is authenticated
                let user = await getUserPrivate(payload.userDid as string);

                return { user, authenticated: true };
            }
        }
    } catch (error) {
        console.error("Error verifying token", error);
    }

    return { user: undefined, authenticated: false };
}

export async function logOut(): Promise<void> {
    // clear session
    const cookieStore = await cookies();
    for (const cookieName of getAuthCookieNamesForClearing()) {
        cookieStore.set(cookieName, "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });
    }

    // clear cache
    revalidatePath(`/`);
}
