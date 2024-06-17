"use server";

import { hasHigherAccess, isAuthorized } from "@/lib/auth/auth";
import { verifyUserToken } from "@/lib/auth/jwt";
import { features } from "@/lib/data/constants";
import { removeMember } from "@/lib/data/member";
import { Circle, MemberDisplay } from "@/models/models";
import { cookies } from "next/headers";

type RemoveMemberResponse = {
    success: boolean;
    message?: string;
};

export const removeMemberAction = async (member: MemberDisplay, circle: Circle): Promise<RemoveMemberResponse> => {
    try {
        const token = cookies().get("token")?.value;
        if (!token) {
            return { success: false, message: "Authentication failed" };
        }

        let payload = await verifyUserToken(token);
        let userDid = payload.userDid as string;
        if (!userDid) {
            return { success: false, message: "Authentication failed" };
        }

        // confirm the user is authorized to remove member
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.remove_lower_members);
        if (!authorized) {
            return { success: false, message: "You are not authorized to remove this member" };
        }
        authorized = await hasHigherAccess(userDid, member.userDid, circle._id ?? "");
        if (!authorized) {
            return { success: false, message: "You don't have high enough access to remove this member" };
        }

        // add member to circle
        await removeMember(member.userDid, circle._id ?? "");
        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to remove member. " + error?.toString() };
    }
};
