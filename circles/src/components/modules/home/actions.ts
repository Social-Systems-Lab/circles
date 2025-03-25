// actions.ts

"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { addMember, countAdmins, getMember, getMembers, removeMember } from "@/lib/data/member";
import { Circle, UserPrivate } from "@/models/models";
import { cookies } from "next/headers";
import { createPendingMembershipRequest, deletePendingMembershipRequest } from "@/lib/data/membership-requests";
import { getCircleById, getCirclePath, getCirclesByDids, updateCircle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, getAuthorizedMembers, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { saveFile } from "@/lib/data/storage";
import { revalidatePath } from "next/cache";
import { getUser, getUserById, getUserPrivate } from "@/lib/data/user";
import { notifyNewMember, sendNotifications } from "@/lib/data/matrix";

type CircleActionResponse = {
    success: boolean;
    message?: string;
    pending?: boolean;
    circle?: Circle;
};

export const getUserPrivateAction = async (): Promise<UserPrivate | undefined> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return undefined;
    }

    return await getUserPrivate(userDid);
};

export const followCircle = async (circle: Circle, answers?: Record<string, string>): Promise<CircleActionResponse> => {
    let isUser = circle?.circleType === "user";
    const token = (await cookies()).get("token")?.value;

    try {
        if (!token) {
            return { success: false, message: "You need to be logged in to follow a circle" };
        }

        let payload = await verifyUserToken(token);
        let userDid = payload.userDid as string;
        if (!userDid) {
            return { success: false, message: "Authentication failed" };
        }

        console.log(circle._id);

        // Fetch the latest circle data
        let updatedCircle = null;
        updatedCircle = await getCircleById(circle._id ?? "");

        if (!updatedCircle) {
            return { success: false, message: isUser ? "User not found" : "Circle not found" };
        }

        if (updatedCircle.isPublic) {
            // For public circles, add member directly
            await addMember(userDid, updatedCircle._id ?? "", ["members"], answers);

            // Notify members that user has followed
            await notifyNewMember(userDid, updatedCircle, true);

            return {
                success: true,
                message: isUser ? "You are now following user" : "You are now following circle",
                pending: false,
            };
        } else {
            // For private circles, create a membership request
            await createPendingMembershipRequest(userDid, updatedCircle._id ?? "", answers);

            // get access rules for circle feature
            let members = await getAuthorizedMembers(updatedCircle, features.manage_membership_requests);

            // send a notification to all users that have permission to accept requests
            let user = await getUser(userDid);
            await sendNotifications("follow_request", members, { circle: updatedCircle, user });

            return {
                success: true,
                message: isUser ? "Your follow request has been sent" : "Your request to follow has been sent",
                pending: true,
            };
        }
    } catch (error) {
        console.error("Failed to follow circle", error);
        return {
            success: false,
            message: (isUser ? "Failed to follow user" : "Failed to follow circle. ") + error?.toString(),
        };
    }
};

export const leaveCircle = async (circle: Circle): Promise<CircleActionResponse> => {
    let isUser = circle?.circleType === "user";
    const token = (await cookies()).get("token")?.value;

    try {
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
        return { success: true, message: isUser ? "You have unfollowed the user" : "You have unfollowed the circle" };
    } catch (error) {
        return {
            success: false,
            message: (isUser ? "Failed to unfollow user" : "Failed to unfollow circle. ") + error?.toString(),
        };
    }
};

export const cancelFollowRequest = async (circle: Circle): Promise<CircleActionResponse> => {
    const token = (await cookies()).get("token")?.value;

    try {
        if (!token) {
            return { success: false, message: "You need to be logged in to cancel a follow request" };
        }

        let payload = await verifyUserToken(token);
        let userDid = payload.userDid as string;
        if (!userDid) {
            return { success: false, message: "Authentication failed" };
        }

        await deletePendingMembershipRequest(userDid, circle._id ?? "");
        return { success: true, message: "Your follow request has been canceled" };
    } catch (error) {
        return { success: false, message: "Failed to cancel follow request. " + error?.toString() };
    }
};

export const updateUser = async (userId: string, formData: FormData): Promise<UserPrivate | undefined> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return undefined;
    }

    try {
        // Get current user
        const currentUser = await getUserById(userId);
        if (!currentUser || currentUser.did !== userDid) {
            // Only allow users to update their own profile
            return undefined;
        }

        let updateData: Partial<Circle> = { _id: userId };

        for (const [key, value] of formData.entries() as any) {
            if (key === "picture" || key === "cover") {
                let fileInfo = await saveFile(value, key, userId, true);
                updateData[key as keyof Circle] = fileInfo;
                revalidatePath(fileInfo.url);
            } else if (key === "location") {
                // Parse location JSON
                try {
                    updateData[key as keyof Circle] = JSON.parse(value as string);
                } catch (e) {
                    console.error("Failed to parse location data", e);
                }
            } else {
                updateData[key as keyof Circle] = value as string;
            }
        }

        await updateCircle(updateData);

        // Revalidate the profile path
        revalidatePath(`/circles/${currentUser.handle}`);

        // Get updated user data
        const updatedUser = await getUserPrivate(userDid);
        return updatedUser;
    } catch (error) {
        console.error("Failed to update user", error);
        return undefined;
    }
};

export const updateCircleField = async (circleId: string, formData: FormData): Promise<CircleActionResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    try {
        let authorized = await isAuthorized(userDid, circleId, features.settings_edit);
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        let updateData: Partial<Circle> = { _id: circleId };

        for (const [key, value] of formData.entries() as any) {
            if (key === "picture" || key === "cover") {
                let fileInfo = await saveFile(value, key, circleId, true);
                updateData[key as keyof Circle] = fileInfo;
                revalidatePath(fileInfo.url);
            } else if (key === "location") {
                // Parse location JSON
                try {
                    updateData[key as keyof Circle] = JSON.parse(value as string);
                } catch (e) {
                    console.error("Failed to parse location data", e);
                }
            } else {
                updateData[key as keyof Circle] = value as string;
            }
        }

        await updateCircle(updateData);

        let circlePath = await getCirclePath({ _id: circleId } as Circle);
        revalidatePath(circlePath);

        // get circle
        let circle = await getCircleById(circleId);

        return { success: true, message: `Circle updated successfully`, circle };
    } catch (error) {
        return { success: false, message: `Failed to update circle. ${error}` };
    }
};
