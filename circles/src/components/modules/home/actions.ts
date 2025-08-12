"use server";

import { verifyUserToken } from "@/lib/auth/jwt";
import { addMember, countAdmins, getMember, removeMember } from "@/lib/data/member";
import { ChatRoom, Circle, UserPrivate } from "@/models/models";
import { cookies } from "next/headers";
import { createPendingMembershipRequest, deletePendingMembershipRequest } from "@/lib/data/membership-requests";
import { getCircleById, getCirclePath, updateCircle, getCircleByDid } from "@/lib/data/circle";
import { getAuthenticatedUserDid, getAuthorizedMembers, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { saveFile } from "@/lib/data/storage";
import { revalidatePath } from "next/cache";
import { getUser, getUserById, getUserPrivate } from "@/lib/data/user";
import { notifyNewMember, sendNotifications } from "@/lib/data/matrix";
import { findOrCreateDMRoom as findOrCreateDMRoomData } from "@/lib/data/chat";

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

        let updatedCircle = await getCircleById(circle._id ?? "");

        if (!updatedCircle) {
            return { success: false, message: isUser ? "User not found" : "Circle not found" };
        }

        if (updatedCircle.isPublic) {
            await addMember(userDid, updatedCircle._id ?? "", ["members"], answers);
            await notifyNewMember(userDid, updatedCircle, true);

            return {
                success: true,
                message: isUser ? "You are now following user" : "You are now following circle",
                pending: false,
            };
        } else {
            await createPendingMembershipRequest(userDid, updatedCircle._id ?? "", answers);
            let members = await getAuthorizedMembers(updatedCircle, features.general.manage_membership_requests);
            let user = await getUser(userDid);
            const recipientUsers: UserPrivate[] = [];
            for (const memberCircle of members) {
                if (memberCircle.did) {
                    const userPrivate = await getUserPrivate(memberCircle.did);
                    if (userPrivate) {
                        recipientUsers.push(userPrivate);
                    }
                }
            }
            await sendNotifications("follow_request", recipientUsers, { circle: updatedCircle, user });

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
        const currentUser = await getUserById(userId);
        if (!currentUser || currentUser.did !== userDid) {
            return undefined;
        }

        let updateData: Partial<Circle> = { _id: userId };

        for (const [key, value] of formData.entries() as any) {
            if (key === "picture" || key === "cover") {
                let fileInfo = await saveFile(value, key, userId, true);
                updateData[key as keyof Circle] = fileInfo;
                revalidatePath(fileInfo.url);
            } else if (key === "location") {
                try {
                    updateData[key as keyof Circle] = JSON.parse(value as string);
                } catch (e) {
                    console.error("Failed to parse location data", e);
                }
            } else {
                updateData[key as keyof Circle] = value as string;
            }
        }

        await updateCircle(updateData, userDid);
        revalidatePath(`/circles/${currentUser.handle}`);
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
        let authorized = await isAuthorized(userDid, circleId, features.settings.edit_about);
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
                try {
                    updateData[key as keyof Circle] = JSON.parse(value as string);
                } catch (e) {
                    console.error("Failed to parse location data", e);
                }
            } else {
                updateData[key as keyof Circle] = value as string;
            }
        }

        await updateCircle(updateData, userDid);
        let circlePath = await getCirclePath({ _id: circleId } as Circle);
        revalidatePath(circlePath);
        let circle = await getCircleById(circleId);

        return { success: true, message: `Circle updated successfully`, circle };
    } catch (error) {
        return { success: false, message: `Failed to update circle. ${error}` };
    }
};

export async function findOrCreateDMRoom(recipient: Circle): Promise<ChatRoom | null> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            throw new Error("User not authenticated");
        }

        const user = await getCircleByDid(userDid);
        if (!user) {
            throw new Error("User not found");
        }

        const room = await findOrCreateDMRoomData(user, recipient);
        return room;
    } catch (error) {
        console.error("Error finding or creating DM room:", error);
        return null;
    }
}
