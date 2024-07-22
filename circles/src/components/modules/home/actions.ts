// actions.ts

"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { addMember, countAdmins, getMember, removeMember } from "@/lib/data/member";
import { Circle } from "@/models/models";
import { cookies } from "next/headers";
import { createMembershipRequest, deleteMembershipRequest } from "@/lib/data/membership-requests";
import { getCircleById } from "@/lib/data/circle";

type CircleActionResponse = {
    success: boolean;
    message?: string;
};

export const joinCircle = async (circle: Circle): Promise<CircleActionResponse> => {
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

        // Fetch the latest circle data
        const updatedCircle = await getCircleById(circle._id ?? "");
        if (!updatedCircle) {
            return { success: false, message: "Circle not found" };
        }

        if (updatedCircle.isPublic) {
            // For public circles, add member directly
            await addMember(userDid, updatedCircle._id ?? "", ["members"]);
            return { success: true, message: "You have joined the circle" };
        } else {
            // For private circles, create a membership request
            await createMembershipRequest(userDid, updatedCircle._id ?? "");
            return { success: true, message: "Your request to join has been sent" };
        }
    } catch (error) {
        return { success: false, message: "Failed to join circle. " + error?.toString() };
    }
};

export const leaveCircle = async (circle: Circle): Promise<CircleActionResponse> => {
    try {
        const token = cookies().get("token")?.value;
        if (!token) {
            return { success: false, message: "You need to be logged in to leave a circle" };
        }

        let payload = await verifyUserToken(token);
        let userDid = payload.userDid as string;
        if (!userDid) {
            return { success: false, message: "Authentication failed" };
        }

        // make sure last admin doesn't leave
        let member = await getMember(userDid, circle._id ?? "");
        if (!member) {
            throw new Error("Member not found");
        }
        const isAdmin = member.userGroups?.includes("admins");
        if (isAdmin) {
            const adminCount = await countAdmins(circle._id ?? "");
            if (adminCount <= 1) {
                return { success: false, message: "Cannot leave as last admin." };
            }
        }
        await removeMember(userDid, circle._id ?? "");
        return { success: true, message: "You have left the circle" };
    } catch (error) {
        return { success: false, message: "Failed to leave circle. " + error?.toString() };
    }
};

export const cancelJoinRequest = async (circle: Circle): Promise<CircleActionResponse> => {
    try {
        const token = cookies().get("token")?.value;
        if (!token) {
            return { success: false, message: "You need to be logged in to cancel a join request" };
        }

        let payload = await verifyUserToken(token);
        let userDid = payload.userDid as string;
        if (!userDid) {
            return { success: false, message: "Authentication failed" };
        }

        await deleteMembershipRequest(userDid, circle._id ?? "");
        return { success: true, message: "Your join request has been canceled" };
    } catch (error) {
        return { success: false, message: "Failed to cancel join request. " + error?.toString() };
    }
};
