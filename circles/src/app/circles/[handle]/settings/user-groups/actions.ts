"use server";

import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse, UserGroup } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";

export async function saveUserGroups(values: { _id: any; userGroups: UserGroup[] }): Promise<FormSubmitResponse> {
    console.log("Saving circle user groups with values", values);

    let circle: Partial<Circle> = {
        _id: values._id,
        userGroups: values.userGroups,
    };

    // check if user is authorized to edit circle settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_user_groups);
    try {
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // make sure the circle exists
        let existingCircle = await getCircleById(values._id);
        if (!existingCircle) {
            throw new Error("Circle not found");
        }

        // Preserve readOnly status from existing user groups
        if (existingCircle.userGroups && circle.userGroups) {
            circle.userGroups = circle.userGroups.map((ug) => {
                const existingUserGroup = existingCircle.userGroups?.find((eug) => eug.handle === ug.handle);
                if (existingUserGroup?.readOnly) {
                    return { ...ug, readOnly: true };
                }
                return ug;
            });
        }

        // update the circle
        await updateCircle(circle);

        // clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}settings/user-groups`);

        return { success: true, message: "Circle user groups saved successfully" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle user groups. " + JSON.stringify(error) };
        }
    }
}
