"use server";

import { getCircleById, getCirclePath, updateCircle } from "@/lib/data/circle";
import { Circle, FormSubmitResponse } from "@/models/models";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { isFile, saveFile } from "@/lib/data/storage";

export async function saveAbout(values: {
    _id: any;
    name?: string;
    handle?: string;
    description?: string;
    content?: string;
    mission?: string;
    picture?: any;
    cover?: any;
    isPublic?: boolean;
    location?: any;
}): Promise<FormSubmitResponse> {
    console.log("Saving circle about with values", values);

    let circle: Partial<Circle> = {
        _id: values._id,
        name: values.name,
        handle: values.handle,
        description: values.description,
        content: values.content,
        mission: values.mission,
        isPublic: values.isPublic,
        location: values.location,
    };

    // check if user is authorized to edit circle settings
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to edit circle settings" };
    }

    let authorized = await isAuthorized(userDid, circle._id ?? "", features.settings.edit_about);
    try {
        if (!authorized) {
            return { success: false, message: "You are not authorized to edit circle settings" };
        }

        // make sure the circle exists
        let existingCircle = await getCircleById(values._id);
        if (!existingCircle) {
            throw new Error("Circle not found");
        }

        // Handle image uploads
        if (isFile(values.picture)) {
            // save the picture and get the file info
            circle.picture = await saveFile(values.picture, "picture", values._id, true);
            revalidatePath(circle.picture.url);
        }

        if (isFile(values.cover)) {
            // save the cover and get the file info
            circle.cover = await saveFile(values.cover, "cover", values._id, true);
            revalidatePath(circle.cover.url);
        }

        // update the circle
        await updateCircle(circle);

        // clear page cache
        let circlePath = await getCirclePath(circle);
        revalidatePath(`${circlePath}settings/about`);
        revalidatePath(circlePath); // revalidate home page too

        return { success: true, message: "Circle about saved successfully" };
    } catch (error) {
        if (error instanceof Error) {
            return { success: false, message: error.message };
        } else {
            return { success: false, message: "Failed to save circle about. " + JSON.stringify(error) };
        }
    }
}
