"use server";

import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";

export async function saveMatchmaking(values: { _id: any; causes?: string[] }): Promise<FormSubmitResponse> {
    console.log("Saving circle matchmaking with values", values);

    let circle: Partial<Circle> = {
        _id: values._id,
        causes: values.causes,
    };

    // check if user is authorized to edit circle settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_causes_and_skills);
    try {
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // make sure the circle exists
        let existingCircle = await getCircleById(values._id);
        if (!existingCircle) {
            throw new Error("Circle not found");
        }

        // update the circle
        await updateCircle(circle, userDid);

        // clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}settings/matchmaking`);

        return { success: true, message: "Circle matchmaking saved successfully" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle matchmaking. " + JSON.stringify(error) };
        }
    }
}
