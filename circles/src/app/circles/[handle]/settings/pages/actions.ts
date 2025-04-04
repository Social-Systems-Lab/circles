"use server";

import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";

export async function savePages(values: { _id: any; enabledModules: string[] }): Promise<FormSubmitResponse> {
    console.log("Saving circle modules with values", values);

    let circle: Partial<Circle> = {
        _id: values._id,
        enabledModules: values.enabledModules,
    };

    // check if user is authorized to edit circle settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_pages);
    try {
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // make sure the circle exists
        let existingCircle = await getCircleById(values._id);
        if (!existingCircle) {
            throw new Error("Circle not found");
        }

        // Make sure general and settings modules are always enabled
        if (!circle.enabledModules?.includes("general")) {
            circle.enabledModules = [...(circle.enabledModules || []), "general"];
        }
        if (!circle.enabledModules?.includes("settings")) {
            circle.enabledModules = [...(circle.enabledModules || []), "settings"];
        }

        // update the circle
        await updateCircle(circle);

        // clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}`);
        revalidatePath(`${circlePath}/settings/pages`);

        return { success: true, message: "Circle modules saved successfully" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle modules. " + JSON.stringify(error) };
        }
    }
}
