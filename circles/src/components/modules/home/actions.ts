"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { addMember } from "@/lib/data/member";
import { Circle } from "@/models/models";
import { cookies } from "next/headers";

type JoinCircleResponse = {
    success: boolean;
    message?: string;
};

export const joinCircle = async (circle: Circle): Promise<JoinCircleResponse> => {
    try {
        const token = cookies().get("token")?.value;
        if (!token) {
            return { success: false, message: "You need to be logged in to join a circle" };
        }

        let payload = await verifyUserToken(token);
        let userDid = payload.userDid as string;
        if (!userDid) {
            return { success: false, message: "Authentication failed" };
        }

        // add member to circle
        await addMember(userDid, circle._id ?? "", ["members"]);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to join circle. " + error?.toString() };
    }
};
