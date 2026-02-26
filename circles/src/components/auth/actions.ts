// actions.ts
"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { getUserPrivate } from "@/lib/data/user";
import { Challenge, UserPrivate } from "@/models/models";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

type CheckAuthResponse = {
    user?: UserPrivate;
    authenticated: boolean;
    challenge?: Challenge;
};

export async function checkAuth(): Promise<CheckAuthResponse> {
    const token = (await cookies()).get("token")?.value;

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
    (await cookies()).set("token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });

    // clear cache
    revalidatePath(`/`);
}
