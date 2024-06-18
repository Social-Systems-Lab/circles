"use server";

import { getMemberAccessLevel, hasHigherAccess, isAuthorized } from "@/lib/auth/auth";
import { verifyUserToken } from "@/lib/auth/jwt";
import { getCircleById, getCirclePath } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { getMember, removeMember, updateMemberUserGroups } from "@/lib/data/member";
import { safeModifyAccessRules, safeModifyMemberUserGroups } from "@/lib/utils";
import { Circle, MemberDisplay, Page } from "@/models/models";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

type RemoveMemberResponse = {
    success: boolean;
    message?: string;
};

export const removeMemberAction = async (
    member: MemberDisplay,
    circle: Circle,
    page: Page,
): Promise<RemoveMemberResponse> => {
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
        let canRemoveSameLevel = await isAuthorized(userDid, circle._id ?? "", features.edit_same_level_user_groups);

        if (!authorized && !canRemoveSameLevel) {
            return { success: false, message: "You are not authorized to remove this member" };
        }
        authorized = await hasHigherAccess(userDid, member.userDid, circle._id ?? "", canRemoveSameLevel);
        if (!authorized) {
            return { success: false, message: "You don't have high enough access to remove this member" };
        }

        // add member to circle
        await removeMember(member.userDid, circle._id ?? "");

        // clear page cache so page update
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}${page?.handle}`);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to remove member. " + error?.toString() };
    }
};

type UpdateUserGroupsResponse = {
    success: boolean;
    message?: string;
};

export const updateUserGroupsAction = async (
    member: MemberDisplay,
    circle: Circle,
    newGroups: string[],
    page: Page,
): Promise<UpdateUserGroupsResponse> => {
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

        // confirm the user is authorized to edit user groups
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.edit_lower_user_groups);
        let canEditSameLevel = await isAuthorized(userDid, circle._id ?? "", features.edit_same_level_user_groups);
        if (!authorized && !canEditSameLevel) {
            return { success: false, message: "You are not authorized to edit user groups" };
        }

        // confirm the user has higher access than the member
        authorized = await hasHigherAccess(userDid, member.userDid, circle._id ?? "", canEditSameLevel);
        if (!authorized) {
            return { success: false, message: "You don't have high enough access to edit this member's user groups" };
        }

        // validate new user groups to ensure they all have lower access level than the current user
        let userAccessLevel = await getMemberAccessLevel(userDid, circle._id ?? "");

        // get current user groups of the member
        const existingMember = await getMember(member.userDid, circle._id ?? "");
        if (!existingMember) {
            throw new Error("Member not found");
        }

        const existingCircle = await getCircleById(circle?._id ?? "");
        if (!existingCircle) {
            throw new Error("Circle not found");
        }
        const newUserGroups = safeModifyMemberUserGroups(
            existingMember.userGroups ?? [],
            newGroups,
            existingCircle,
            userAccessLevel,
            canEditSameLevel,
        );

        // update member user groups in the circle
        await updateMemberUserGroups(member.userDid, circle._id ?? "", newUserGroups);

        // clear page cache so page update
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}${page?.handle}`);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to update user groups. " + error?.toString() };
    }
};
