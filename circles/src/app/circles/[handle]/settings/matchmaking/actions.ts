"use server";

import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { inspectInputBounds } from "@/lib/security/bounded-input";

export async function saveMatchmaking(values: {
    _id: any;
    causes?: string[];
    skills?: string[];
}): Promise<FormSubmitResponse> {
    if (
        inspectInputBounds(values) ||
        (values.causes && values.causes.length > 100) ||
        (values.skills && values.skills.length > 100)
    ) {
        return { success: false, message: "Invalid input: too many causes or skills" };
    }

    // check if user is authorized to edit circle settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    let authorized = await isAuthorized(userDid, values._id ?? "", features.settings.edit_causes_and_skills);
    try {
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // make sure the circle exists
        let existingCircle = await getCircleById(values._id);
        if (!existingCircle) {
            throw new Error("Circle not found");
        }

        let circle: Partial<Circle> = {
            _id: values._id,
            causes: values.causes,
            skills: values.skills,
        };

        if (existingCircle.circleType === "user" && values.skills) {
            circle.offers = {
                ...(existingCircle.offers || {}),
                skills: values.skills,
                visibility: existingCircle.offers?.visibility ?? "public",
            };
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
