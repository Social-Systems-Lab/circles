// actions.ts

"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { addMember, countAdmins, getMember, removeMember } from "@/lib/data/member";
import { Circle } from "@/models/models";
import { cookies } from "next/headers";
import { createPendingMembershipRequest, deletePendingMembershipRequest } from "@/lib/data/membership-requests";
import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { saveFile } from "@/lib/data/storage";
import { revalidatePath } from "next/cache";
import { getUserById, updateUser } from "@/lib/data/user";

type CircleActionResponse = {
    success: boolean;
    message?: string;
    pending?: boolean;
};

export const joinCircle = async (circle: Circle, answers?: Record<string, string>): Promise<CircleActionResponse> => {
    let isUser = circle?.circleType === "user";

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
        let updatedCircle = null;
        if (isUser) {
            updatedCircle = await getUserById(circle._id ?? "");
        } else {
            updatedCircle = await getCircleById(circle._id ?? "");
        }
        if (!updatedCircle) {
            return { success: false, message: isUser ? "User not found" : "Circle not found" };
        }

        if (updatedCircle.isPublic) {
            // For public circles, add member directly
            await addMember(userDid, updatedCircle._id ?? "", ["members"], answers, isUser);
            return {
                success: true,
                message: isUser ? "You have added user as friend" : "You have joined the circle",
                pending: false,
            };
        } else {
            // For private circles, create a membership request
            await createPendingMembershipRequest(userDid, updatedCircle._id ?? "", answers);
            return {
                success: true,
                message: isUser ? "Your friendship request has been sent" : "Your request to join has been sent",
                pending: true,
            };
        }
    } catch (error) {
        return {
            success: false,
            message: (isUser ? "Failed to add friend" : "Failed to join circle. ") + error?.toString(),
        };
    }
};

export const leaveCircle = async (circle: Circle): Promise<CircleActionResponse> => {
    let isUser = circle?.circleType === "user";

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
        await removeMember(userDid, circle._id ?? "", isUser);
        return { success: true, message: isUser ? "You have unfriended the user" : "You have left the circle" };
    } catch (error) {
        return {
            success: false,
            message: (isUser ? "Failed to unfriend user" : "Failed to leave circle. ") + error?.toString(),
        };
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

        await deletePendingMembershipRequest(userDid, circle._id ?? "");
        return { success: true, message: "Your join request has been canceled" };
    } catch (error) {
        return { success: false, message: "Failed to cancel join request. " + error?.toString() };
    }
};

export const updateCircleField = async (
    circleId: string,
    formData: FormData,
    isUser?: boolean,
): Promise<CircleActionResponse> => {
    try {
        const userDid = await getAuthenticatedUserDid();
        let authorized = await isAuthorized(userDid, circleId, features.settings_edit, isUser);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        let updateData: Partial<Circle> = { _id: circleId };

        for (const [key, value] of formData.entries() as any) {
            if (key === "picture" || key === "cover") {
                let fileInfo = await saveFile(value, key, circleId, true);
                updateData[key as keyof Circle] = fileInfo;
                revalidatePath(fileInfo.url);
            } else {
                updateData[key as keyof Circle] = value as string;
            }
        }

        if (isUser) {
            await updateUser(updateData);
        } else {
            await updateCircle(updateData);
        }

        let circlePath = await getCirclePath({ _id: circleId, circleType: isUser ? "user" : "circle" } as Circle);
        revalidatePath(circlePath);

        return { success: true, message: `Circle updated successfully` };
    } catch (error) {
        return { success: false, message: `Failed to update circle. ${error}` };
    }
};
