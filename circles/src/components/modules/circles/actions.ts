"use server";

import { getAuthenticatedUserDid, getMemberAccessLevel, hasHigherAccess, isAuthorized } from "@/lib/auth/auth";
import { verifyUserToken } from "@/lib/auth/jwt";
import { getCircleById, getCirclePath } from "@/lib/data/circle";
import { features } from "@/lib/data/constants";
import { countAdmins, getMember, removeMember, updateMemberUserGroups } from "@/lib/data/member";
import { safeModifyAccessRules, safeModifyMemberUserGroups } from "@/lib/utils";
import { Circle, MemberDisplay, Page } from "@/models/models";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

type RemoveSubCircleResponse = {
    success: boolean;
    message?: string;
};

export const removeSubCircleAction = async (
    circle: Circle,
    parentCircle: Circle,
    page: Page,
): Promise<RemoveSubCircleResponse> => {
    try {
        const userDid = await getAuthenticatedUserDid();

        // confirm the user is authorized to remove member
        let authorized = await isAuthorized(userDid, parentCircle._id ?? "", features.delete_lower_subcircles);
        let canRemoveSameLevel = await isAuthorized(
            userDid,
            parentCircle._id ?? "",
            features.delete_same_level_subcircles,
        );

        if (!authorized && !canRemoveSameLevel) {
            return { success: false, message: "You are not authorized to remove this subcircle" };
        }
        // TODO check if user has higher access than the circle
        authorized = await hasHigherAccess(userDid, circle.userDid, parentCircle._id ?? "", canRemoveSameLevel);
        if (!authorized) {
            return { success: false, message: "You don't have high enough access to remove this subcircle" };
        }

        // TODO delete circle

        // clear page cache so page update
        let circlePath = await getCirclePath(parentCircle);
        revalidatePath(`${circlePath}${page?.handle}`);

        return { success: true };
    } catch (error) {
        return { success: false, message: "Failed to remove member. " + error?.toString() };
    }
};
