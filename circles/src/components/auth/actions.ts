"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { getUser } from "@/lib/data/user";
import { User } from "@/models/models";
import { cookies } from "next/headers";

type CheckAuthResponse = {
    user?: User;
    authenticated: boolean;
};

export async function checkAuth(): Promise<CheckAuthResponse> {
    try {
        const token = cookies().get("token")?.value;
        if (!token) {
            return { user: undefined, authenticated: false };
        }

        let payload = await verifyUserToken(token);
        let userDid = payload.userDid;
        if (!userDid) {
            return { user: undefined, authenticated: false };
        }

        // get user data from database
        let user = await getUser(userDid as string);
        if (!user) {
            return { user: undefined, authenticated: false };
        }

        return { user, authenticated: true };
    } catch (error) {
        console.error("Error verifying token", error);
        return { user: undefined, authenticated: false };
    }
}

export async function logOut(): Promise<void> {
    // clear session
    cookies().set("token", "", { maxAge: 0 });
}
