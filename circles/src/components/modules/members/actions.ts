// members/actions.ts - Server actions around memberships
"use server";

import { getAuthenticatedUserDid, getMemberAccessLevel, hasHigherAccess, isAuthorized } from "@/lib/auth/auth";
import { getCircleById, getCirclePath } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { countAdmins, getMember, removeMember, updateMemberUserGroups } from "@/lib/data/member";
import { safeModifyMemberUserGroups } from "@/lib/utils";
import { Circle, MemberDisplay } from "@/models/models";
import { revalidatePath } from "next/cache";

type RemoveMemberResponse = {
    success: boolean;
    message?: string;
};

export const removeMemberAction = async (member: MemberDisplay, circle: Circle): Promise<RemoveMemberResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to remove a member" };
    }

    try {
        // confirm the user is authorized to remove member
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.general.remove_lower_members);
        let canRemoveSameLevel = await isAuthorized(
            userDid,
            circle._id ?? "",
            features.general.edit_same_level_user_groups,
        );

        if (!authorized && !canRemoveSameLevel) {
            return { success: false, message: "You are not authorized to remove this member" };
        }
        authorized = await hasHigherAccess(userDid, member.userDid, circle._id ?? "", canRemoveSameLevel);
        if (!authorized) {
            return { success: false, message: "You don't have high enough access to remove this member" };
        }

        // make sure last admin isn't removed
        const isAdmin = member.userGroups?.includes("admins");
        if (isAdmin) {
            const adminCount = await countAdmins(circle._id ?? "");
            if (adminCount <= 1) {
                return { success: false, message: "Cannot remove the last admin." };
            }
        }

        // remove member from circle
        await removeMember(member.userDid, circle._id ?? "");

        // clear page cache so page update
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}followers`);

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
): Promise<UpdateUserGroupsResponse> => {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to update user groups" };
    }

    try {
        // confirm the user is authorized to edit user groups
        let authorized = await isAuthorized(userDid, circle._id ?? "", features.general.edit_lower_user_groups);
        let canEditSameLevel = await isAuthorized(
            userDid,
            circle._id ?? "",
            features.general.edit_same_level_user_groups,
        );
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

        // make sure last admin isn't removed
        const isAdmin = existingMember.userGroups?.includes("admins");
        if (isAdmin && !newGroups.includes("admins")) {
            const adminCount = await countAdmins(circle._id ?? "");
            if (adminCount <= 1) {
                return { success: false, message: "Cannot remove the last admin." };
            }
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
        revalidatePath(`${circlePath}followers`);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to update user groups. " + error?.toString() };
    }
};
