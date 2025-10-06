"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";

export async function getAuthenticatedUserDidAction(): Promise<string | undefined> {
    return await getAuthenticatedUserDid();
}
